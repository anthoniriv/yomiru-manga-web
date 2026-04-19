import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });
const { getPgDb, pgSchema } = await import('@yomiru/db');
const { sql, eq } = await import('drizzle-orm');
const { r2Delete } = await import('@yomiru/r2');

const db = getPgDb();
const { series } = pgSchema;

// Wipe banner for Spanish-titled series or those with alt_titles "es" leak
// — same heuristic as enrich rollback
const rows = await db.execute<{ id: string; title: string; banner_path: string }>(sql`
  SELECT id, title, banner_path FROM manga.series
  WHERE banner_path IS NOT NULL
    AND (
      title ~ '[áéíóúñÑÁÉÍÓÚ¿¡]'
      OR alt_titles::text ILIKE '%"es"%'
    )
`);
const list = (rows as any).rows ?? rows;
console.log(`[info] candidates: ${list.length}`);

for (const r of list) {
  try { await r2Delete(r.banner_path); } catch {}
  await db.update(series).set({
    bannerPath: null,
    bannerSourceUrl: null,
    updatedAt: new Date(),
  }).where(eq(series.id, r.id));
  console.log(`  wiped ${r.title}`);
}
console.log('[done]');
process.exit(0);
