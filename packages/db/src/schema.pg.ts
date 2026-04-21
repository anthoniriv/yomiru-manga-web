import {
  pgSchema,
  text,
  real,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const mangaSchema = pgSchema('manga');

export const series = mangaSchema.table(
  'series',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    kind: text('kind').notNull().$type<'manga' | 'book'>(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    normalizedTitle: text('normalized_title').notNull(),
    altTitles: jsonb('alt_titles').$type<string[]>().notNull().default([]),
    description: text('description'),
    coverPath: text('cover_path'),
    coverSourceUrl: text('cover_source_url'),
    bannerPath: text('banner_path'),
    bannerSourceUrl: text('banner_source_url'),
    rating: real('rating'),
    voteCount: integer('vote_count').notNull().default(0),
    popularity: real('popularity').notNull().default(0),
    totalChapters: integer('total_chapters').notNull().default(0),
    mirrorPriority: integer('mirror_priority').notNull().default(0),
    status: text('status').notNull().default('unknown')
      .$type<'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown'>(),
    contentRating: text('content_rating'),
    isAdult: boolean('is_adult').notNull().default(false),
    year: integer('year'),
    author: text('author'),
    artist: text('artist'),
    sourceName: text('source_name').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceId: text('source_id'),
    watchUpdates: boolean('watch_updates').notNull().default(false),
    autoDownload: boolean('auto_download').notNull().default(false),
    checkIntervalMinutes: integer('check_interval_minutes').notNull().default(30),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugKindIdx: uniqueIndex('series_slug_kind_idx').on(t.slug, t.kind),
    sourceIdx: uniqueIndex('series_source_idx').on(t.sourceName, t.sourceUrl),
    normalizedTitleKindIdx: uniqueIndex('series_normalized_title_kind_idx').on(
      t.normalizedTitle,
      t.kind,
    ),
    kindIdx: index('series_kind_idx').on(t.kind),
    isAdultIdx: index('series_is_adult_idx').on(t.isAdult),
    watchUpdatesIdx: index('series_watch_updates_idx').on(t.watchUpdates),
  }),
);

export const seriesGenres = mangaSchema.table(
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

export const seriesTags = mangaSchema.table(
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

export const chapters = mangaSchema.table(
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
    publishedAt: timestamp('published_at', { withTimezone: true }),
    downloadStatus: text('download_status').notNull().default('pending')
      .$type<'pending' | 'queued' | 'downloading' | 'completed' | 'failed'>(),
    downloadError: text('download_error'),
    downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seriesNumIdx: uniqueIndex('chapters_series_number_lang_idx').on(
      t.seriesId,
      t.number,
      t.language,
    ),
    statusIdx: index('chapters_status_idx').on(t.downloadStatus),
    seriesIdx: index('chapters_series_idx').on(t.seriesId),
  }),
);

export const pages = mangaSchema.table(
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
    chapterIdxUnique: uniqueIndex('pages_chapter_idx_unique').on(t.chapterId, t.idx),
  }),
);

export const ingestJobs = mangaSchema.table(
  'ingest_jobs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    type: text('type').notNull()
      .$type<'series.discover' | 'series.sync' | 'chapter.download'>(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('queued')
      .$type<'queued' | 'running' | 'completed' | 'failed'>(),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('ingest_jobs_status_idx').on(t.status),
    typeIdx: index('ingest_jobs_type_idx').on(t.type),
  }),
);

// PG types
export type Series = typeof series.$inferSelect;
export type NewSeries = typeof series.$inferInsert;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
