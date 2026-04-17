import { Queue, type JobsOptions } from 'bullmq';
import { getRedis } from './redis.js';

export const QUEUE_DISCOVER = 'yomiru.series.discover';
export const QUEUE_CHAPTER = 'yomiru.chapter.download';
export const QUEUE_CATALOG = 'yomiru.catalog.crawl';
export const QUEUE_MIRROR = 'yomiru.mirror.schedule';

export interface DiscoverJob {
  url: string;
  kind: 'manga' | 'book';
  forceResync?: boolean;
}

export interface ChapterJob {
  chapterId: string;
}

export interface CatalogJob {
  source: 'zonatmo';
  startPage?: number;
  maxPages?: number;
  fetchDetails?: boolean;
  enqueueMirror?: boolean;
  enrichMal?: boolean;
}

export interface MirrorJob {
  limit?: number;
  retryFailed?: boolean;
}

const defaultJobOpts: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

let _discover: Queue<DiscoverJob> | null = null;
let _chapter: Queue<ChapterJob> | null = null;
let _catalog: Queue<CatalogJob> | null = null;
let _mirror: Queue<MirrorJob> | null = null;

export function discoverQueue(): Queue<DiscoverJob> {
  if (!_discover) {
    _discover = new Queue<DiscoverJob>(QUEUE_DISCOVER, {
      connection: getRedis(),
      defaultJobOptions: defaultJobOpts,
    });
  }
  return _discover;
}

export function chapterQueue(): Queue<ChapterJob> {
  if (!_chapter) {
    _chapter = new Queue<ChapterJob>(QUEUE_CHAPTER, {
      connection: getRedis(),
      defaultJobOptions: defaultJobOpts,
    });
  }
  return _chapter;
}

export function catalogQueue(): Queue<CatalogJob> {
  if (!_catalog) {
    _catalog = new Queue<CatalogJob>(QUEUE_CATALOG, {
      connection: getRedis(),
      defaultJobOptions: defaultJobOpts,
    });
  }
  return _catalog;
}

export function mirrorQueue(): Queue<MirrorJob> {
  if (!_mirror) {
    _mirror = new Queue<MirrorJob>(QUEUE_MIRROR, {
      connection: getRedis(),
      defaultJobOptions: defaultJobOpts,
    });
  }
  return _mirror;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    _discover?.close(),
    _chapter?.close(),
    _catalog?.close(),
    _mirror?.close(),
  ]);
  _discover = null;
  _chapter = null;
  _catalog = null;
  _mirror = null;
}
