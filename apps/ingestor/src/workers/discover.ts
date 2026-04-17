import { Worker, type Job } from 'bullmq';
import { config } from '../config.js';
import { getRedis } from '../redis.js';
import { QUEUE_DISCOVER, type DiscoverJob, chapterQueue } from '../queues.js';
import { scrapeSeries } from '../scraper.js';
import {
  upsertSeries,
  upsertChapter,
  listChaptersBySeries,
  setChapterStatus,
} from '../repo.js';
import { downloadAndUpload, makeSlug } from '../storage.js';
import { ulid } from 'ulid';

export function startDiscoverWorker(): Worker<DiscoverJob> {
  const worker = new Worker<DiscoverJob>(
    QUEUE_DISCOVER,
    async (job: Job<DiscoverJob>) => {
      const { url, kind } = job.data;
      console.log(`[discover] ${url}`);

      const result = await scrapeSeries(url);
      if (!result.title) {
        throw new Error(`no title scraped from ${url}`);
      }

      const sourceName = result.source_domain || new URL(url).hostname;
      const slug = makeSlug(result.title, ulid());
      const normalizedTitle = makeSlug(result.title, slug);

      let coverKey: string | null = null;
      if (result.cover_image_url) {
        try {
          const ext =
            (result.cover_image_url.match(/\.(jpe?g|png|webp|gif|avif)/i)?.[0] ??
              '.jpg').toLowerCase();
          const key = `${kind}/${slug}/cover${ext}`;
          const asset = await downloadAndUpload(result.cover_image_url, key);
          coverKey = asset.key;
        } catch (err) {
          console.warn(`[discover] cover failed: ${(err as Error).message}`);
        }
      }

      const seriesRow = await upsertSeries({
        id: ulid(),
        kind,
        slug,
        title: result.title,
        normalizedTitle,
        description: result.description ?? null,
        coverPath: coverKey,
        coverSourceUrl: result.cover_image_url ?? null,
        rating: result.rating ?? null,
        totalChapters: result.chapters.length,
        sourceName,
        sourceUrl: url,
      });

      console.log(
        `[discover] series=${seriesRow.id} chapters_found=${result.chapters.length}`,
      );

      const existingChapters = await listChaptersBySeries(seriesRow.id);
      const existing = new Map(
        existingChapters.map((c) => [`${c.number}-${c.language}`, c]),
      );

      const newChapterIds: string[] = [];
      for (const ch of result.chapters) {
        const row = await upsertChapter({
          seriesId: seriesRow.id,
          number: ch.number,
          title: ch.title,
          sourceUrl: ch.url,
          language: 'es',
        });
        const isNew = !existing.has(`${row.number}-${row.language}`);
        if (isNew || row.downloadStatus === 'pending' || row.downloadStatus === 'failed') {
          await setChapterStatus(row.id, 'queued');
          newChapterIds.push(row.id);
        }
      }

      const queue = chapterQueue();
      for (const id of newChapterIds) {
        await queue.add('download', { chapterId: id }, { jobId: `ch-${id}` });
      }

      return {
        seriesId: seriesRow.id,
        chaptersTotal: result.chapters.length,
        chaptersQueued: newChapterIds.length,
      };
    },
    {
      connection: getRedis(),
      concurrency: config.concurrency.discover,
      lockDuration: 120_000,
      stalledInterval: 30_000,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[discover] failed ${job?.id}: ${err.message}`);
  });
  worker.on('completed', (job, res) => {
    console.log(`[discover] done ${job.id}`, res);
  });

  return worker;
}
