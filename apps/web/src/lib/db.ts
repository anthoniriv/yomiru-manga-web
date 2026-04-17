import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { getPgDb, pgSchema } from '@yomiru/db';

const { series, chapters, pages, seriesGenres } = pgSchema;

export type Series = typeof series.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type ChapterWithPreview = Chapter & { previewUrl: string | null };

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

export function getCoverUrl(s: Pick<Series, 'coverSourceUrl' | 'coverPath'>): string {
  if (s.coverSourceUrl) return s.coverSourceUrl;
  if (s.coverPath) {
    return getStorageUrl(s.coverPath);
  }
  return '/placeholder-cover.svg';
}

export function getStorageUrl(path: string): string {
  if (R2_PUBLIC_URL) return `${R2_PUBLIC_URL}/${path}`;
  return `/media/${path}`;
}

export interface ListOpts {
  showAdult?: boolean;
}

// Series that have at least one chapter already uploaded to R2 (downloadStatus='completed').
function availableSeriesIdsSubquery() {
  return sql`(SELECT DISTINCT ${chapters.seriesId} FROM ${chapters} WHERE ${chapters.downloadStatus} = 'completed')`;
}

function availableAndAdultWhere(showAdult: boolean) {
  const base = sql`${series.id} IN ${availableSeriesIdsSubquery()}`;
  return showAdult ? base : and(base, eq(series.isAdult, false))!;
}

export async function getStats(opts: ListOpts = {}) {
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
}

export async function getSeriesList(page: number, perPage: number, opts: ListOpts = {}) {
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
}

export async function getCatalogFilters(opts: ListOpts = {}) {
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
      .where(and(available, adultFilter, sql`${series.year} IS NOT NULL`))
      .groupBy(series.year)
      .orderBy(desc(series.year)),
  ]);

  return {
    genres: genreRows.map((r) => r.genre).filter(Boolean),
    years: yearRows.map((r) => r.year).filter((year): year is number => year != null),
  };
}

export async function getTopSeries(limit: number, opts: ListOpts = {}) {
  const db = getPgDb();
  const showAdult = opts.showAdult ?? false;
  return db
    .select()
    .from(series)
    .where(availableAndAdultWhere(showAdult))
    .orderBy(desc(series.popularity), desc(series.rating))
    .limit(limit);
}

// Newest series measured by latest chapter upload time (downloadedAt).
// Returns distinct series ordered by most recent R2 upload.
export async function getLatestSeries(limit: number, opts: ListOpts = {}) {
  const db = getPgDb();
  const showAdult = opts.showAdult ?? false;
  const adultFilter = showAdult ? sql`TRUE` : sql`${series.isAdult} = false`;

  const rows = await db.execute<{ id: string }>(sql`
    SELECT ${series.id} AS id
    FROM ${series}
    JOIN (
      SELECT series_id, MAX(downloaded_at) AS last_upload
      FROM ${chapters}
      WHERE download_status = 'completed'
      GROUP BY series_id
    ) ch ON ch.series_id = ${series.id}
    WHERE ${adultFilter}
    ORDER BY ch.last_upload DESC NULLS LAST
    LIMIT ${sql.raw(String(Math.max(1, Math.floor(limit))))}
  `);

  const ids = (rows as unknown as { rows?: Array<{ id: string }> }).rows
    ?? (rows as unknown as Array<{ id: string }>);
  const idList = Array.isArray(ids) ? ids.map((r) => r.id) : [];
  if (idList.length === 0) return [] as Series[];

  const fetched = await db.select().from(series).where(inArray(series.id, idList));
  const byId = new Map(fetched.map((s) => [s.id, s]));
  return idList.map((id) => byId.get(id)!).filter(Boolean);
}

export async function getSeriesBySlug(slug: string): Promise<Series | undefined> {
  const rows = await getPgDb()
    .select()
    .from(series)
    .where(eq(series.slug, slug))
    .limit(1);
  return rows[0];
}

export async function getChaptersBySeries(seriesId: string, onlyCompleted = false): Promise<Chapter[]> {
  const db = getPgDb();
  const where = onlyCompleted
    ? and(eq(chapters.seriesId, seriesId), eq(chapters.downloadStatus, 'completed'))!
    : eq(chapters.seriesId, seriesId);
  return db.select().from(chapters).where(where).orderBy(chapters.number);
}

export async function getChaptersWithPreviewsBySeries(
  seriesId: string,
  onlyCompleted = false,
): Promise<ChapterWithPreview[]> {
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
    .leftJoin(pages, and(eq(pages.chapterId, chapters.id), eq(pages.idx, 0)))
    .where(where)
    .orderBy(asc(chapters.number));

  return rows.map(({ previewPath, previewSourceUrl: _previewSourceUrl, ...chapter }) => ({
    ...chapter,
    previewUrl: previewPath ? getStorageUrl(previewPath) : null,
  }));
}

export async function getSeriesBackdropUrl(seriesId: string): Promise<string | null> {
  const rows = await getPgDb()
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
}

export async function getSeriesBackdropMap(seriesIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(seriesIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (seriesId) => {
      const url = await getSeriesBackdropUrl(seriesId);
      return url ? ([seriesId, url] as const) : null;
    }),
  );
  return new Map(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

export async function getChapterByNumber(
  seriesId: string,
  number: number,
): Promise<Chapter | undefined> {
  const rows = await getPgDb()
    .select()
    .from(chapters)
    .where(eq(chapters.seriesId, seriesId))
    .limit(500);
  return rows.find((c) => c.number === number);
}

export async function getPagesByChapter(chapterId: string): Promise<Page[]> {
  return getPgDb()
    .select()
    .from(pages)
    .where(eq(pages.chapterId, chapterId))
    .orderBy(pages.idx);
}

export async function getSeriesGenres(seriesId: string): Promise<string[]> {
  const rows = await getPgDb()
    .select({ genre: seriesGenres.genre })
    .from(seriesGenres)
    .where(eq(seriesGenres.seriesId, seriesId));
  return rows.map((r) => r.genre);
}

export async function getFeaturedSeries(limit: number, opts: ListOpts = {}) {
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
}

export async function getRecentlyUpdatedSeries(limit: number, opts: ListOpts = {}) {
  const db = getPgDb();
  const showAdult = opts.showAdult ?? false;
  const adultFilter = showAdult ? sql`TRUE` : sql`${series.isAdult} = false`;

  const result = await db.execute<{ id: string; last_upload: string }>(sql`
    SELECT ${series.id} AS id, MAX(${chapters.downloadedAt}) AS last_upload
    FROM ${series}
    JOIN ${chapters} ON ${chapters.seriesId} = ${series.id}
    WHERE ${chapters.downloadStatus} = 'completed' AND ${adultFilter}
    GROUP BY ${series.id}
    ORDER BY last_upload DESC NULLS LAST
    LIMIT ${sql.raw(String(Math.max(1, Math.floor(limit))))}
  `);

  const rows = (result as unknown as { rows?: Array<{ id: string }> }).rows
    ?? (result as unknown as Array<{ id: string }>);
  const idList = Array.isArray(rows) ? rows.map((r) => r.id) : [];
  if (idList.length === 0) return [] as Series[];

  const fetched = await db.select().from(series).where(inArray(series.id, idList));
  const byId = new Map(fetched.map((s) => [s.id, s]));
  return idList.map((id) => byId.get(id)!).filter(Boolean);
}

export async function getSourcesSummary(opts: ListOpts = {}) {
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
    LIMIT 20
  `);

  const rows = (result as unknown as { rows?: Array<{ source: string; count: string }> }).rows
    ?? (result as unknown as Array<{ source: string; count: string }>);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    source: r.source,
    count: Number(r.count),
  }));
}

export type AdminAdultFilter = 'all' | 'adult' | 'non-adult';

export async function getSeriesForAdmin(
  page: number,
  perPage: number,
  opts: { filter?: AdminAdultFilter; search?: string } = {},
) {
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
}

export async function searchSeries(query: string, limit = 20, opts: ListOpts = {}) {
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
}
