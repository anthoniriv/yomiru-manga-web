import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb, pgSchema } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();
  const r = await db.execute<{
    title: string; chapter_count: number; pages_count: number;
    pages_with_storage: number; cover_url: string | null;
  }>(sql`
    SELECT s.title, s.cover_source_url AS cover_url,
      (SELECT COUNT(*) FROM manga.chapters c WHERE c.series_id=s.id) AS chapter_count,
      (SELECT COUNT(*) FROM manga.pages p JOIN manga.chapters c ON p.chapter_id=c.id WHERE c.series_id=s.id) AS pages_count,
      (SELECT COUNT(*) FROM manga.pages p JOIN manga.chapters c ON p.chapter_id=c.id WHERE c.series_id=s.id AND p.storage_path IS NOT NULL) AS pages_with_storage
    FROM manga.series s
    WHERE s.source_name='capibaratraductor.com'
    ORDER BY s.created_at DESC
    LIMIT 5
  `);
  console.log(JSON.stringify(r, null, 2));
  await closePgDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
