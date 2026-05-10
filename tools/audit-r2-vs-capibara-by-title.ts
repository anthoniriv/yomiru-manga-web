import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

async function main() {
  const db = getPgDb();

  // Classify each series by where its pages live
  const titleDup = await db.execute<any>(sql`
    WITH series_kind AS (
      SELECT s.id, s.title, s.normalized_title, s.source_name,
        BOOL_OR(p.storage_path IS NOT NULL) AS has_r2,
        BOOL_OR(p.storage_path IS NULL AND p.source_url ILIKE '%capibara%') AS has_capibara,
        COUNT(p.id) FILTER (WHERE p.storage_path IS NOT NULL) AS r2_pages,
        COUNT(p.id) FILTER (WHERE p.storage_path IS NULL AND p.source_url ILIKE '%capibara%') AS capi_pages
      FROM manga.series s
      LEFT JOIN manga.chapters c ON c.series_id = s.id
      LEFT JOIN manga.pages p ON p.chapter_id = c.id
      GROUP BY s.id
    )
    SELECT
      LOWER(BTRIM(normalized_title)) AS norm,
      BOOL_OR(has_r2) AS any_r2,
      BOOL_OR(has_capibara) AS any_capi,
      COUNT(*) AS series_rows,
      SUM(r2_pages) AS r2_pages_total,
      SUM(capi_pages) AS capi_pages_total,
      ARRAY_AGG(json_build_object(
        'id', id, 'title', title, 'source', source_name,
        'r2_pages', r2_pages, 'capi_pages', capi_pages
      ) ORDER BY r2_pages DESC) AS rows
    FROM series_kind
    WHERE normalized_title IS NOT NULL
    GROUP BY LOWER(BTRIM(normalized_title))
    HAVING BOOL_OR(has_r2) AND BOOL_OR(has_capibara)
    ORDER BY SUM(r2_pages) DESC
    LIMIT 40;
  `);
  console.log('=== titles present in BOTH R2 and capibara (top 40 by R2 pages) ===');
  console.log(JSON.stringify(titleDup, null, 2));

  const overall = await db.execute<any>(sql`
    WITH series_kind AS (
      SELECT s.id, LOWER(BTRIM(s.normalized_title)) AS norm,
        BOOL_OR(p.storage_path IS NOT NULL) AS has_r2,
        BOOL_OR(p.storage_path IS NULL AND p.source_url ILIKE '%capibara%') AS has_capi,
        COUNT(p.id) FILTER (WHERE p.storage_path IS NOT NULL) AS r2_pages
      FROM manga.series s
      LEFT JOIN manga.chapters c ON c.series_id = s.id
      LEFT JOIN manga.pages p ON p.chapter_id = c.id
      GROUP BY s.id
    ),
    by_title AS (
      SELECT norm,
        BOOL_OR(has_r2) AS any_r2,
        BOOL_OR(has_capi) AS any_capi,
        SUM(r2_pages) AS r2_pages_total
      FROM series_kind
      WHERE norm IS NOT NULL
      GROUP BY norm
    )
    SELECT
      COUNT(*) FILTER (WHERE any_r2 AND any_capi)               AS titles_in_both,
      COUNT(*) FILTER (WHERE any_r2 AND NOT any_capi)           AS titles_r2_only,
      COUNT(*) FILTER (WHERE any_capi AND NOT any_r2)           AS titles_capi_only,
      SUM(r2_pages_total) FILTER (WHERE any_r2 AND any_capi)    AS r2_pages_in_dup_titles,
      SUM(r2_pages_total) FILTER (WHERE any_r2 AND NOT any_capi) AS r2_pages_unique_to_r2
    FROM by_title;
  `);
  console.log('=== title-level overall ===');
  console.log(JSON.stringify(overall, null, 2));

  await closePgDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
