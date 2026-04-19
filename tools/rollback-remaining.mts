import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });
const { getPgDb, pgSchema } = await import('@yomiru/db');
const { sql, eq, or, ilike } = await import('drizzle-orm');

const db = getPgDb();
const { series, seriesGenres } = pgSchema;

// Remaining bad matches — titles that are clearly Spanish fan-translations
// but got matched via spurious alt_title overlap to wrong MAL entry
const BAD_TITLES = [
  '¿Te amo?',
  'Rasistas marine',
  'Alguien como tú',
  'El caballero de la joven dama',
  'Flor de cerezo blanco, mi diferente yo',
  'Reencarné como el duque villano',
  'Acosado por mujeres',
  'JIRAI GURIKO',
  'El gran jefe baja de la montaña: comenzando como secretario',
  'FUI LA ÚNICA QUE NO SABÍA QUE LA VILLANA ERA UN HOMBRE',
  '¡Tú, por favor, sé mi doble!',
  'Amor borracho',
  'Es tonto... pero lindo',
  'Noche blanca',
  'Let’s Have A Drink!',
];

const rows = await db.select().from(series).where(
  or(...BAD_TITLES.map((t) => eq(series.title, t)))!,
);
console.log(`[info] targeted rollback: ${rows.length} series`);

for (const r of rows) {
  await db.delete(seriesGenres).where(eq(seriesGenres.seriesId, r.id));
  await db.update(series).set({
    status: 'unknown',
    year: null,
    rating: null,
    voteCount: 0,
    author: null,
    description: null,
    updatedAt: new Date(),
  }).where(eq(series.id, r.id));
  console.log(`  cleaned ${r.title}`);
}
console.log('[done]');
process.exit(0);
