import { and, asc, desc, eq, getTableColumns, ilike, inArray, sql } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';
import { timed } from './perf';

const { series, chapters, pages, seriesGenres } = pgSchema;

export type Series = typeof series.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type ChapterWithPreview = Chapter & { previewUrl: string | null };

function r2PublicUrl(): string {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  return process.env.R2_PUBLIC_URL ?? globalEnv?.R2_PUBLIC_URL ?? '';
}

export function getCoverUrl(s: Pick<Series, 'coverSourceUrl' | 'coverPath'>): string {
  if (s.coverPath) return getStorageUrl(s.coverPath);
  if (s.coverSourceUrl) return s.coverSourceUrl;
  return '/placeholder-cover.svg';
}

export function getStorageUrl(path: string): string {
  const base = r2PublicUrl();
  if (base) return `${base}/${path}`;
  return `/media/${path}`;
}

export interface ListOpts {
  showAdult?: boolean;
}

function availableSeriesIdsSubquery() {
  return sql`(SELECT DISTINCT ${chapters.seriesId} FROM ${chapters} WHERE ${chapters.downloadStatus} = 'completed')`;
}

function availableAndAdultWhere(showAdult: boolean) {
  const base = sql`${series.id} IN ${availableSeriesIdsSubquery()}`;
  return showAdult ? base : and(base, eq(series.isAdult, false))!;
}

export async function getStats(opts: ListOpts = {}) {
  return timed('getStats', async () => {
    const db = getPgDb();
    const showAdult = opts.showAdult ?? false;
    const where = availableAndAdultWhere(showAdult);

    const [totalSeriesRow, totalChaptersRow] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(series).where(where),
      db
        .select({ count: sql<number>`count(*)` })
        .from(chapters)
        .innerJoin(series, eq(series.id, chapters.seriesId))
        .where(and(eq(chapters.downloadStatus, 'completed'), showAdult ? undefined : eq(series.isAdult, false))),
    ]);
    return {
      totalSeries: Number(totalSeriesRow[0]?.count ?? 0),
      totalChapters: Number(totalChaptersRow[0]?.count ?? 0),
    };
  });
}

export async function getSeriesList(page: number, perPage: number, opts: ListOpts = {}) {
  return timed('getSeriesList', async () => {
    const db = getPgDb();
    const offset = (page - 1) * perPage;
    const showAdult = opts.showAdult ?? false;
    const where = availableAndAdultWhere(showAdult);

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(series)
        .where(where)
        .orderBy(desc(series.popularity))
        .limit(perPage)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(series).where(where),
    ]);
    return { series: rows, total: Number(totalRow[0]?.count ?? 0) };
  });
}

export type CatalogSort = 'added' | 'updated' | 'popular' | 'rating' | 'title';

export interface CatalogOpts extends ListOpts {
  query?: string;
  genre?: string;
  year?: number;
  sort?: CatalogSort;
}

function catalogWhere(opts: CatalogOpts = {}) {
  const showAdult = opts.showAdult ?? false;
  const conds = [availableAndAdultWhere(showAdult)];
  const query = opts.query?.trim();
  const genre = opts.genre?.trim();

  if (query) conds.push(ilike(series.title, `%${query}%`));
  if (opts.year) conds.push(eq(series.year, opts.year));
  if (genre) {
    conds.push(sql`EXISTS (
      SELECT 1
      FROM ${seriesGenres}
      WHERE ${seriesGenres.seriesId} = ${series.id}
        AND ${seriesGenres.genre} = ${genre}
    )`);
  }

  return and(...conds)!;
}

export async function getCatalogSeries(page: number, perPage: number, opts: CatalogOpts = {}) {
  return timed('getCatalogSeries', async () => {
    const db = getPgDb();
    const offset = (page - 1) * perPage;
    const where = catalogWhere(opts);
    const sort = opts.sort ?? 'added';
    const orderBy =
      sort === 'title' ? [asc(series.title)] :
      sort === 'popular' ? [desc(series.popularity), desc(series.rating)] :
      sort === 'rating' ? [desc(series.rating), desc(series.popularity)] :
      sort === 'updated' ? [desc(series.updatedAt)] :
      [desc(series.createdAt)];

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(series)
        .where(where)
        .orderBy(...orderBy)
        .limit(perPage)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(series).where(where),
    ]);

    return { series: rows, total: Number(totalRow[0]?.count ?? 0) };
  });
}

export async function getCatalogFilters(opts: ListOpts = {}) {
  return timed('getCatalogFilters', async () => {
    const db = getPgDb();
    const showAdult = opts.showAdult ?? false;
    const adultFilter = showAdult ? undefined : eq(series.isAdult, false);
    const available = sql`${series.id} IN ${availableSeriesIdsSubquery()}`;

    const [genreRows, yearRows] = await Promise.all([
      db
        .select({ genre: seriesGenres.genre })
        .from(seriesGenres)
        .innerJoin(series, eq(series.id, seriesGenres.seriesId))
        .where(and(available, adultFilter))
        .groupBy(seriesGenres.genre)
        .orderBy(asc(seriesGenres.genre)),
      db
        .select({ year: series.year })
        .from(series)
        .where(and(available, adultFilter, sql`${series.year} IS NOT NULL`, sql`${series.year} >= 1900`))
        .groupBy(series.year)
        .orderBy(desc(series.year)),
    ]);

    return {
      genres: genreRows.map((r) => r.genre).filter(Boolean),
      years: yearRows.map((r) => r.year).filter((year): year is number => year != null),
    };
  });
}

export async function getTopSeries(limit: number, opts: ListOpts = {}) {
  return timed('getTopSeries', async () => {
    const db = getPgDb();
    const showAdult = opts.showAdult ?? false;
    return db
      .select()
      .from(series)
      .where(availableAndAdultWhere(showAdult))
      .orderBy(desc(series.popularity), desc(series.rating))
      .limit(limit);
  });
}

// Colapsado a 1 query con drizzle select (mapeo camelCase automático).
export async function getLatestSeries(limit: number, opts: ListOpts = {}): Promise<Series[]> {
  return timed('getLatestSeries', async () => {
    const db = getPgDb();
    const showAdult = opts.showAdult ?? false;
    const lim = Math.max(1, Math.floor(limit));

    const rows = await db
      .select(getTableColumns(series))
      .from(series)
      .innerJoin(chapters, eq(chapters.seriesId, series.id))
      .where(
        and(
          eq(chapters.downloadStatus, 'completed'),
          showAdult ? undefined : eq(series.isAdult, false),
        ),
      )
      .groupBy(series.id)
      .orderBy(desc(sql`MAX(COALESCE(${chapters.downloadedAt}, ${chapters.createdAt}))`))
      .limit(lim);
    return rows as Series[];
  });
}

export async function getSeriesBySlug(slug: string): Promise<Series | undefined> {
  return timed(`getSeriesBySlug(${slug})`, async () => {
    const rows = await getPgDb()
      .select()
      .from(series)
      .where(eq(series.slug, slug))
      .limit(1);
    return rows[0];
  });
}

export async function getChaptersBySeries(seriesId: string, onlyCompleted = false): Promise<Chapter[]> {
  return timed('getChaptersBySeries', async () => {
    const db = getPgDb();
    const where = onlyCompleted
      ? and(eq(chapters.seriesId, seriesId), eq(chapters.downloadStatus, 'completed'))!
      : eq(chapters.seriesId, seriesId);
    return db.select().from(chapters).where(where).orderBy(chapters.number);
  });
}

export async function getChaptersWithPreviewsBySeries(
  seriesId: string,
  onlyCompleted = false,
): Promise<ChapterWithPreview[]> {
  return timed('getChaptersWithPreviewsBySeries', async () => {
    const db = getPgDb();
    const where = onlyCompleted
      ? and(eq(chapters.seriesId, seriesId), eq(chapters.downloadStatus, 'completed'))!
      : eq(chapters.seriesId, seriesId);

    const rows = await db
      .select({
        id: chapters.id,
        seriesId: chapters.seriesId,
        number: chapters.number,
        title: chapters.title,
        volume: chapters.volume,
        language: chapters.language,
        pageCount: chapters.pageCount,
        sourceUrl: chapters.sourceUrl,
        sourceChapterId: chapters.sourceChapterId,
        publishedAt: chapters.publishedAt,
        downloadStatus: chapters.downloadStatus,
        downloadError: chapters.downloadError,
        downloadedAt: chapters.downloadedAt,
        createdAt: chapters.createdAt,
        previewPath: pages.storagePath,
        previewSourceUrl: pages.sourceUrl,
      })
      .from(chapters)
      .leftJoin(pages, and(
        eq(pages.chapterId, chapters.id),
        eq(pages.idx, sql`GREATEST(FLOOR(COALESCE(${chapters.pageCount}, 1) / 2), 0)::int`),
      ))
      .where(where)
      .orderBy(asc(chapters.number));

    return rows.map(({ previewPath, previewSourceUrl: _previewSourceUrl, ...chapter }) => ({
      ...chapter,
      previewUrl: previewPath ? getStorageUrl(previewPath) : null,
    }));
  });
}

export async function getSeriesBackdropUrl(seriesId: string): Promise<string | null> {
  return timed('getSeriesBackdropUrl', async () => {
    const db = getPgDb();

    const [s] = await db
      .select({ bannerPath: series.bannerPath, bannerSourceUrl: series.bannerSourceUrl })
      .from(series)
      .where(eq(series.id, seriesId))
      .limit(1);
    if (s?.bannerPath) return getStorageUrl(s.bannerPath);
    if (s?.bannerSourceUrl) return s.bannerSourceUrl;

    const rows = await db
      .select({
        storagePath: pages.storagePath,
        sourceUrl: pages.sourceUrl,
      })
      .from(chapters)
      .innerJoin(pages, eq(pages.chapterId, chapters.id))
      .where(
        and(
          eq(chapters.seriesId, seriesId),
          eq(chapters.downloadStatus, 'completed'),
          sql`${pages.storagePath} IS NOT NULL`,
          sql`${pages.idx} > 0`,
        ),
      )
      .orderBy(desc(chapters.number), asc(pages.idx))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    if (row.storagePath) return getStorageUrl(row.storagePath);
    return row.sourceUrl ?? null;
  });
}

export async function getSeriesBackdropMap(seriesIds: string[]): Promise<Map<string, string>> {
  return timed('getSeriesBackdropMap', async () => {
    const uniqueIds = [...new Set(seriesIds.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    const db = getPgDb();
    const bannerRows = await db
      .select({ id: series.id, bannerPath: series.bannerPath, bannerSourceUrl: series.bannerSourceUrl })
      .from(series)
      .where(inArray(series.id, uniqueIds));

    const map = new Map<string, string>();
    const needPage: string[] = [];
    for (const r of bannerRows) {
      if (r.bannerPath) map.set(r.id, getStorageUrl(r.bannerPath));
      else if (r.bannerSourceUrl) map.set(r.id, r.bannerSourceUrl);
      else needPage.push(r.id);
    }
    if (needPage.length === 0) return map;

    const idList = sql.join(needPage.map((id) => sql`${id}`), sql`, `);
    const result = await db.execute<{
      series_id: string;
      storage_path: string | null;
      source_url: string | null;
    }>(sql`
      SELECT DISTINCT ON (${chapters.seriesId})
        ${chapters.seriesId} AS series_id,
        ${pages.storagePath} AS storage_path,
        ${pages.sourceUrl} AS source_url
      FROM ${chapters}
      INNER JOIN ${pages} ON ${pages.chapterId} = ${chapters.id}
      WHERE ${chapters.seriesId} IN (${idList})
        AND ${chapters.downloadStatus} = 'completed'
        AND ${pages.storagePath} IS NOT NULL
        AND ${pages.idx} > 0
      ORDER BY ${chapters.seriesId}, ${chapters.number} DESC, ${pages.idx} ASC
    `);

    const rows = (result as unknown as { rows?: typeof result }).rows ?? (result as unknown as typeof result);
    for (const r of Array.isArray(rows) ? rows : []) {
      const url = r.storage_path ? getStorageUrl(r.storage_path) : r.source_url;
      if (url) map.set(r.series_id, url);
    }
    return map;
  });
}

export async function getChapterByNumber(
  seriesId: string,
  number: number,
): Promise<Chapter | undefined> {
  return timed('getChapterByNumber', async () => {
    const rows = await getPgDb()
      .select()
      .from(chapters)
      .where(and(eq(chapters.seriesId, seriesId), eq(chapters.number, number))!)
      .limit(1);
    return rows[0];
  });
}

export async function getPagesByChapter(chapterId: string): Promise<Page[]> {
  return timed('getPagesByChapter', async () => {
    return getPgDb()
      .select()
      .from(pages)
      .where(eq(pages.chapterId, chapterId))
      .orderBy(pages.idx);
  });
}

export async function getSeriesGenres(seriesId: string): Promise<string[]> {
  return timed('getSeriesGenres', async () => {
    const rows = await getPgDb()
      .select({ genre: seriesGenres.genre })
      .from(seriesGenres)
      .where(eq(seriesGenres.seriesId, seriesId));
    return rows.map((r) => r.genre);
  });
}

export async function getFeaturedSeries(limit: number, opts: ListOpts = {}) {
  return timed('getFeaturedSeries', async () => {
    const db = getPgDb();
    const showAdult = opts.showAdult ?? false;
    return db
      .select()
      .from(series)
      .where(
        and(
          sql`${series.id} IN ${availableSeriesIdsSubquery()}`,
          sql`${series.description} IS NOT NULL AND length(${series.description}) > 40`,
          sql`${series.coverPath} IS NOT NULL OR ${series.coverSourceUrl} IS NOT NULL`,
          showAdult ? undefined : eq(series.isAdult, false),
        ),
      )
      .orderBy(desc(series.popularity), desc(series.rating))
      .limit(limit);
  });
}

// 1 query con drizzle select — mapeo camelCase automático, evita row mapping bug.
export async function getRecentlyUpdatedSeries(limit: number, opts: ListOpts = {}): Promise<Series[]> {
  return timed('getRecentlyUpdatedSeries', async () => {
    const db = getPgDb();
    const showAdult = opts.showAdult ?? false;
    const lim = Math.max(1, Math.floor(limit));

    const rows = await db
      .select(getTableColumns(series))
      .from(series)
      .innerJoin(chapters, eq(chapters.seriesId, series.id))
      .where(
        and(
          eq(chapters.downloadStatus, 'completed'),
          showAdult ? undefined : eq(series.isAdult, false),
        ),
      )
      .groupBy(series.id)
      .orderBy(desc(sql`MAX(COALESCE(${chapters.downloadedAt}, ${chapters.createdAt}))`))
      .limit(lim);
    return rows as Series[];
  });
}

export async function getGenresSummary(opts: ListOpts = {}) {
  return timed('getGenresSummary', async () => {
    const db = getPgDb();
    const showAdult = opts.showAdult ?? false;
    const result = await db.execute<{ genre: string; count: string }>(sql`
      SELECT ${seriesGenres.genre} AS genre, count(DISTINCT ${series.id})::text AS count
      FROM ${seriesGenres}
      INNER JOIN ${series} ON ${series.id} = ${seriesGenres.seriesId}
      WHERE ${showAdult ? sql`TRUE` : sql`${series.isAdult} = false`}
        AND ${series.id} IN (SELECT DISTINCT ${chapters.seriesId} FROM ${chapters} WHERE ${chapters.downloadStatus} = 'completed')
      GROUP BY ${seriesGenres.genre}
      ORDER BY count(DISTINCT ${series.id}) DESC
      LIMIT 40
    `);
    const rows = (result as unknown as { rows?: Array<{ genre: string; count: string }> }).rows
      ?? (result as unknown as Array<{ genre: string; count: string }>);
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      genre: r.genre,
      count: Number(r.count),
    }));
  });
}

function normalizeSourceKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.(com|to|net|org|io|co|app)$/i, '')
    .replace(/[-_\s]+/g, '');
}

export async function getSourcesSummary(opts: ListOpts = {}) {
  return timed('getSourcesSummary', async () => {
    const db = getPgDb();
    const showAdult = opts.showAdult ?? false;
    const adultFilter = showAdult ? sql`TRUE` : sql`${series.isAdult} = false`;

    const result = await db.execute<{ source: string; count: string }>(sql`
      SELECT ${series.sourceName} AS source, count(*)::text AS count
      FROM ${series}
      WHERE ${adultFilter} AND ${series.sourceName} IS NOT NULL
        AND ${series.id} IN (SELECT DISTINCT ${chapters.seriesId} FROM ${chapters} WHERE ${chapters.downloadStatus} = 'completed')
      GROUP BY ${series.sourceName}
      ORDER BY count(*) DESC
    `);

    const rows = (result as unknown as { rows?: Array<{ source: string; count: string }> }).rows
      ?? (result as unknown as Array<{ source: string; count: string }>);

    const merged = new Map<string, { source: string; count: number }>();
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r.source) continue;
      const key = normalizeSourceKey(r.source);
      const count = Number(r.count);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { source: r.source, count });
      } else {
        existing.count += count;
        if (r.source.length < existing.source.length) existing.source = r.source;
      }
    }
    return [...merged.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  });
}

export type AdminAdultFilter = 'all' | 'adult' | 'non-adult';

export async function getSeriesForAdmin(
  page: number,
  perPage: number,
  opts: { filter?: AdminAdultFilter; search?: string } = {},
) {
  return timed('getSeriesForAdmin', async () => {
    const db = getPgDb();
    const offset = (page - 1) * perPage;
    const filter = opts.filter ?? 'all';
    const search = opts.search?.trim() ?? '';

    const conds = [] as ReturnType<typeof eq>[];
    if (filter === 'adult') conds.push(eq(series.isAdult, true));
    if (filter === 'non-adult') conds.push(eq(series.isAdult, false));
    if (search) conds.push(ilike(series.title, `%${search}%`));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: series.id,
          slug: series.slug,
          title: series.title,
          coverPath: series.coverPath,
          coverSourceUrl: series.coverSourceUrl,
          isAdult: series.isAdult,
        })
        .from(series)
        .where(where)
        .orderBy(series.title)
        .limit(perPage)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(series).where(where),
    ]);

    return { series: rows, total: Number(totalRow[0]?.count ?? 0) };
  });
}

export interface SeriesMonitorSettings {
  id: string;
  slug: string;
  title: string;
  sourceUrl: string;
  kind: 'manga' | 'book';
  status: Series['status'];
  watchUpdates: boolean;
  autoDownload: boolean;
  checkIntervalMinutes: number;
  lastCheckedAt: Date | null;
  lastSyncedAt: Date | null;
  totalChapters: number;
}

export interface AdminWatchedSeries extends SeriesMonitorSettings {
  pendingChapters: number;
  failedChapters: number;
}

export async function getSeriesMonitorSettingsBySlug(slug: string): Promise<SeriesMonitorSettings | null> {
  return timed(`getSeriesMonitorSettingsBySlug(${slug})`, async () => {
    const rows = await getPgDb()
      .select({
        id: series.id,
        slug: series.slug,
        title: series.title,
        sourceUrl: series.sourceUrl,
        kind: series.kind,
        status: series.status,
        watchUpdates: series.watchUpdates,
        autoDownload: series.autoDownload,
        checkIntervalMinutes: series.checkIntervalMinutes,
        lastCheckedAt: series.lastCheckedAt,
        lastSyncedAt: series.lastSyncedAt,
        totalChapters: series.totalChapters,
      })
      .from(series)
      .where(eq(series.slug, slug))
      .limit(1);

    return rows[0] ?? null;
  });
}

export async function updateSeriesMonitorSettings(
  slug: string,
  patch: Partial<Pick<Series, 'watchUpdates' | 'autoDownload' | 'checkIntervalMinutes' | 'lastCheckedAt'>>,
): Promise<void> {
  await getPgDb()
    .update(series)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(series.slug, slug));
}

export async function getWatchedSeriesForAdmin(limit = 50): Promise<AdminWatchedSeries[]> {
  return timed('getWatchedSeriesForAdmin', async () => {
    const rows = await getPgDb()
      .select({
        id: series.id,
        slug: series.slug,
        title: series.title,
        sourceUrl: series.sourceUrl,
        kind: series.kind,
        status: series.status,
        watchUpdates: series.watchUpdates,
        autoDownload: series.autoDownload,
        checkIntervalMinutes: series.checkIntervalMinutes,
        lastCheckedAt: series.lastCheckedAt,
        lastSyncedAt: series.lastSyncedAt,
        totalChapters: series.totalChapters,
        pendingChapters: sql<number>`count(*) filter (where ${chapters.downloadStatus} in ('pending', 'queued', 'downloading'))`,
        failedChapters: sql<number>`count(*) filter (where ${chapters.downloadStatus} = 'failed')`,
      })
      .from(series)
      .leftJoin(chapters, eq(chapters.seriesId, series.id))
      .where(eq(series.watchUpdates, true))
      .groupBy(series.id)
      .orderBy(desc(series.lastCheckedAt), desc(series.popularity), asc(series.title))
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      pendingChapters: Number(row.pendingChapters ?? 0),
      failedChapters: Number(row.failedChapters ?? 0),
    }));
  });
}

export async function searchSeries(query: string, limit = 20, opts: ListOpts = {}) {
  return timed('searchSeries', async () => {
    const showAdult = opts.showAdult ?? false;
    const whereExpr = and(
      ilike(series.title, `%${query}%`),
      sql`${series.id} IN ${availableSeriesIdsSubquery()}`,
      showAdult ? undefined : eq(series.isAdult, false),
    );
    return getPgDb()
      .select({
        slug: series.slug,
        title: series.title,
        coverPath: series.coverPath,
        coverSourceUrl: series.coverSourceUrl,
      })
      .from(series)
      .where(whereExpr)
      .limit(limit);
  });
}

// ============================================================================
// Slug-based bundled fetchers — evitan el waterfall series→resto en /manga/*.
// Internamente hacen JOIN por slug en vez de requerir series.id previo.
// ============================================================================

export interface SeriesPageBundle {
  series: Series;
  chapters: ChapterWithPreview[];
  genres: string[];
  backgroundUrl: string | null;
}

// Devuelve todo lo de /manga/[slug] en PARALELO (1 round-trip lógico).
// series se resuelve en paralelo con helpers que hacen JOIN por slug.
export async function getSeriesPageBundle(
  slug: string,
  onlyCompleted = true,
): Promise<SeriesPageBundle | null> {
  const db = getPgDb();

  try {
  const [seriesRow, chapterRows, genreRows, backdropRow] = await timed(
    `getSeriesPageBundle(${slug})`,
    async () =>
      Promise.all([
        db.select().from(series).where(eq(series.slug, slug)).limit(1),
        db
          .select({
            id: chapters.id,
            seriesId: chapters.seriesId,
            number: chapters.number,
            title: chapters.title,
            volume: chapters.volume,
            language: chapters.language,
            pageCount: chapters.pageCount,
            sourceUrl: chapters.sourceUrl,
            sourceChapterId: chapters.sourceChapterId,
            publishedAt: chapters.publishedAt,
            downloadStatus: chapters.downloadStatus,
            downloadError: chapters.downloadError,
            downloadedAt: chapters.downloadedAt,
            createdAt: chapters.createdAt,
            previewPath: pages.storagePath,
          })
          .from(chapters)
          .innerJoin(series, eq(series.id, chapters.seriesId))
          .leftJoin(pages, and(
        eq(pages.chapterId, chapters.id),
        eq(pages.idx, sql`GREATEST(FLOOR(COALESCE(${chapters.pageCount}, 1) / 2), 0)::int`),
      ))
          .where(
            onlyCompleted
              ? and(eq(series.slug, slug), eq(chapters.downloadStatus, 'completed'))!
              : eq(series.slug, slug),
          )
          .orderBy(asc(chapters.number)),
        db
          .select({ genre: seriesGenres.genre })
          .from(seriesGenres)
          .innerJoin(series, eq(series.id, seriesGenres.seriesId))
          .where(eq(series.slug, slug)),
        db
          .select({
            storagePath: pages.storagePath,
            sourceUrl: pages.sourceUrl,
          })
          .from(chapters)
          .innerJoin(series, eq(series.id, chapters.seriesId))
          .innerJoin(pages, eq(pages.chapterId, chapters.id))
          .where(
            and(
              eq(series.slug, slug),
              eq(chapters.downloadStatus, 'completed'),
              sql`${pages.storagePath} IS NOT NULL`,
              sql`${pages.idx} > 0`,
            ),
          )
          .orderBy(desc(chapters.number), asc(pages.idx))
          .limit(1),
      ]),
  );

  const s = seriesRow[0];
  if (!s) return null;

  const chaptersOut: ChapterWithPreview[] = chapterRows.map(({ previewPath, ...ch }) => ({
    ...ch,
    previewUrl: previewPath ? getStorageUrl(previewPath) : null,
  }));
  const backdrop = backdropRow[0];
  const backgroundUrl = s.bannerPath
    ? getStorageUrl(s.bannerPath)
    : s.bannerSourceUrl
      ? s.bannerSourceUrl
      : backdrop?.storagePath
        ? getStorageUrl(backdrop.storagePath)
        : backdrop?.sourceUrl ?? null;

  return {
    series: s,
    chapters: chaptersOut,
    genres: genreRows.map((r) => r.genre).filter(Boolean),
    backgroundUrl,
  };
  } catch (err) {
    console.error(`[ERR] getSeriesPageBundle(${slug}) failed:`, err instanceof Error ? err.stack ?? err.message : err);
    throw err;
  }
}

export interface ChapterPageBundle {
  series: Series;
  chapter: Chapter;
  allCompletedChapters: Pick<Chapter, 'id' | 'number' | 'downloadStatus'>[];
  pages: Page[];
}

// Bundle para /manga/[slug]/[chapter] — reduce de 4 round-trips serial a 1.
// Todas las queries pueden correr en paralelo usando slug+number como ancla.
export async function getChapterPageBundle(
  slug: string,
  chapterNumber: number,
): Promise<ChapterPageBundle | null> {
  const db = getPgDb();

  try {
  const [seriesRow, chapterRow, allChaptersRow] = await timed(
    `getChapterPageBundle(${slug},${chapterNumber})`,
    async () =>
      Promise.all([
        db.select().from(series).where(eq(series.slug, slug)).limit(1),
        db
          .select({
            id: chapters.id,
            seriesId: chapters.seriesId,
            number: chapters.number,
            title: chapters.title,
            volume: chapters.volume,
            language: chapters.language,
            pageCount: chapters.pageCount,
            sourceUrl: chapters.sourceUrl,
            sourceChapterId: chapters.sourceChapterId,
            publishedAt: chapters.publishedAt,
            downloadStatus: chapters.downloadStatus,
            downloadError: chapters.downloadError,
            downloadedAt: chapters.downloadedAt,
            createdAt: chapters.createdAt,
          })
          .from(chapters)
          .innerJoin(series, eq(series.id, chapters.seriesId))
          .where(and(eq(series.slug, slug), eq(chapters.number, chapterNumber))!)
          .limit(1),
        db
          .select({
            id: chapters.id,
            number: chapters.number,
            downloadStatus: chapters.downloadStatus,
          })
          .from(chapters)
          .innerJoin(series, eq(series.id, chapters.seriesId))
          .where(and(eq(series.slug, slug), eq(chapters.downloadStatus, 'completed'))!)
          .orderBy(asc(chapters.number)),
      ]),
  );

  const s = seriesRow[0];
  const ch = chapterRow[0];
  if (!s || !ch) return null;

  // pages necesita chapter.id — 1 extra round-trip inevitable sin reestructurar.
  // Lo ejecutamos solo si chapter existe y está completo (evita query desperdiciada).
  const chapterPages = ch.downloadStatus === 'completed'
    ? await timed('getPagesByChapter.bundle', async () =>
        db.select().from(pages).where(eq(pages.chapterId, ch.id)).orderBy(pages.idx),
      )
    : [];

  return {
    series: s,
    chapter: ch,
    allCompletedChapters: allChaptersRow,
    pages: chapterPages,
  };
  } catch (err) {
    console.error(`[ERR] getChapterPageBundle(${slug},${chapterNumber}) failed:`, err instanceof Error ? err.stack ?? err.message : err);
    throw err;
  }
}
