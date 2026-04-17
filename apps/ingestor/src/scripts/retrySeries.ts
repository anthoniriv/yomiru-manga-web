import { eq, and } from 'drizzle-orm';
import { getPgDb, pgSchema, closePgDb } from '@yomiru/db';
import { chapterQueue, closeQueues } from '../queues.js';
import { closeRedis } from '../redis.js';

const { series, chapters } = pgSchema;

const slug = process.argv[2];
if (!slug) {
  console.error('usage: tsx src/scripts/retrySeries.ts <slug>');
  process.exit(1);
}

const db = getPgDb();
const [ser] = await db.select().from(series).where(eq(series.slug, slug)).limit(1);
if (!ser) {
  console.error(`series not found: ${slug}`);
  process.exit(1);
}

const rows = await db
  .select({ id: chapters.id, status: chapters.downloadStatus })
  .from(chapters)
  .where(and(eq(chapters.seriesId, ser.id), eq(chapters.downloadStatus, 'pending')));

console.log(`[retry] series=${ser.slug} pending=${rows.length}`);

const queue = chapterQueue();
for (const ch of rows) {
  await queue.add(
    'download',
    { chapterId: ch.id },
    { jobId: `ch-${ch.id}-retry-${Date.now()}`, removeOnComplete: 1000, removeOnFail: 500 },
  );
}

console.log(`[retry] enqueued ${rows.length} chapters`);

await closeQueues();
await closeRedis();
await closePgDb();
