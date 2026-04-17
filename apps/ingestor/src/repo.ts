import { eq, and, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getPgDb, pgSchema } from '@yomiru/db';

const { series, chapters, pages } = pgSchema;

export type Series = typeof series.$inferSelect;
export type NewSeries = typeof series.$inferInsert;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;
export type NewPage = typeof pages.$inferInsert;

export function createId(): string {
  return ulid();
}

export async function findSeriesBySource(
  sourceName: string,
  sourceUrl: string,
): Promise<Series | undefined> {
  const rows = await getPgDb()
    .select()
    .from(series)
    .where(and(eq(series.sourceName, sourceName), eq(series.sourceUrl, sourceUrl)))
    .limit(1);
  return rows[0];
}

export async function upsertSeries(input: NewSeries): Promise<Series> {
  const db = getPgDb();
  const existing = await findSeriesBySource(input.sourceName, input.sourceUrl);
  if (existing) {
    const voteCount =
      input.voteCount && input.voteCount > 0 ? input.voteCount : existing.voteCount;
    const popularity =
      input.popularity && input.popularity > 0 ? input.popularity : existing.popularity;
    const mirrorPriority =
      input.mirrorPriority && input.mirrorPriority > 0
        ? input.mirrorPriority
        : existing.mirrorPriority;
    await db.update(series)
      .set({
        title: input.title ?? existing.title,
        normalizedTitle: input.normalizedTitle ?? existing.normalizedTitle,
        description: input.description ?? existing.description,
        coverPath: input.coverPath ?? existing.coverPath,
        coverSourceUrl: input.coverSourceUrl ?? existing.coverSourceUrl,
        rating: input.rating ?? existing.rating,
        voteCount,
        popularity,
        totalChapters: input.totalChapters ?? existing.totalChapters,
        mirrorPriority,
        status: input.status ?? existing.status,
        year: input.year ?? existing.year,
        author: input.author ?? existing.author,
        artist: input.artist ?? existing.artist,
        altTitles: input.altTitles ?? existing.altTitles,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(series.id, existing.id));
    return { ...existing, ...input, id: existing.id } as Series;
  }
  const id = input.id ?? createId();
  await db.insert(series).values({ ...input, id, lastSyncedAt: new Date() });
  return (await findSeriesById(id))!;
}

export async function findSeriesById(id: string): Promise<Series | undefined> {
  const rows = await getPgDb().select().from(series).where(eq(series.id, id)).limit(1);
  return rows[0];
}

export async function upsertChapter(input: NewChapter): Promise<Chapter> {
  const db = getPgDb();
  const rows = await db
    .select()
    .from(chapters)
    .where(
      and(
        eq(chapters.seriesId, input.seriesId),
        eq(chapters.number, input.number),
        eq(chapters.language, input.language ?? 'es'),
      ),
    )
    .limit(1);
  const existing = rows[0];
  if (existing) {
    await db.update(chapters)
      .set({
        title: input.title ?? existing.title,
        sourceUrl: input.sourceUrl ?? existing.sourceUrl,
        sourceChapterId: input.sourceChapterId ?? existing.sourceChapterId,
        publishedAt: input.publishedAt ?? existing.publishedAt,
      })
      .where(eq(chapters.id, existing.id));
    return existing;
  }
  const id = input.id ?? createId();
  await db.insert(chapters).values({ ...input, id });
  const inserted = await db.select().from(chapters).where(eq(chapters.id, id)).limit(1);
  return inserted[0]!;
}

export async function setChapterStatus(
  chapterId: string,
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'failed',
  fields: { error?: string | null; pageCount?: number | null } = {},
): Promise<void> {
  await getPgDb().update(chapters)
    .set({
      downloadStatus: status,
      downloadError: fields.error ?? null,
      pageCount: fields.pageCount ?? undefined,
      downloadedAt: status === 'completed' ? new Date() : undefined,
    })
    .where(eq(chapters.id, chapterId));
}

export async function getChapter(chapterId: string): Promise<Chapter | undefined> {
  const rows = await getPgDb().select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  return rows[0];
}

export async function listChaptersBySeries(seriesId: string): Promise<Chapter[]> {
  return getPgDb().select().from(chapters).where(eq(chapters.seriesId, seriesId));
}

export async function resetInterruptedChapters(): Promise<number> {
  const db = getPgDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(chapters)
    .where(inArray(chapters.downloadStatus, ['queued', 'downloading']));
  const count = Number(rows[0]?.count ?? 0);
  if (count === 0) return 0;
  await db.update(chapters)
    .set({ downloadStatus: 'pending', downloadError: null })
    .where(inArray(chapters.downloadStatus, ['queued', 'downloading']));
  return count;
}

export async function resetInvalidDownloadedChapters(): Promise<number> {
  const db = getPgDb();
  const rows = await db
    .select({ chapterId: pages.chapterId })
    .from(pages)
    .innerJoin(chapters, eq(pages.chapterId, chapters.id))
    .where(
      and(
        eq(chapters.downloadStatus, 'completed'),
        sql`(coalesce(${pages.bytes}, 0) <= 0 or lower(coalesce(${pages.mime}, '')) like 'text/html%')`,
      ),
    )
    .groupBy(pages.chapterId);

  const ids = rows.map((r) => r.chapterId);
  if (ids.length === 0) return 0;

  await db.update(chapters)
    .set({
      downloadStatus: 'pending',
      downloadError: 'invalid downloaded pages',
      pageCount: null,
      downloadedAt: null,
    })
    .where(inArray(chapters.id, ids));
  await db.delete(pages).where(inArray(pages.chapterId, ids));
  return ids.length;
}

export async function replacePages(chapterId: string, rows: NewPage[]): Promise<void> {
  const db = getPgDb();
  await db.delete(pages).where(eq(pages.chapterId, chapterId));
  if (rows.length === 0) return;
  await db.insert(pages).values(rows.map((r) => ({ ...r, id: r.id ?? createId() })));
}
