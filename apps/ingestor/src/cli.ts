import {
  discoverQueue,
  chapterQueue,
  catalogQueue,
  mirrorQueue,
  closeQueues,
} from './queues.js';
import { closeRedis } from './redis.js';
import { closeDb, closePgDb, getDb, getPgDb, pgSchema, series, chapters, pages } from '@yomiru/db';
import { eq, sql } from 'drizzle-orm';
import { config } from './config.js';
import { resetInvalidDownloadedChapters, setChapterStatus } from './repo.js';

const pgSeries = pgSchema.series;
const pgChapters = pgSchema.chapters;

function readFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function readNumberFlag(args: string[], name: string): number | undefined {
  const value = readFlag(args, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function cmdAdd(args: string[]) {
  const url = args[0];
  const kind = (args[1] ?? 'manga') as 'manga' | 'book';
  if (!url) throw new Error('usage: cli add <url> [manga|book]');
  const job = await discoverQueue().add('discover', { url, kind });
  console.log(`[cli] queued discover job=${job.id} url=${url} kind=${kind}`);
}

async function cmdResync(args: string[]) {
  const slugOrId = args[0];
  if (!slugOrId) throw new Error('usage: cli resync <slug|id>');
  const db = getDb();
  const row =
    db.select().from(series).where(eq(series.id, slugOrId)).get() ??
    db.select().from(series).where(eq(series.slug, slugOrId)).get();
  if (!row) throw new Error(`series not found: ${slugOrId}`);
  const job = await discoverQueue().add('discover', {
    url: row.sourceUrl,
    kind: row.kind as 'manga' | 'book',
    forceResync: true,
  });
  console.log(`[cli] queued resync job=${job.id} series=${row.slug}`);
}

async function cmdRetryFailed() {
  const db = getPgDb();
  const rows = await db
    .select({ id: pgChapters.id })
    .from(pgChapters)
    .where(eq(pgChapters.downloadStatus, 'failed'));
  const queue = chapterQueue();
  for (const ch of rows) {
    await queue.add('download', { chapterId: ch.id }, { jobId: `ch-${ch.id}-retry-${Date.now()}` });
  }
  console.log(`[cli] requeued ${rows.length} failed chapters (PG)`);
}

async function cmdCatalog(args: string[]) {
  const source = (args[0] ?? 'zonatmo') as 'zonatmo';
  if (source !== 'zonatmo') throw new Error('usage: cli catalog zonatmo [--start-page N] [--max-pages N] [--no-details] [--no-mirror]');
  const job = await catalogQueue().add('catalog', {
    source,
    startPage: readNumberFlag(args, 'start-page'),
    maxPages: readNumberFlag(args, 'max-pages'),
    fetchDetails: !args.includes('--no-details'),
    enqueueMirror: !args.includes('--no-mirror'),
    enrichMal: !args.includes('--no-mal'),
  });
  console.log(`[cli] queued catalog job=${job.id} source=${source}`);
}

async function cmdMirror(args: string[]) {
  const limit = readNumberFlag(args, 'limit') ?? Number(args[0]);
  const job = await mirrorQueue().add('mirror', {
    limit: Number.isFinite(limit) ? limit : undefined,
    retryFailed: args.includes('--retry-failed'),
  });
  console.log(`[cli] queued mirror job=${job.id}`);
}

async function cmdDownload(args: string[]) {
  const chapterId = args[0];
  if (!chapterId) throw new Error('usage: cli download <chapter-id>');
  setChapterStatus(chapterId, 'queued');
  const job = await chapterQueue().add('download', { chapterId }, { jobId: `ch-${chapterId}-urgent-${Date.now()}` });
  console.log(`[cli] queued urgent chapter job=${job.id} chapter=${chapterId}`);
}

async function cmdStats() {
  const db = getDb();
  const counts = {
    series: db.select({ count: sql<number>`count(*)` }).from(series).get()?.count ?? 0,
    chapters: db.select({ count: sql<number>`count(*)` }).from(chapters).get()?.count ?? 0,
    pages: db.select({ count: sql<number>`count(*)` }).from(pages).get()?.count ?? 0,
    bytes: db
      .select({ bytes: sql<number>`coalesce(sum(coalesce(${pages.bytes}, 0)), 0)` })
      .from(pages)
      .get()?.bytes ?? 0,
  };
  console.log(
    `[stats] series=${counts.series} chapters=${counts.chapters} pages=${counts.pages} storage=${(Number(counts.bytes) / 1024 / 1024 / 1024).toFixed(2)}GB/${(config.storageMaxBytes / 1024 / 1024 / 1024).toFixed(0)}GB`,
  );
}

async function cmdRepairInvalidPages() {
  const count = resetInvalidDownloadedChapters();
  console.log(`[cli] reset invalid downloaded chapters=${count}`);
}

async function cmdList() {
  const db = getDb();
  const rows = db.select().from(series).all();
  for (const r of rows) {
    const chs = db
      .select({ status: chapters.downloadStatus })
      .from(chapters)
      .where(eq(chapters.seriesId, r.id))
      .all();
    const counts = chs.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `${r.kind}\t${r.slug}\ttitle="${r.title}"\tchapters=${chs.length}\t${JSON.stringify(counts)}`,
    );
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'add':
        await cmdAdd(rest);
        break;
      case 'resync':
        await cmdResync(rest);
        break;
      case 'retry-failed':
        await cmdRetryFailed();
        break;
      case 'catalog':
        await cmdCatalog(rest);
        break;
      case 'mirror':
        await cmdMirror(rest);
        break;
      case 'download':
        await cmdDownload(rest);
        break;
      case 'stats':
        await cmdStats();
        break;
      case 'repair-invalid-pages':
        await cmdRepairInvalidPages();
        break;
      case 'list':
        await cmdList();
        break;
      default:
        console.log(
          'commands:\n  add <url> [manga|book]\n  catalog zonatmo [--start-page N] [--max-pages N] [--no-mal]\n  mirror [--limit N] [--retry-failed]\n  download <chapter-id>\n  resync <slug|id>\n  retry-failed\n  repair-invalid-pages\n  stats\n  list',
        );
    }
  } finally {
    await closeQueues();
    await closeRedis();
    closeDb();
    await closePgDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
