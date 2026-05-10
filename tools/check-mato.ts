import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();
  const r = await db.execute<any>(sql`
    SELECT id, slug, normalized_title, total_chapters, source_id, source_name, source_url, cover_path, cover_source_url
    FROM manga.series
    WHERE slug ILIKE '%mato-seihei%' OR title ILIKE '%mato seihei%'
  `);
  console.log(JSON.stringify(r, null, 2));
  await closePgDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
