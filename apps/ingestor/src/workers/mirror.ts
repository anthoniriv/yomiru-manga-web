import { Worker, type Job } from 'bullmq';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { getRedis } from '../redis.js';
import {
  QUEUE_MIRROR,
  type MirrorJob,
  chapterQueue,
} from '../queues.js';
import { setChapterStatus } from '../repo.js';
import { getPgDb, pgSchema } from '@yomiru/db';

const { chapters, pages, series } = pgSchema;

async function storedBytes(): Promise<number> {
  const rows = await getPgDb()
    .select({
      bytes: sql<number>`coalesce(sum(coalesce(${pages.bytes}, 0)), 0)`,
    })
    .from(pages);
  return Number(rows[0]?.bytes ?? 0);
}

async function listMirrorCandidates(
  limit: number,
  statuses: Array<'pending' | 'queued' | 'downloading' | 'completed' | 'failed'>,
): Promise<Array<{ chapterId: string; slug: string; chapter: number }>> {
  return getPgDb()
    .select({
      chapterId: chapters.id,
      slug: series.slug,
      chapter: chapters.number,
    })
    .from(chapters)
    .innerJoin(series, eq(chapters.seriesId, series.id))
    .where(and(inArray(chapters.downloadStatus, statuses), eq(series.autoDownload, true)))
    .orderBy(desc(series.mirrorPriority), desc(series.popularity), asc(chapters.number))
    .limit(limit);
}

export function startMirrorWorker(): Worker<MirrorJob> {
  const worker = new Worker<MirrorJob>(
    QUEUE_MIRROR,
    async (job: Job<MirrorJob>) => {
      const usedBytes = await storedBytes();
      if (usedBytes >= config.storageMaxBytes) {
        return {
          queued: 0,
          skipped: 'storage_limit',
          usedBytes,
          maxBytes: config.storageMaxBytes,
        };
      }

      const limit = job.data.limit ?? config.mirror.batchSize;
      const statuses: Array<'pending' | 'failed'> = job.data.retryFailed
        ? ['pending', 'failed']
        : ['pending'];
      const candidates = await listMirrorCandidates(limit, statuses);
      const queue = chapterQueue();
      let queued = 0;

      for (const candidate of candidates) {
        await setChapterStatus(candidate.chapterId, 'queued');
        await queue.add(
          'download',
          { chapterId: candidate.chapterId },
          { jobId: `ch-${candidate.chapterId}` },
        );
        queued += 1;
      }

      return {
        queued,
        usedBytes,
        maxBytes: config.storageMaxBytes,
      };
    },
    {
      connection: getRedis(),
      concurrency: config.concurrency.mirror,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[mirror] failed ${job?.id}: ${err.message}`);
  });
  worker.on('completed', (job, res) => {
    console.log(`[mirror] done ${job.id}`, res);
  });

  return worker;
}
