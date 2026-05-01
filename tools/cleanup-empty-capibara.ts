import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();

  // Find all capibara series that are unusable: zero chapters OR chapters with zero pages
  const targets = await db.execute<{ id: string; title: string; total_chapters: number }>(sql`
    SELECT s.id, s.title, s.total_chapters
    FROM manga.series s
    WHERE s.source_name = 'capibaratraductor.com'
      AND (
        s.total_chapters = 0
        OR NOT EXISTS (
          SELECT 1 FROM manga.pages p
          JOIN manga.chapters c ON p.chapter_id = c.id
          WHERE c.series_id = s.id
        )
      )
  `);
  const rows: any[] = (Array.isArray(targets) ? targets : (targets as any).rows ?? []);
  console.log(`[cleanup] ${rows.length} unusable capibara series`);

  for (const r of rows) {
    await db.execute(sql`DELETE FROM manga.pages WHERE chapter_id IN (SELECT id FROM manga.chapters WHERE series_id = ${r.id})`);
    await db.execute(sql`DELETE FROM manga.chapters WHERE series_id = ${r.id}`);
    await db.execute(sql`DELETE FROM manga.series WHERE id = ${r.id}`);
    console.log(`  deleted: ${r.title} (${r.total_chapters} cap)`);
  }
  console.log(`[cleanup] done — ${rows.length} series removed`);
  await closePgDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
