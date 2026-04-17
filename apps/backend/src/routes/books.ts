import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

interface IncomingChapter {
  title: string;
  number: number;
  url: string;
  season_name?: string;
  season_number?: number;
}

const SaveBookBody = Type.Object({
  title: Type.String(),
  source_url: Type.String({ format: 'uri' }),
  cover_image_url: Type.Union([Type.String(), Type.Null()]),
  rating: Type.Union([Type.Number(), Type.Null()]),
  description: Type.Union([Type.String(), Type.Null()]),
  source_domain: Type.String(),
  status: Type.String(),
  chapters: Type.Array(Type.Object({
    title: Type.String(),
    number: Type.Number(),
    url: Type.String(),
    season_name: Type.Optional(Type.String()),
    season_number: Type.Optional(Type.Number()),
  })),
});

const BookParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

function normalizeChapterNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function isGenericChapterTitle(value: string, number: number): boolean {
  const text = value.trim().toLowerCase();
  return text === `chapter ${number}` || text === `capitulo ${number}` || text === `capítulo ${number}`;
}

function shouldReplaceChapter(current: IncomingChapter, next: IncomingChapter): boolean {
  const currentHasSeason = current.season_number !== undefined;
  const nextHasSeason = next.season_number !== undefined;

  if (!currentHasSeason && nextHasSeason) return true;

  const currentGenericTitle = isGenericChapterTitle(current.title, current.number);
  const nextGenericTitle = isGenericChapterTitle(next.title, next.number);
  if (currentGenericTitle && !nextGenericTitle) return true;

  if (!current.url && !!next.url) return true;

  return false;
}

function dedupeChaptersByNumber(chapters: IncomingChapter[]): IncomingChapter[] {
  const byNumber = new Map<string, IncomingChapter>();

  for (const chapter of chapters) {
    const normalizedNumber = normalizeChapterNumber(chapter.number);
    const key = normalizedNumber.toFixed(2);
    const normalized: IncomingChapter = {
      ...chapter,
      number: normalizedNumber,
    };

    const current = byNumber.get(key);
    if (!current) {
      byNumber.set(key, normalized);
      continue;
    }

    if (shouldReplaceChapter(current, normalized)) {
      byNumber.set(key, normalized);
    }
  }

  return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
}

async function buildSeasonMaps(
  fastify: FastifyInstance,
  bookId: string,
  chapters: IncomingChapter[],
): Promise<{
  seasonIds: Map<number, string>;
  seasonNumberById: Map<string, number>;
}> {
  const seasonIds = new Map<number, string>();
  const seasonNumberById = new Map<string, number>();

  const { data: existingSeasons, error: existingSeasonsError } = await fastify.supabase!
    .from('seasons')
    .select('id, number, name')
    .eq('book_id', bookId);

  if (existingSeasonsError) throw existingSeasonsError;

  for (const season of existingSeasons || []) {
    seasonIds.set(season.number, season.id);
    seasonNumberById.set(season.id, season.number);
  }

  const missingSeasonRows: Array<{ book_id: string; name: string; number: number }> = [];
  const queued = new Set<number>();

  for (const chapter of chapters) {
    if (chapter.season_number === undefined || !chapter.season_name) continue;
    if (seasonIds.has(chapter.season_number) || queued.has(chapter.season_number)) continue;
    queued.add(chapter.season_number);
    missingSeasonRows.push({
      book_id: bookId,
      name: chapter.season_name,
      number: chapter.season_number,
    });
  }

  if (missingSeasonRows.length > 0) {
    const { data: insertedSeasons, error: insertSeasonError } = await fastify.supabase!
      .from('seasons')
      .insert(missingSeasonRows)
      .select('id, number');

    if (insertSeasonError) throw insertSeasonError;

    for (const season of insertedSeasons || []) {
      seasonIds.set(season.number, season.id);
      seasonNumberById.set(season.id, season.number);
    }
  }

  return { seasonIds, seasonNumberById };
}

async function checkBookUpdates(
  fastify: FastifyInstance,
  userId: string,
  bookId: string,
): Promise<{
  book: any;
  added_chapters: number;
  updated_chapters: number;
  total_remote_chapters: number;
}> {
  if (!fastify.supabase) {
    throw new Error('Database not configured');
  }

  const { data: book, error: bookError } = await fastify.supabase
    .from('books')
    .select('id, user_id, title, source_url, cover_image_url, rating, description, source_domain')
    .eq('id', bookId)
    .eq('user_id', userId)
    .single();

  if (bookError || !book) {
    throw new Error('Book not found');
  }

  const { ScraperEngine } = await import('../scraper/engine.js');
  const engine = new ScraperEngine();
  let scrapeResult: Awaited<ReturnType<typeof engine.scrape>>;
  try {
    scrapeResult = await engine.scrape(book.source_url);
  } finally {
    await engine.close();
  }

  const incomingChapters = dedupeChaptersByNumber((scrapeResult.chapters || []) as IncomingChapter[]);
  const { seasonIds, seasonNumberById } = await buildSeasonMaps(fastify, bookId, incomingChapters);

  const { data: existingChapters, error: existingChaptersError } = await fastify.supabase
    .from('chapters')
    .select('id, title, number, url, season_id')
    .eq('book_id', bookId);

  if (existingChaptersError) throw existingChaptersError;

  const existingByNumber = new Map<string, any>();
  for (const chapter of existingChapters || []) {
    const normalized = normalizeChapterNumber(Number(chapter.number));
    existingByNumber.set(normalized.toFixed(2), chapter);
  }

  const chapterRowsToInsert: any[] = [];
  const chapterRowsToUpdate: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const incoming of incomingChapters) {
    const normalized = normalizeChapterNumber(incoming.number);
    const key = normalized.toFixed(2);
    const existing = existingByNumber.get(key);
    const seasonId = incoming.season_number !== undefined
      ? (seasonIds.get(incoming.season_number) || null)
      : null;

    if (!existing) {
      chapterRowsToInsert.push({
        book_id: bookId,
        season_id: seasonId,
        title: incoming.title,
        number: normalized,
        url: incoming.url,
        is_read: false,
      });
      continue;
    }

    const currentSeasonNumber = existing.season_id
      ? seasonNumberById.get(existing.season_id)
      : undefined;

    const currentChapter: IncomingChapter = {
      title: existing.title,
      number: normalizeChapterNumber(Number(existing.number)),
      url: existing.url,
      season_number: currentSeasonNumber,
    };

    const patch: Record<string, unknown> = {};
    if (shouldReplaceChapter(currentChapter, incoming)) {
      if (incoming.title && incoming.title !== existing.title) patch.title = incoming.title;
      if (incoming.url && incoming.url !== existing.url) patch.url = incoming.url;
    }
    if (!existing.season_id && seasonId) {
      patch.season_id = seasonId;
    }

    if (Object.keys(patch).length > 0) {
      chapterRowsToUpdate.push({ id: existing.id, patch });
    }
  }

  let addedChapters = 0;
  if (chapterRowsToInsert.length > 0) {
    const { data: insertedChapters, error: insertError } = await fastify.supabase
      .from('chapters')
      .insert(chapterRowsToInsert)
      .select('id');
    if (insertError) throw insertError;
    addedChapters = (insertedChapters || []).length;
  }

  let updatedChapters = 0;
  for (const row of chapterRowsToUpdate) {
    const { error: updateError } = await fastify.supabase
      .from('chapters')
      .update(row.patch)
      .eq('id', row.id)
      .eq('book_id', bookId);
    if (updateError) throw updateError;
    updatedChapters++;
  }

  const bookPatch: Record<string, unknown> = {
    last_scraped_at: new Date().toISOString(),
  };
  if (scrapeResult.title) bookPatch.title = scrapeResult.title;
  if (scrapeResult.description) bookPatch.description = scrapeResult.description;
  if (scrapeResult.cover_image_url) bookPatch.cover_image_url = scrapeResult.cover_image_url;
  if (scrapeResult.rating !== null && scrapeResult.rating !== undefined) bookPatch.rating = scrapeResult.rating;
  if (scrapeResult.source_domain) bookPatch.source_domain = scrapeResult.source_domain;

  const { data: updatedBook, error: updateBookError } = await fastify.supabase
    .from('books')
    .update(bookPatch)
    .eq('id', bookId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (updateBookError) throw updateBookError;

  return {
    book: updatedBook,
    added_chapters: addedChapters,
    updated_chapters: updatedChapters,
    total_remote_chapters: incomingChapters.length,
  };
}

export async function bookRoutes(fastify: FastifyInstance) {
  // Save a scraped book with all chapters
  fastify.post('/books', {
    schema: { body: SaveBookBody },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = request.body as any;
    const userId = request.userId;
    const uniqueChapters = dedupeChaptersByNumber((body.chapters || []) as IncomingChapter[]);

    if (!fastify.supabase) {
      return reply.status(503).send({ error: 'Database not configured' });
    }

    try {
      // 1. Insert book
      const { data: book, error: bookError } = await fastify.supabase
        .from('books')
        .insert({
          user_id: userId,
          title: body.title,
          source_url: body.source_url,
          cover_image_url: body.cover_image_url,
          rating: body.rating,
          description: body.description,
          source_domain: body.source_domain,
          status: body.status,
          last_scraped_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (bookError) throw bookError;

      // 2. Group chapters by season (if applicable)
      const seasonsMap = new Map<number, string>();
      const seasonIds = new Map<number, string>();

      for (const ch of uniqueChapters) {
        if (ch.season_number !== undefined && ch.season_name) {
          seasonsMap.set(ch.season_number, ch.season_name);
        }
      }

      // 3. Insert seasons if any
      const seasons: any[] = [];
      if (seasonsMap.size > 0) {
        const seasonRows = Array.from(seasonsMap.entries()).map(([num, name]) => ({
          book_id: book.id,
          name,
          number: num,
        }));

        const { data: insertedSeasons, error: seasonError } = await fastify.supabase
          .from('seasons')
          .insert(seasonRows)
          .select();

        if (seasonError) throw seasonError;

        for (const s of insertedSeasons || []) {
          seasonIds.set(s.number, s.id);
          seasons.push(s);
        }
      }

      // 4. Insert chapters
      const chapterRows = uniqueChapters.map((ch: IncomingChapter) => ({
        book_id: book.id,
        season_id: ch.season_number !== undefined ? seasonIds.get(ch.season_number) || null : null,
        title: ch.title,
        number: ch.number,
        url: ch.url,
        is_read: false,
      }));

      let chapters: any[] = [];
      if (chapterRows.length > 0) {
        const { data: insertedChapters, error: chapterError } = await fastify.supabase
          .from('chapters')
          .insert(chapterRows)
          .select();

        if (chapterError) throw chapterError;
        chapters = insertedChapters || [];
      }

      return {
        success: true,
        data: {
          book,
          seasons,
          chapters,
          skipped_duplicate_chapters: Math.max((body.chapters?.length || 0) - uniqueChapters.length, 0),
        },
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to save book');
      return reply.status(500).send({
        success: false,
        error: 'Failed to save book',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Manual check for new chapters and metadata updates
  fastify.post('/books/:id/check-updates', {
    schema: { params: BookParams },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!fastify.supabase) {
      return reply.status(503).send({
        success: false,
        error: 'database_unavailable',
      });
    }

    try {
      const data = await checkBookUpdates(fastify, request.userId, id);
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Book not found') {
        return reply.status(404).send({
          success: false,
          error: 'book_not_found',
        });
      }

      fastify.log.error(error, 'Failed to check book updates');
      return reply.status(422).send({
        success: false,
        error: 'check_updates_failed',
        details: message,
      });
    }
  });

  // Refresh book metadata (re-scrape)
  fastify.get('/books/:id/refresh', {
    schema: { params: BookParams },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!fastify.supabase) {
      return reply.status(503).send({ error: 'Database not configured' });
    }

    // Get the book's source URL
    const { data: book, error } = await fastify.supabase
      .from('books')
      .select('source_url')
      .eq('id', id)
      .eq('user_id', request.userId)
      .single();

    if (error || !book) {
      return reply.status(404).send({ error: 'Book not found' });
    }

    // Re-scrape
    const { ScraperEngine } = await import('../scraper/engine.js');
    const engine = new ScraperEngine();
    let result: Awaited<ReturnType<typeof engine.scrape>>;
    try {
      result = await engine.scrape(book.source_url);
    } finally {
      await engine.close();
    }

    return { success: true, data: result };
  });
}
