/**
 * Migrates local SQLite content catalog → Supabase manga schema.
 * Safe to re-run — upserts on conflict.
 *
 * Usage:
 *   tsx tools/migrate-sqlite-to-supabase.ts
 *   tsx tools/migrate-sqlite-to-supabase.ts --dry-run
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { getPgDb, pgSchema } from '../packages/db/src/index.js';
import { sql } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 200;

const DB_PATH = resolve(process.env.YOMIRU_DB_PATH ?? './storage/yomiru.db');

// ── helpers ──────────────────────────────────────────────────────────────────

function ts(unixSec: number | null): Date | null {
  return unixSec ? new Date(unixSec * 1000) : null;
}

async function upsertBatch<T extends object>(
  label: string,
  rows: T[],
  table: any,
  onConflict: (q: any) => any,
) {
  if (rows.length === 0) return;
  if (DRY_RUN) { console.log(`  DRY  ${label}: ${rows.length}`); return; }
  const pg = getPgDb();
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await onConflict(pg.insert(table).values(chunk));
  }
  console.log(`  ✓  ${label}: ${rows.length}`);
}

async function main() {
  const sqlite = new Database(DB_PATH, { readonly: true });
  const pg = getPgDb();
  const { series, chapters, pages, seriesGenres, seriesTags } = pgSchema;

  // ── series ────────────────────────────────────────────────────────────────────

  const sqliteSeries = sqlite.prepare(`
    SELECT id, kind, slug, title, normalized_title, alt_titles,
           description, cover_path, cover_source_url,
           rating, vote_count, popularity, total_chapters, mirror_priority,
           status, content_rating, year, author, artist,
           source_name, source_url, source_id,
           last_synced_at, created_at, updated_at
    FROM series
  `).all() as any[];

  console.log(`Found ${sqliteSeries.length} series`);

  const pgSeriesRows = sqliteSeries.map((r) => ({
    id: r.id,
    kind: r.kind as 'manga' | 'book',
    slug: r.slug,
    title: r.title,
    normalizedTitle: r.normalized_title,
    altTitles: JSON.parse(r.alt_titles ?? '[]') as string[],
    description: r.description ?? null,
    coverPath: r.cover_path ?? null,
    coverSourceUrl: r.cover_source_url ?? null,
    rating: r.rating ?? null,
    voteCount: r.vote_count ?? 0,
    popularity: r.popularity ?? 0,
    totalChapters: r.total_chapters ?? 0,
    mirrorPriority: r.mirror_priority ?? 0,
    status: (r.status ?? 'unknown') as any,
    contentRating: r.content_rating ?? null,
    year: r.year ?? null,
    author: r.author ?? null,
    artist: r.artist ?? null,
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    sourceId: r.source_id ?? null,
    lastSyncedAt: ts(r.last_synced_at),
    createdAt: ts(r.created_at) ?? new Date(),
    updatedAt: ts(r.updated_at) ?? new Date(),
  }));

  await upsertBatch('series', pgSeriesRows, series, (q) =>
    q.onConflictDoNothing(),
  );

  // ── genres & tags ─────────────────────────────────────────────────────────────

  const sqliteGenres = sqlite.prepare('SELECT series_id, genre FROM series_genres').all() as any[];
  const sqliteTags = sqlite.prepare('SELECT series_id, tag FROM series_tags').all() as any[];

  await upsertBatch('series_genres', sqliteGenres.map((r) => ({ seriesId: r.series_id, genre: r.genre })), seriesGenres, (q) =>
    q.onConflictDoNothing(),
  );

  await upsertBatch('series_tags', sqliteTags.map((r) => ({ seriesId: r.series_id, tag: r.tag })), seriesTags, (q) =>
    q.onConflictDoNothing(),
  );

  // ── chapters ──────────────────────────────────────────────────────────────────

  const sqliteChapters = sqlite.prepare(`
    SELECT id, series_id, number, title, volume, language,
           page_count, source_url, source_chapter_id, published_at,
           download_status, download_error, downloaded_at, created_at
    FROM chapters
  `).all() as any[];

  console.log(`Found ${sqliteChapters.length} chapters`);

  const pgChapterRows = sqliteChapters.map((r) => ({
    id: r.id,
    seriesId: r.series_id,
    number: r.number,
    title: r.title ?? null,
    volume: r.volume ?? null,
    language: r.language ?? 'es',
    pageCount: r.page_count ?? null,
    sourceUrl: r.source_url,
    sourceChapterId: r.source_chapter_id ?? null,
    publishedAt: ts(r.published_at),
    downloadStatus: (r.download_status ?? 'pending') as any,
    downloadError: r.download_error ?? null,
    downloadedAt: ts(r.downloaded_at),
    createdAt: ts(r.created_at) ?? new Date(),
  }));

  await upsertBatch('chapters', pgChapterRows, chapters, (q) =>
    q.onConflictDoNothing(),
  );

  // ── pages ─────────────────────────────────────────────────────────────────────

  const totalPages = (sqlite.prepare('SELECT COUNT(*) as n FROM pages').get() as any).n;
  console.log(`Found ${totalPages} pages`);

  if (!DRY_RUN) {
    let migrated = 0;
    const stmt = sqlite.prepare(`
      SELECT id, chapter_id, idx, storage_path, source_url,
             width, height, bytes, mime
      FROM pages
      ORDER BY chapter_id, idx
    `);

    const pageRows: any[] = [];
    for (const r of stmt.iterate() as Iterable<any>) {
      pageRows.push({
        id: r.id,
        chapterId: r.chapter_id,
        idx: r.idx,
        storagePath: r.storage_path,
        sourceUrl: r.source_url,
        width: r.width ?? null,
        height: r.height ?? null,
        bytes: r.bytes ?? null,
        mime: r.mime ?? null,
      });

      if (pageRows.length === BATCH) {
        await pg.insert(pages).values(pageRows).onConflictDoNothing();
        migrated += pageRows.length;
        pageRows.length = 0;
        if (migrated % 5000 === 0) console.log(`  pages: ${migrated}/${totalPages}`);
      }
    }
    if (pageRows.length > 0) {
      await pg.insert(pages).values(pageRows).onConflictDoNothing();
      migrated += pageRows.length;
    }
    console.log(`  ✓  pages: ${migrated}`);
  } else {
    console.log(`  DRY  pages: ${totalPages}`);
  }

  // ── summary ───────────────────────────────────────────────────────────────────

  const [s, c, p] = await Promise.all([
    pg.select({ count: sql<number>`count(*)` }).from(series),
    pg.select({ count: sql<number>`count(*)` }).from(chapters),
    pg.select({ count: sql<number>`count(*)` }).from(pages),
  ]);

  console.log('\n--- Supabase now has ---');
  console.log(`  series:   ${s[0]?.count}`);
  console.log(`  chapters: ${c[0]?.count}`);
  console.log(`  pages:    ${p[0]?.count}`);

  sqlite.close();
}

main().catch((err) => { console.error('FAIL:', err.message); process.exit(1); });
