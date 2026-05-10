import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();

  const pageSummary = await db.execute<any>(sql`
    SELECT
      COUNT(*) FILTER (WHERE storage_path IS NOT NULL)                                              AS r2_pages,
      COUNT(*) FILTER (WHERE storage_path IS NULL AND source_url ILIKE '%capibara%')                AS capibara_pages,
      COUNT(*) FILTER (WHERE storage_path IS NULL AND source_url NOT ILIKE '%capibara%')            AS other_hotlink_pages,
      COUNT(*) FILTER (WHERE storage_path IS NULL AND source_url IS NULL)                           AS null_both,
      COUNT(*)                                                                                      AS total_pages,
      COUNT(DISTINCT storage_path) FILTER (WHERE storage_path IS NOT NULL)                          AS distinct_r2_keys
    FROM manga.pages;
  `);
  console.log('=== page-level summary ===');
  console.log(JSON.stringify(pageSummary, null, 2));

  const chapterSummary = await db.execute<any>(sql`
    WITH cs AS (
      SELECT c.series_id, c.number, c.id AS chapter_id,
        BOOL_OR(p.storage_path IS NOT NULL) AS has_r2,
        BOOL_OR(p.storage_path IS NULL AND p.source_url ILIKE '%capibara%') AS has_capibara
      FROM manga.chapters c
      JOIN manga.pages p ON p.chapter_id = c.id
      GROUP BY c.series_id, c.number, c.id
    )
    SELECT
      COUNT(*)                                              AS total_chapters,
      COUNT(*) FILTER (WHERE has_r2 AND has_capibara)       AS dup_r2_and_capibara,
      COUNT(*) FILTER (WHERE has_r2 AND NOT has_capibara)   AS r2_only,
      COUNT(*) FILTER (WHERE has_capibara AND NOT has_r2)   AS capibara_only
    FROM cs;
  `);
  console.log('=== chapter-level summary ===');
  console.log(JSON.stringify(chapterSummary, null, 2));

  // Series-level dedup: same (series_id, number) appearing in BOTH a R2 chapter AND a capibara chapter (different chapter rows)
  const dupAcrossChapters = await db.execute<any>(sql`
    WITH per_chapter AS (
      SELECT c.series_id, c.number, c.id AS chapter_id,
        BOOL_OR(p.storage_path IS NOT NULL) AS has_r2,
        BOOL_OR(p.storage_path IS NULL AND p.source_url ILIKE '%capibara%') AS has_capibara
      FROM manga.chapters c
      JOIN manga.pages p ON p.chapter_id = c.id
      GROUP BY c.series_id, c.number, c.id
    ),
    per_number AS (
      SELECT series_id, number,
        BOOL_OR(has_r2) AS any_r2,
        BOOL_OR(has_capibara) AS any_capibara
      FROM per_chapter
      GROUP BY series_id, number
    )
    SELECT
      COUNT(*) FILTER (WHERE any_r2 AND any_capibara)       AS dup_number_r2_and_capibara,
      COUNT(*) FILTER (WHERE any_r2 AND NOT any_capibara)   AS r2_only_numbers,
      COUNT(*) FILTER (WHERE any_capibara AND NOT any_r2)   AS capibara_only_numbers
    FROM per_number;
  `);
  console.log('=== (series, number) dedup summary ===');
  console.log(JSON.stringify(dupAcrossChapters, null, 2));

  const topDupSeries = await db.execute<any>(sql`
    WITH per_chapter AS (
      SELECT c.series_id, c.number,
        BOOL_OR(p.storage_path IS NOT NULL) AS has_r2,
        BOOL_OR(p.storage_path IS NULL AND p.source_url ILIKE '%capibara%') AS has_capibara
      FROM manga.chapters c
      JOIN manga.pages p ON p.chapter_id = c.id
      GROUP BY c.series_id, c.number, c.id
    ),
    per_number AS (
      SELECT series_id, number,
        BOOL_OR(has_r2) AS any_r2,
        BOOL_OR(has_capibara) AS any_capibara
      FROM per_chapter
      GROUP BY series_id, number
    )
    SELECT s.id, s.title, s.source_name,
      COUNT(*) FILTER (WHERE any_r2 AND any_capibara) AS dup_numbers,
      COUNT(*) FILTER (WHERE any_r2 AND NOT any_capibara) AS r2_only_numbers,
      COUNT(*) FILTER (WHERE any_capibara) AS capibara_numbers
    FROM per_number pn
    JOIN manga.series s ON s.id = pn.series_id
    GROUP BY s.id, s.title, s.source_name
    HAVING COUNT(*) FILTER (WHERE any_r2 AND any_capibara) > 0
    ORDER BY dup_numbers DESC
    LIMIT 30;
  `);
  console.log('=== top series with duplicate numbers (R2 + capibara) ===');
  console.log(JSON.stringify(topDupSeries, null, 2));

  const r2OnlySeries = await db.execute<any>(sql`
    SELECT s.id, s.title, s.source_name,
      COUNT(DISTINCT c.id) AS chapters,
      COUNT(p.id) FILTER (WHERE p.storage_path IS NOT NULL) AS r2_pages
    FROM manga.series s
    JOIN manga.chapters c ON c.series_id = s.id
    JOIN manga.pages p ON p.chapter_id = c.id
    WHERE NOT EXISTS (
      SELECT 1 FROM manga.chapters c2
      JOIN manga.pages p2 ON p2.chapter_id = c2.id
      WHERE c2.series_id = s.id
        AND p2.storage_path IS NULL
        AND p2.source_url ILIKE '%capibara%'
    )
    AND p.storage_path IS NOT NULL
    GROUP BY s.id, s.title, s.source_name
    ORDER BY r2_pages DESC
    LIMIT 20;
  `);
  console.log('=== top R2-only series (capibara has nothing for these) ===');
  console.log(JSON.stringify(r2OnlySeries, null, 2));

  await closePgDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
