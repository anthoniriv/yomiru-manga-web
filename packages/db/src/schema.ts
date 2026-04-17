import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

export const series = sqliteTable(
  'series',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    kind: text('kind', { enum: ['manga', 'book'] }).notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    normalizedTitle: text('normalized_title').notNull(),
    altTitles: text('alt_titles', { mode: 'json' }).$type<string[]>().default([]),
    description: text('description'),
    coverPath: text('cover_path'),
    coverSourceUrl: text('cover_source_url'),
    rating: real('rating'),
    voteCount: integer('vote_count').notNull().default(0),
    popularity: real('popularity').notNull().default(0),
    totalChapters: integer('total_chapters').notNull().default(0),
    mirrorPriority: integer('mirror_priority').notNull().default(0),
    status: text('status', {
      enum: ['ongoing', 'completed', 'hiatus', 'cancelled', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    contentRating: text('content_rating'),
    year: integer('year'),
    author: text('author'),
    artist: text('artist'),
    sourceName: text('source_name').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceId: text('source_id'),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    slugIdx: uniqueIndex('series_slug_kind_idx').on(t.slug, t.kind),
    sourceIdx: uniqueIndex('series_source_idx').on(t.sourceName, t.sourceUrl),
    normalizedTitleKindIdx: uniqueIndex('series_normalized_title_kind_idx').on(
      t.normalizedTitle,
      t.kind,
    ),
    kindIdx: index('series_kind_idx').on(t.kind),
  }),
);

export const seriesGenres = sqliteTable(
  'series_genres',
  {
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    genre: text('genre').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.seriesId, t.genre] }),
    genreIdx: index('series_genres_genre_idx').on(t.genre),
  }),
);

export const seriesTags = sqliteTable(
  'series_tags',
  {
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.seriesId, t.tag] }),
  }),
);

export const chapters = sqliteTable(
  'chapters',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    number: real('number').notNull(),
    title: text('title'),
    volume: text('volume'),
    language: text('language').notNull().default('es'),
    pageCount: integer('page_count'),
    sourceUrl: text('source_url').notNull(),
    sourceChapterId: text('source_chapter_id'),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    downloadStatus: text('download_status', {
      enum: ['pending', 'queued', 'downloading', 'completed', 'failed'],
    })
      .notNull()
      .default('pending'),
    downloadError: text('download_error'),
    downloadedAt: integer('downloaded_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    seriesNumIdx: uniqueIndex('chapters_series_number_lang_idx').on(
      t.seriesId,
      t.number,
      t.language,
    ),
    statusIdx: index('chapters_status_idx').on(t.downloadStatus),
  }),
);

export const pages = sqliteTable(
  'pages',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    storagePath: text('storage_path').notNull(),
    sourceUrl: text('source_url').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    mime: text('mime'),
  },
  (t) => ({
    chapterIdxUnique: uniqueIndex('pages_chapter_idx_unique').on(
      t.chapterId,
      t.idx,
    ),
  }),
);

export const ingestJobs = sqliteTable(
  'ingest_jobs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    type: text('type', {
      enum: ['series.discover', 'series.sync', 'chapter.download'],
    }).notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    status: text('status', {
      enum: ['queued', 'running', 'completed', 'failed'],
    })
      .notNull()
      .default('queued'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
  },
  (t) => ({
    statusIdx: index('ingest_jobs_status_idx').on(t.status),
    typeIdx: index('ingest_jobs_type_idx').on(t.type),
  }),
);

export type Series = typeof series.$inferSelect;
export type NewSeries = typeof series.$inferInsert;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
