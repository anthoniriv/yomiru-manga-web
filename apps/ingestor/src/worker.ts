import { startDiscoverWorker } from './workers/discover.js';
import { startChapterWorker } from './workers/downloadChapter.js';
import { startCatalogWorker } from './workers/catalog.js';
import { startMirrorWorker } from './workers/mirror.js';
import { config } from './config.js';
import { closeQueues } from './queues.js';
import { mirrorQueue } from './queues.js';
import { closeRedis } from './redis.js';
import { closeScraper } from './scraper.js';
import { resetInterruptedChapters, resetInvalidDownloadedChapters } from './repo.js';
import { closePgDb } from '@yomiru/db';

console.log('[ingestor] booting workers…');
const resetCount = await resetInterruptedChapters();
if (resetCount > 0) {
  console.log(`[ingestor] reset interrupted chapters=${resetCount}`);
}
const invalidCount = await resetInvalidDownloadedChapters();
if (invalidCount > 0) {
  console.log(`[ingestor] reset invalid downloaded chapters=${invalidCount}`);
}

const discover = startDiscoverWorker();
const chapter = startChapterWorker();
const catalog = startCatalogWorker();
const mirror = startMirrorWorker();
const mirrorTimer = config.mirror.auto
  ? setInterval(() => {
      void mirrorQueue().add('mirror', {}, { jobId: `mirror-${Date.now()}` });
    }, config.mirror.intervalMs)
  : null;
mirrorTimer?.unref();
if (config.mirror.auto) {
  void mirrorQueue().add('mirror', {}, { jobId: `mirror-${Date.now()}` });
}
console.log('[ingestor] workers ready (discover, chapter, catalog, mirror)');

async function shutdown(signal: string) {
  console.log(`[ingestor] received ${signal}, shutting down…`);
  if (mirrorTimer) clearInterval(mirrorTimer);
  await Promise.allSettled([
    discover.close(),
    chapter.close(),
    catalog.close(),
    mirror.close(),
  ]);
  await closeQueues();
  await closeScraper();
  await closeRedis();
  await closePgDb();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
