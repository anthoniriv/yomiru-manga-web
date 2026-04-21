type DiscoverKind = 'manga' | 'book';

const QUEUE_DISCOVER = 'yomiru.series.discover';
const QUEUE_CHAPTER = 'yomiru.chapter.download';
const QUEUE_MIRROR = 'yomiru.mirror.schedule';

function resolveRedisUrl(): string {
  const globalEnv = (globalThis as { __ENV__?: Record<string, string> }).__ENV__;
  return process.env.REDIS_URL ?? globalEnv?.REDIS_URL ?? 'redis://localhost:6379';
}

async function withQueue<T>(
  name: string,
  run: (queue: {
    add: (jobName: string, data: unknown, opts?: { jobId?: string }) => Promise<{ id?: string | number | undefined }>;
    getJobCounts?: (...types: string[]) => Promise<Record<string, number>>;
    close: () => Promise<void>;
  }) => Promise<T>,
): Promise<T> {
  const [{ Queue }, ioredis] = await Promise.all([import('bullmq'), import('ioredis')]);
  const Redis = ioredis.default;
  const connection = new Redis(resolveRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const queue = new Queue(name, { connection });
  try {
    return await run(queue);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

export async function enqueueDiscoverJob(input: {
  url: string;
  kind: DiscoverKind;
  forceResync?: boolean;
  watchUpdates?: boolean;
  autoDownload?: boolean;
  checkIntervalMinutes?: number;
  jobId?: string;
}): Promise<string> {
  return withQueue(QUEUE_DISCOVER, async (queue) => {
    const job = await queue.add(
      'discover',
      {
        url: input.url,
        kind: input.kind,
        forceResync: input.forceResync ?? false,
        watchUpdates: input.watchUpdates,
        autoDownload: input.autoDownload,
        checkIntervalMinutes: input.checkIntervalMinutes,
      },
      input.jobId ? { jobId: input.jobId } : undefined,
    );
    return String(job.id ?? input.jobId ?? 'discover');
  });
}

export async function enqueueMirrorJob(input: {
  limit?: number;
  retryFailed?: boolean;
  jobId?: string;
} = {}): Promise<string> {
  return withQueue(QUEUE_MIRROR, async (queue) => {
    const job = await queue.add(
      'mirror',
      {
        limit: input.limit,
        retryFailed: input.retryFailed ?? false,
      },
      input.jobId ? { jobId: input.jobId } : undefined,
    );
    return String(job.id ?? input.jobId ?? 'mirror');
  });
}

export async function enqueueChapterJob(input: {
  chapterId: string;
  jobId?: string;
}): Promise<string> {
  return withQueue(QUEUE_CHAPTER, async (queue) => {
    const job = await queue.add(
      'download',
      { chapterId: input.chapterId },
      input.jobId ? { jobId: input.jobId } : undefined,
    );
    return String(job.id ?? input.jobId ?? 'chapter');
  });
}

export async function getIngestQueueStats(): Promise<{
  discover: Record<string, number>;
  chapter: Record<string, number>;
  mirror: Record<string, number>;
} | null> {
  try {
    const types = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    const [discover, chapter, mirror] = await Promise.all([
      withQueue(QUEUE_DISCOVER, (queue) => queue.getJobCounts?.(...types) ?? Promise.resolve({})),
      withQueue(QUEUE_CHAPTER, (queue) => queue.getJobCounts?.(...types) ?? Promise.resolve({})),
      withQueue(QUEUE_MIRROR, (queue) => queue.getJobCounts?.(...types) ?? Promise.resolve({})),
    ]);
    return { discover, chapter, mirror };
  } catch {
    return null;
  }
}
