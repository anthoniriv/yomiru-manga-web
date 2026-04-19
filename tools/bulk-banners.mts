import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });

const { getPgDb, pgSchema } = await import('@yomiru/db');
const { sql, eq, and, isNull } = await import('drizzle-orm');
const { r2Upload } = await import('@yomiru/r2');
const { findBannerForSeries } = await import('../apps/web/src/lib/anilist.ts');

const { series, chapters } = pgSchema;
const db = getPgDb();

// Only enriched series (have rating from MAL) + no banner yet
const rows = await db.select().from(series).where(
  and(
    isNull(series.bannerPath),
    sql`${series.id} IN (SELECT DISTINCT series_id FROM ${chapters} WHERE download_status='completed')`,
  ),
);

console.log(`[info] procesando ${rows.length} series sin banner`);

let ok = 0, miss = 0, err = 0;
for (const row of rows) {
  const alt = Array.isArray(row.altTitles) ? (row.altTitles as string[]) : [];
  try {
    const hit = await findBannerForSeries(row.title, alt);
    if (!hit?.bannerImage) {
      miss++;
      console.log(`MISS ${row.title}`);
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    const res = await fetch(hit.bannerImage, { headers: { 'User-Agent': 'yomiru/1.0' } });
    if (!res.ok) {
      err++;
      console.log(`ERR  ${row.title} fetch ${res.status}`);
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const key = `manga/${row.slug}/banner.${ext}`;
    await r2Upload(key, buf, ct);
    await db.update(series).set({
      bannerPath: key,
      bannerSourceUrl: hit.bannerImage,
      updatedAt: new Date(),
    }).where(eq(series.id, row.id));
    ok++;
    console.log(`OK   ${row.title}`);
  } catch (e) {
    err++;
    console.log(`ERR  ${row.title} ${String(e).slice(0, 100)}`);
  }
  await new Promise((r) => setTimeout(r, 700));
}

console.log(`\n[done] ok=${ok} miss=${miss} err=${err} total=${rows.length}`);
process.exit(0);
