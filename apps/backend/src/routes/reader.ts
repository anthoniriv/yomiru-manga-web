import { FastifyInstance, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Readable } from 'node:stream';
import { ChapterContent } from '@yomiru/shared';
import { ScraperEngine } from '../scraper/engine.js';
import {
  extractChapterContentFromUrlFallback,
  extractChapterContentWithFallback,
} from '../scraper/chapterContent.js';
import { CloudflareError } from '../scraper/browser.js';

const ChapterParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

const ReaderImageQuery = Type.Object({
  url: Type.String({ format: 'uri' }),
});

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === 'localhost' || host === '::1') return true;
  if (host.endsWith('.local')) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  if (/^\[?fe80:/i.test(host)) return true;
  if (/^\[?fc/i.test(host) || /^\[?fd/i.test(host)) return true;

  return false;
}

function buildImageProxyHeaders(target: URL): Record<string, string> {
  const host = target.hostname.toLowerCase();
  const isTmoImageHost =
    /(^|\.)(img\d*tmo\.com)$/i.test(host) ||
    /(^|\.)(cache\d+\.img\d*tmo\.com)$/i.test(host);

  if (isTmoImageHost) {
    return {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://zonatmo.com/library',
      Origin: 'https://zonatmo.com',
    };
  }

  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    Referer: `${target.origin}/`,
    Origin: target.origin,
  };
}

let scraperEngine: ScraperEngine | null = null;

function getEngine(): ScraperEngine {
  if (!scraperEngine) {
    scraperEngine = new ScraperEngine();
  }
  return scraperEngine;
}

function setNoStoreHeaders(reply: FastifyReply) {
  reply.header('Cache-Control', 'private, no-store, max-age=0');
  reply.header('Pragma', 'no-cache');
}

function isContentEmpty(content: ChapterContent): boolean {
  return content.images.length === 0 && content.paragraphs.length === 0;
}

function isManhwaWebUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'manhwaweb.com';
  } catch {
    return false;
  }
}

function formatChapterNumberForUrl(chapterNumber: number): string {
  if (!Number.isFinite(chapterNumber)) return String(chapterNumber);
  if (Number.isInteger(chapterNumber)) return String(chapterNumber);
  return chapterNumber.toFixed(2).replace(/\.?0+$/, '');
}

function buildManhwaWebChapterUrl(sourceUrl: string, chapterNumber: number): string | null {
  try {
    const parsed = new URL(sourceUrl);
    const match = parsed.pathname.match(/\/(?:manhwa|manga)\/([^/?#]+)/i);
    if (!match) return null;

    const workId = decodeURIComponent(match[1]);
    const chapterPart = formatChapterNumberForUrl(chapterNumber);
    return `${parsed.origin}/leer/${encodeURIComponent(workId)}-${encodeURIComponent(chapterPart)}`;
  } catch {
    return null;
  }
}

export async function readerRoutes(fastify: FastifyInstance) {
  const markChapterAsRead = async (chapterId: string, bookId: string) => {
    if (!fastify.supabase) return;
    await fastify.supabase
      .from('chapters')
      .update({
        is_read: true,
        last_read_at: new Date().toISOString(),
      })
      .eq('id', chapterId)
      .eq('book_id', bookId)
      .eq('is_read', false);
  };

  fastify.get('/reader/image', {
    config: {
      rateLimit: {
        max: 1800,
        timeWindow: '1 minute',
      },
    },
    schema: { querystring: ReaderImageQuery },
  }, async (request, reply) => {
    setNoStoreHeaders(reply);
    const { url } = request.query as { url: string };

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return reply.status(400).send('Invalid URL');
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
      return reply.status(400).send('Unsupported protocol');
    }
    if (isPrivateOrLocalHost(target.hostname)) {
      return reply.status(400).send('Unsupported host');
    }

    try {
      const response = await fetch(target.toString(), {
        headers: buildImageProxyHeaders(target),
      });

      if (!response.ok || !response.body) {
        return reply.status(response.status || 502).send('Image fetch failed');
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const bodyStream = Readable.fromWeb(response.body as any);

      reply.header('Content-Type', contentType);
      return reply.send(bodyStream);
    } catch {
      return reply.status(502).send('Image fetch failed');
    }
  });

  fastify.get('/chapters/:id/content', {
    schema: { params: ChapterParams },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    setNoStoreHeaders(reply);
    const { id } = request.params as { id: string };

    if (!fastify.supabase) {
      return reply.status(503).send({
        success: false,
        error: 'database_unavailable',
        details: 'Database not configured',
      });
    }

    const { data: chapter, error: chapterError } = await fastify.supabase
      .from('chapters')
      .select('id, book_id, title, number, url')
      .eq('id', id)
      .single();

    if (chapterError || !chapter) {
      return reply.status(404).send({
        success: false,
        error: 'chapter_not_found',
      });
    }

    const { data: book, error: bookError } = await fastify.supabase
      .from('books')
      .select('id, source_url')
      .eq('id', chapter.book_id)
      .eq('user_id', request.userId)
      .single();

    if (bookError || !book) {
      return reply.status(404).send({
        success: false,
        error: 'chapter_not_found',
      });
    }

    try {
      const engine = getEngine();
      const html = await engine.fetchPageHtml(chapter.url);
      let content = await extractChapterContentWithFallback(html, chapter.url);

      if (isContentEmpty(content) && isManhwaWebUrl(book.source_url)) {
        const reconstructedUrl = buildManhwaWebChapterUrl(book.source_url, Number(chapter.number));
        if (reconstructedUrl && reconstructedUrl !== chapter.url) {
          const recovered = await extractChapterContentFromUrlFallback(reconstructedUrl);
          if (recovered && !isContentEmpty(recovered)) {
            content = {
              ...recovered,
              warnings: Array.from(new Set([
                ...recovered.warnings,
                'Recovered chapter content using reconstructed ManhwaWeb chapter URL.',
              ])),
            };
          }
        }
      }

      fastify.log.info({
        chapterId: chapter.id,
        chapterUrl: chapter.url,
        sourceUrl: book.source_url,
        images: content.images.length,
        paragraphs: content.paragraphs.length,
      }, 'Chapter content extracted');

      await markChapterAsRead(chapter.id, chapter.book_id);

      return {
        success: true,
        data: {
          chapter_id: chapter.id,
          chapter_title: chapter.title,
          chapter_number: chapter.number,
          content,
        },
      };
    } catch (error) {
      fastify.log.error(error, 'Chapter content extraction failed: %s', chapter.url);

      if (error instanceof CloudflareError) {
        const recovered = await extractChapterContentFromUrlFallback(chapter.url);
        if (recovered && (recovered.images.length > 0 || recovered.paragraphs.length > 0)) {
          await markChapterAsRead(chapter.id, chapter.book_id);
          return {
            success: true,
            data: {
              chapter_id: chapter.id,
              chapter_title: chapter.title,
              chapter_number: chapter.number,
              content: recovered,
            },
          };
        }

        return reply.status(403).send({
          success: false,
          error: 'cloudflare_protected',
          details: error.message,
        });
      }

      return reply.status(422).send({
        success: false,
        error: 'chapter_content_failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
