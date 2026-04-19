import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });
const { getPgDb, pgSchema } = await import('@yomiru/db');
const { sql } = await import('drizzle-orm');

const db = getPgDb();
const rows = await db.select().from(pgSchema.series).where(sql`title IN ('El caballero de la joven dama','Acosado por mujeres','Reencarné como el duque villano','JIRAI GURIKO')`);
for (const r of rows) {
  console.log(`${r.title}`);
  console.log(`  altTitles=${JSON.stringify(r.altTitles)}`);
  console.log(`  description(200)=${(r.description ?? '').slice(0, 200)}`);
}
process.exit(0);
