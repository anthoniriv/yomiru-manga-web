import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();
  const r = await db.execute<any>(sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE total_chapters = 0) AS empty_chapters,
      COUNT(*) FILTER (WHERE total_chapters > 0) AS with_chapters
    FROM manga.series WHERE source_name = 'capibaratraductor.com'
  `);
  const rows: any = (Array.isArray(r) ? r : (r as any).rows ?? []);
  console.log('overall:', rows[0]);

  const pages = await db.execute<any>(sql`
    SELECT
      COUNT(DISTINCT s.id) AS series_with_chapters_no_pages
    FROM manga.series s
    WHERE s.source_name = 'capibaratraductor.com'
      AND s.total_chapters > 0
      AND NOT EXISTS (
        SELECT 1 FROM manga.pages p
        JOIN manga.chapters c ON p.chapter_id = c.id
        WHERE c.series_id = s.id
      )
  `);
  const pr: any = (Array.isArray(pages) ? pages : (pages as any).rows ?? []);
  console.log('series with chapters but 0 pages:', pr[0]);

  const sample = await db.execute<any>(sql`
    SELECT s.title, s.total_chapters, s.source_id
    FROM manga.series s
    WHERE s.source_name = 'capibaratraductor.com'
      AND s.total_chapters > 0
      AND NOT EXISTS (SELECT 1 FROM manga.pages p JOIN manga.chapters c ON p.chapter_id = c.id WHERE c.series_id = s.id)
    LIMIT 30
  `);
  const sr: any = (Array.isArray(sample) ? sample : (sample as any).rows ?? []);
  console.log('\nsample (chapters but 0 pages):');
  for (const x of sr) console.log(`  [${x.source_id}] ${x.title} (${x.total_chapters} chapters)`);

  await closePgDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
