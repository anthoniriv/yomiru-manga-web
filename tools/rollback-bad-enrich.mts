import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });
const { getPgDb, pgSchema } = await import('@yomiru/db');
const { sql, eq, and } = await import('drizzle-orm');

const db = getPgDb();
const { series, seriesGenres } = pgSchema;

// Series whose title has Spanish-specific chars OR alt_titles contains 'es' locale leak
// → estos son candidatos a ser mal enriquecidos
// Target series likely mis-enriched:
// - Title has Spanish diacritics/punctuation (¡¿ñáéíóú) → definitely Spanish
// - OR alt_titles contains the locale leak "es" (scraper bug that caused E's matches)
// - AND updated_at is within last 4h (our bulk run)
const rows = await db.execute<{ id: string; title: string }>(sql`
  SELECT id, title FROM manga.series
  WHERE updated_at > NOW() - INTERVAL '4 hours'
    AND (
      title ~ '[áéíóúñÑÁÉÍÓÚ¿¡]'
      OR alt_titles::text ILIKE '%"es"%'
    )
`);

const list = (rows as any).rows ?? rows;
console.log(`[info] candidatos a rollback: ${list.length}`);

let cleaned = 0;
for (const r of list) {
  // Wipe genres (they came from MAL wrong match)
  await db.delete(seriesGenres).where(eq(seriesGenres.seriesId, r.id));
  // Reset status and year to defaults so UI doesn't lie
  await db.update(series).set({
    status: 'unknown',
    year: null,
    rating: null,
    voteCount: 0,
    author: null,
    description: null,
    updatedAt: new Date(),
  }).where(eq(series.id, r.id));
  cleaned++;
  if (cleaned % 20 === 0) console.log(`  ${cleaned}/${list.length}`);
}

console.log(`[done] ${cleaned} series rolled back`);
process.exit(0);
