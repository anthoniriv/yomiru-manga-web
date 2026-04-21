import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '../../../.env'),
]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

export const config = {
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  storageDir: resolve(
    process.env.YOMIRU_STORAGE_DIR ?? './storage/media',
  ),
  concurrency: {
    discover: Number(process.env.INGEST_CONCURRENCY_DISCOVER ?? 2),
    chapter: Number(process.env.INGEST_CONCURRENCY_CHAPTER ?? 4),
    page: Number(process.env.INGEST_CONCURRENCY_PAGE ?? 8),
    catalog: Number(process.env.INGEST_CONCURRENCY_CATALOG ?? 1),
    mirror: Number(process.env.INGEST_CONCURRENCY_MIRROR ?? 2),
  },
  mirror: {
    auto: process.env.MIRROR_AUTO === '1',
    batchSize: Number(process.env.MIRROR_BATCH_SIZE ?? 50),
    intervalMs: Number(process.env.MIRROR_INTERVAL_MS ?? 60_000),
  },
  watch: {
    auto: process.env.WATCH_AUTO === '1',
    batchSize: Number(process.env.WATCH_BATCH_SIZE ?? 20),
    intervalMs: Number(process.env.WATCH_INTERVAL_MS ?? 10 * 60_000),
  },
  mal: {
    enabled: process.env.MAL_ENRICH !== '0',
    delayMs: Number(process.env.MAL_REQUEST_DELAY_MS ?? 1_200),
  },
  storageMaxBytes: Number(process.env.STORAGE_MAX_GB ?? 200) * 1024 * 1024 * 1024,
} as const;
