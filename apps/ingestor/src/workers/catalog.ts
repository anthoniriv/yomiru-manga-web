import { Worker, type Job } from 'bullmq';
import { ulid } from 'ulid';
import { config } from '../config.js';
import { getRedis } from '../redis.js';
import { QUEUE_CATALOG, type CatalogJob, mirrorQueue } from '../queues.js';
import { upsertChapter, upsertSeries } from '../repo.js';
import { makeSlug } from '../storage.js';
import { lookupMalMangaStats } from '../sources/mal.js';
import { ZonatmoProvider } from '../sources/zonatmo.js';
import { CapibaraProvider } from '../sources/capibara.js';
import type { DiscoveredSeries, SourceProvider } from '../sources/types.js';

function providerFor(source: CatalogJob['source']): SourceProvider {
  switch (source) {
    case 'zonatmo':
      return new ZonatmoProvider();
    case 'capibara':
      return new CapibaraProvider();
  }
}

function scoreSeries(input: DiscoveredSeries): {
  popularity: number;
  mirrorPriority: number;
} {
  const rating = input.rating ?? 1;
  const voteCount = input.voteCount ?? 0;
  const totalChapters = input.totalChapters ?? 0;
  const popularity = input.popularity ??
    (voteCount > 0
      ? Math.max(1, rating) * voteCount
      : Math.max(0, rating) * 1000 + Math.max(0, totalChapters));
  return {
    popularity,
    mirrorPriority: Math.round(popularity * 100),
  };
}

function mergeSeries(
  listing: DiscoveredSeries,
  detail: DiscoveredSeries | null,
): DiscoveredSeries {
  if (!detail) return listing;
  return {
    ...listing,
    ...detail,
    slug: detail.slug || listing.slug,
    sourceUrl: listing.sourceUrl,
    coverUrl: detail.coverUrl ?? listing.coverUrl,
    voteCount: listing.voteCount,
    popularity: listing.popularity,
    totalChapters: detail.totalChapters ?? listing.totalChapters,
  };
}

async function enrichWithMal(input: DiscoveredSeries): Promise<DiscoveredSeries> {
  const mal = await lookupMalMangaStats(input.title, input.altTitles);
  if (!mal) return input;
  const voteCount = mal.scoredBy || input.voteCount || 0;
  const popularity = mal.scoredBy || mal.members || input.popularity || 0;
  return {
    ...input,
    rating: mal.score ?? input.rating,
    voteCount,
    popularity,
  };
}

async function saveSeries(input: DiscoveredSeries) {
  const slug = input.slug || makeSlug(input.title, input.externalId || ulid());
  const { popularity, mirrorPriority } = scoreSeries(input);
  return upsertSeries({
    id: ulid(),
    kind: input.kind,
    slug,
    title: input.title,
    normalizedTitle: makeSlug(input.title, slug),
    altTitles: input.altTitles,
    description: input.description,
    coverPath: null,
    coverSourceUrl: input.coverUrl,
    rating: input.rating,
    voteCount: input.voteCount ?? 0,
    popularity,
    totalChapters: input.totalChapters ?? 0,
    mirrorPriority,
    status: input.status,
    year: input.year,
    author: input.author,
    artist: input.artist,
    sourceName: input.sourceUrl ? new URL(input.sourceUrl).hostname : 'zonatmo',
    sourceUrl: input.sourceUrl,
    sourceId: input.externalId,
  });
}

export function startCatalogWorker(): Worker<CatalogJob> {
  const worker = new Worker<CatalogJob>(
    QUEUE_CATALOG,
    async (job: Job<CatalogJob>) => {
      const provider = providerFor(job.data.source);
      const fetchDetails = job.data.fetchDetails ?? true;
      const enrichMal = job.data.enrichMal ?? config.mal.enabled;
      let seriesCount = 0;
      let chapterCount = 0;
      let failed = 0;

      for await (const listing of provider.crawlCatalog({
        startPage: job.data.startPage,
        maxPages: job.data.maxPages,
      })) {
        try {
          const details = fetchDetails
            ? await provider.fetchSeriesDetails(listing.externalId)
            : null;
          const merged = mergeSeries(listing, details?.series ?? null);
          const enriched = enrichMal ? await enrichWithMal(merged) : merged;
          const saved = await saveSeries(enriched);
          seriesCount += 1;

          for (const chapter of details?.chapters ?? []) {
            if (!Number.isFinite(chapter.number)) continue;
            await upsertChapter({
              seriesId: saved.id,
              number: chapter.number,
              title: chapter.title,
              language: chapter.language || 'es',
              sourceUrl: chapter.sourceUrl,
              sourceChapterId: chapter.externalId,
              publishedAt: chapter.publishedAt ?? undefined,
            });
            chapterCount += 1;
          }

          console.log(
            `[catalog] ${saved.slug} mal_votes=${saved.voteCount} popularity=${saved.popularity} chapters=${details?.chapters.length ?? 0}`,
          );
        } catch (err) {
          failed += 1;
          console.warn(
            `[catalog] failed ${listing.title}: ${(err as Error).message}`,
          );
        }
      }

      if (job.data.enqueueMirror ?? true) {
        await mirrorQueue().add('mirror', {});
      }

      return { source: job.data.source, series: seriesCount, chapters: chapterCount, failed };
    },
    {
      connection: getRedis(),
      concurrency: config.concurrency.catalog,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[catalog] failed ${job?.id}: ${err.message}`);
  });
  worker.on('completed', (job, res) => {
    console.log(`[catalog] done ${job.id}`, res);
  });

  return worker;
}
