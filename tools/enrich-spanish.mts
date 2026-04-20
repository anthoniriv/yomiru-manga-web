import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });

const { getPgDb, pgSchema } = await import('@yomiru/db');
const { sql, eq, and, isNull } = await import('drizzle-orm');
const { findMalForSeries } = await import('../apps/web/src/lib/mal.ts');

const { series, seriesGenres, chapters } = pgSchema;
const db = getPgDb();

async function translateEs2En(text: string): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const segments = Array.isArray(data?.[0]) ? data[0] : [];
    const translated = segments.map((s: any) => s?.[0]).filter(Boolean).join('').trim();
    return translated || null;
  } catch {
    return null;
  }
}

// Candidates: series with completed chapters but no rating (failed/missed enrichment)
const rows = await db.select().from(series).where(
  and(
    sql`${series.id} IN (SELECT DISTINCT series_id FROM ${chapters} WHERE download_status='completed')`,
    isNull(series.rating),
  ),
);

console.log(`[info] procesando ${rows.length} series sin enrichment`);

let ok = 0, miss = 0, err = 0;
for (const row of rows) {
  try {
    const translated = await translateEs2En(row.title);
    if (!translated || translated.toLowerCase() === row.title.toLowerCase()) {
      miss++;
      console.log(`SKIP ${row.title}`);
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    const mal = await findMalForSeries(translated, []);
    if (!mal) {
      miss++;
      console.log(`MISS ${row.title} [en: ${translated}]`);
      await new Promise((r) => setTimeout(r, 1100));
      continue;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (mal.score != null) patch.rating = mal.score;
    if (mal.scoredBy) patch.voteCount = mal.scoredBy;
    if (mal.year != null) patch.year = mal.year;
    if (mal.authors.length > 0) patch.author = mal.authors[0];
    if (mal.synopsis) patch.description = mal.synopsis;
    if (mal.status !== 'unknown') patch.status = mal.status;
    if (mal.isAdult) patch.isAdult = true;
    if (mal.coverUrl) patch.coverSourceUrl = mal.coverUrl;

    await db.update(series).set(patch).where(eq(series.id, row.id));
    await db.delete(seriesGenres).where(eq(seriesGenres.seriesId, row.id));
    const genres = [...new Set([...mal.genres, ...mal.themes, ...mal.demographics])];
    if (genres.length > 0) {
      await db
        .insert(seriesGenres)
        .values(genres.map((g) => ({ seriesId: row.id, genre: g })))
        .onConflictDoNothing();
    }
    ok++;
    console.log(`OK   ${row.title} → [en: ${translated}] → ${mal.title} [${mal.status} ${mal.year}] ${genres.slice(0,4).join(',')}`);
  } catch (e) {
    err++;
    console.log(`ERR  ${row.title} ${String(e).slice(0, 100)}`);
  }
  await new Promise((r) => setTimeout(r, 1100));
}

console.log(`\n[done] ok=${ok} miss=${miss} err=${err} total=${rows.length}`);
process.exit(0);
