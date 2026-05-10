import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();
  const r = await db.execute<{ id: string; title: string; total_chapters: number; chap_count: string; page_count: string }>(sql`
    SELECT s.id, s.title, s.total_chapters,
      (SELECT COUNT(*) FROM manga.chapters WHERE series_id = s.id)::text AS chap_count,
      (SELECT COUNT(*) FROM manga.pages p JOIN manga.chapters c ON p.chapter_id = c.id WHERE c.series_id = s.id)::text AS page_count
    FROM manga.series s
    WHERE s.title ILIKE '%mikadono%'
  `);
  console.log(JSON.stringify(r, null, 2));
  await closePgDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
