import { Worker, type Job } from 'bullmq';
import pLimit from 'p-limit';
import { ulid } from 'ulid';
import { config } from '../config.js';
import { getRedis } from '../redis.js';
import { QUEUE_CHAPTER, type ChapterJob } from '../queues.js';
import { scrapeChapterContent } from '../scraper.js';
import { ZonatmoProvider } from '../sources/zonatmo.js';
import {
  getChapter,
  findSeriesById,
  setChapterStatus,
  replacePages,
} from '../repo.js';
import {
  downloadAndUpload,
  pageKey,
} from '../storage.js';
import type { NewPage } from '@yomiru/db';

async function getChapterImages(chapter: {
  sourceChapterId: string | null;
  sourceUrl: string;
}, series: {
  sourceName: string;
  sourceId: string | null;
}): Promise<string[]> {
  if (
    series.sourceName.includes('zonatmo') &&
    series.sourceId &&
    chapter.sourceChapterId
  ) {
    return new ZonatmoProvider().fetchChapterImages({
      externalId: chapter.sourceChapterId,
      sourceUrl: chapter.sourceUrl,
      seriesExternalId: series.sourceId,
    });
  }
  return (await scrapeChapterContent(chapter.sourceUrl)).images;
}

export function startChapterWorker(): Worker<ChapterJob> {
  const worker = new Worker<ChapterJob>(
    QUEUE_CHAPTER,
    async (job: Job<ChapterJob>, token?: string) => {
      const { chapterId } = job.data;
      const ch = await getChapter(chapterId);
      if (!ch) throw new Error(`chapter ${chapterId} not found`);
      const ser = await findSeriesById(ch.seriesId);
      if (!ser) throw new Error(`series ${ch.seriesId} not found`);

      await setChapterStatus(chapterId, 'downloading');
      console.log(
        `[chapter] ${ser.slug} c${ch.number} ← ${ch.sourceUrl}`,
      );

      const images = await getChapterImages(ch, ser);
      if (images.length === 0) {
        await setChapterStatus(chapterId, 'failed', {
          error: 'no images extracted',
        });
        throw new Error(`no images for ${ch.sourceUrl}`);
      }

      const limit = pLimit(config.concurrency.page);
      const referer = new URL(ch.sourceUrl).origin;
      let done = 0;

      const results = await Promise.allSettled(
        images.map((imgUrl, idx) =>
          limit(async () => {
            const key = pageKey(ser.kind, ser.slug, ch.number, idx, imgUrl);
            const asset = await downloadAndUpload(imgUrl, key, {
              Referer: referer,
            });
            done += 1;
            if (token && done % 4 === 0) {
              try {
                await job.extendLock(token, 300_000);
              } catch {
                // lock lost — let stalled handler take over
              }
            }
            return { idx, imgUrl, asset };
          }),
        ),
      );

      const successful: NewPage[] = [];
      let failed = 0;
      for (const r of results) {
        if (r.status === 'fulfilled') {
          successful.push({
            id: ulid(),
            chapterId,
            idx: r.value.idx,
            storagePath: r.value.asset.key,
            sourceUrl: r.value.imgUrl,
            bytes: r.value.asset.bytes,
            mime: r.value.asset.mime,
          });
        } else {
          failed += 1;
          console.warn(`[chapter] page failed: ${r.reason}`);
        }
      }

      if (successful.length === 0) {
        await setChapterStatus(chapterId, 'failed', {
          error: 'all pages failed',
        });
        throw new Error('all pages failed');
      }

      await replacePages(chapterId, successful);
      await setChapterStatus(chapterId, 'completed', {
        pageCount: successful.length,
      });

      return {
        chapterId,
        pages: successful.length,
        failed,
      };
    },
    {
      connection: getRedis(),
      concurrency: config.concurrency.chapter,
      lockDuration: 300_000,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[chapter] failed ${job?.id}: ${err.message}`);
  });
  worker.on('completed', (job, res) => {
    console.log(`[chapter] done ${job.id}`, res);
  });

  return worker;
}
