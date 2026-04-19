import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });

const { getPgDb, pgSchema } = await import('@yomiru/db');
const { sql, eq } = await import('drizzle-orm');
const { findMalForSeries } = await import('../apps/web/src/lib/mal.ts');

const { series, seriesGenres, chapters } = pgSchema;
const db = getPgDb();

const onlySlug = process.argv[2];

const baseWhere = sql`${series.id} IN (SELECT DISTINCT series_id FROM ${chapters} WHERE download_status='completed')`;

const rows = onlySlug
  ? await db.select().from(series).where(eq(series.slug, onlySlug))
  : await db.select().from(series).where(baseWhere);

console.log(`[info] processing ${rows.length} series${onlySlug ? ` (slug=${onlySlug})` : ''}`);

let ok = 0, miss = 0, err = 0;
for (const row of rows) {
  const alt = Array.isArray(row.altTitles) ? (row.altTitles as string[]) : [];
  try {
    const mal = await findMalForSeries(row.title, alt);
    if (!mal) {
      miss++;
      console.log(`MISS ${row.title}`);
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
    console.log(`OK   ${row.title} → ${mal.title} [${mal.status} ${mal.year}] ${genres.slice(0,4).join(',')}`);
  } catch (e) {
    err++;
    console.log(`ERR  ${row.title} ${String(e)}`);
  }
  await new Promise((r) => setTimeout(r, 1100));
}

console.log(`\n[done] ok=${ok} miss=${miss} err=${err} total=${rows.length}`);
process.exit(0);
