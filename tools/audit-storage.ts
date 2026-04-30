import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb, pgSchema } from '../packages/db/src/index.js';

async function main() {
  const db = getPgDb();
  const { series, chapters, pages } = pgSchema;

  const totals = await db.execute<{
    series_total: number; chapters_total: number; chapters_completed: number;
    pages_total: number; pages_in_r2: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM manga.series)                                                  AS series_total,
      (SELECT COUNT(*) FROM manga.chapters)                                                AS chapters_total,
      (SELECT COUNT(*) FROM manga.chapters WHERE download_status = 'completed')            AS chapters_completed,
      (SELECT COUNT(*) FROM manga.pages)                                                   AS pages_total,
      (SELECT COUNT(*) FROM manga.pages WHERE storage_path IS NOT NULL)                    AS pages_in_r2
  `);
  console.log('TOTALS:', JSON.stringify(totals, null, 2));

  console.log('\nrunning by-source aggregation...');
  const bySource = await db.execute<{
    source_name: string; series_count: number; series_with_r2_cover: number;
  }>(sql`
    SELECT
      source_name,
      COUNT(*) AS series_count,
      COUNT(*) FILTER (WHERE cover_path IS NOT NULL) AS series_with_r2_cover
    FROM manga.series
    GROUP BY source_name
    ORDER BY series_count DESC
  `);

  console.log('\nrunning series-with-pages...');
  const withPages = await db.execute<{ source_name: string; series_with_r2_pages: number }>(sql`
    SELECT s.source_name, COUNT(DISTINCT s.id) AS series_with_r2_pages
    FROM manga.series s
    JOIN manga.chapters c ON c.series_id = s.id
    JOIN manga.pages    p ON p.chapter_id = c.id
    WHERE p.storage_path IS NOT NULL
    GROUP BY s.source_name
  `);
  const withPagesByName = new Map(
    ((Array.isArray(withPages) ? withPages : (withPages as any).rows) ?? []).map(
      (r: any) => [r.source_name, Number(r.series_with_r2_pages)] as const,
    ),
  );
  console.log('\nBY SOURCE:');
  const rows: any = Array.isArray(bySource) ? bySource : (bySource as any).rows ?? [];
  for (const r of rows) {
    const wp = withPagesByName.get(r.source_name) ?? 0;
    console.log(`  ${String(r.source_name).padEnd(35)} series=${r.series_count}  with_pages=${wp}  with_cover=${r.series_with_r2_cover}`);
  }
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
