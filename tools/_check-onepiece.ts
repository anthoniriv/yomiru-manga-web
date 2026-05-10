import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();
  const r = await db.execute<any>(sql`
    SELECT s.id, s.title, s.normalized_title, s.source_name, s.source_url,
      (SELECT COUNT(*) FROM manga.chapters c WHERE c.series_id = s.id) AS chapters,
      (SELECT COUNT(*) FROM manga.pages p JOIN manga.chapters c ON p.chapter_id=c.id WHERE c.series_id = s.id AND p.storage_path IS NOT NULL) AS r2_pages,
      (SELECT COUNT(*) FROM manga.pages p JOIN manga.chapters c ON p.chapter_id=c.id WHERE c.series_id = s.id AND p.storage_path IS NULL AND p.source_url ILIKE '%capibara%') AS capi_pages
    FROM manga.series s
    WHERE s.title ILIKE '%one piece%' OR s.title ILIKE '%naruto%' OR s.title ILIKE '%berserk%' OR s.title ILIKE '%jujutsu%'
    ORDER BY s.title
  `);
  console.log(JSON.stringify(r, null, 2));
  await closePgDb();
}
main();
