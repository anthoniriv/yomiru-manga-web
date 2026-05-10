import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { CapibaraProvider } from '../apps/ingestor/src/sources/capibara.js';
import {
  upsertChapter,
  replacePages,
  setChapterStatus,
  listChaptersBySeries,
} from '../apps/ingestor/src/repo.js';
import { closePgDb } from '../packages/db/src/client.pg.js';

const OUT_DIR = join(process.cwd(), 'tools', 'data');
const PACE_MS = 150;
const PAGE_FETCH_CONCURRENCY = 4;

interface MatchedEntry {
  seriesId: string;
  title: string;
  externalId: string;
  scanSlug: string;
  mangaSlug: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processEntry(
  provider: CapibaraProvider,
  entry: MatchedEntry,
): Promise<{ newChapters: number; newPages: number }> {
  const { chapters } = await provider.fetchSeriesDetails(entry.externalId);
  if (chapters.length === 0) return { newChapters: 0, newPages: 0 };

  const existing = await listChaptersBySeries(entry.seriesId);
  const existingNums = new Set(existing.map((c) => Number(c.number)));

  const fresh = chapters.filter((c) => !existingNums.has(Number(c.number)));
  if (fresh.length === 0) return { newChapters: 0, newPages: 0 };

  const inserted: Array<{ id: string; sourceUrl: string }> = [];
  for (const ch of fresh) {
    const ins = await upsertChapter({
      seriesId: entry.seriesId,
      number: ch.number,
      title: ch.title,
      language: ch.language,
      sourceUrl: ch.sourceUrl,
      sourceChapterId: ch.externalId,
      publishedAt: ch.publishedAt ?? undefined,
    });
    inserted.push({ id: ins.id, sourceUrl: ch.sourceUrl });
  }

  let newPages = 0;
  for (let i = 0; i < inserted.length; i += PAGE_FETCH_CONCURRENCY) {
    const batch = inserted.slice(i, i + PAGE_FETCH_CONCURRENCY);
    await Promise.all(
      batch.map(async (cr) => {
        try {
          const imgs = await provider.fetchChapterImages({
            externalId: '',
            sourceUrl: cr.sourceUrl,
            seriesExternalId: entry.externalId,
          });
          if (imgs.length === 0) {
            await setChapterStatus(cr.id, 'failed', { error: 'no images' });
            return;
          }
          const rows = imgs.map((url, idx) => ({
            id: ulid(),
            chapterId: cr.id,
            idx,
            storagePath: null,
            sourceUrl: url,
          }));
          await replacePages(cr.id, rows);
          await setChapterStatus(cr.id, 'completed', { pageCount: imgs.length });
          newPages += imgs.length;
        } catch (e) {
          await setChapterStatus(cr.id, 'failed', { error: (e as Error).message });
        }
      }),
    );
    await sleep(PACE_MS);
  }

  return { newChapters: fresh.length, newPages };
}

async function main() {
  const args = process.argv.slice(2);
  const limit = (() => {
    const idx = args.indexOf('--limit');
    return idx >= 0 ? parseInt(args[idx + 1], 10) : Infinity;
  })();
  const onlyArg = (() => {
    const idx = args.indexOf('--only');
    return idx >= 0 ? args[idx + 1] : null;
  })();

  const raw = await readFile(join(OUT_DIR, 'capibara-matched.json'), 'utf8');
  let entries = JSON.parse(raw) as MatchedEntry[];
  if (onlyArg) {
    entries = entries.filter(
      (e) =>
        e.title.toLowerCase().includes(onlyArg.toLowerCase()) ||
        e.externalId.toLowerCase().includes(onlyArg.toLowerCase()),
    );
  }
  entries = entries.slice(0, Math.min(limit, entries.length));

  console.log(`[update] ${entries.length} matched series to check`);

  const provider = new CapibaraProvider();
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let totalChapters = 0;
  let totalPages = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const tag = `[${i + 1}/${entries.length}] ${e.title}`;
    process.stdout.write(`${tag} checking...\n`);
    try {
      const res = await processEntry(provider, e);
      if (res.newChapters === 0) {
        unchanged += 1;
        console.log(`${tag} up-to-date`);
      } else {
        updated += 1;
        totalChapters += res.newChapters;
        totalPages += res.newPages;
        console.log(`${tag} +${res.newChapters} chapters, +${res.newPages} pages`);
      }
    } catch (err) {
      failed += 1;
      console.warn(`${tag} FAIL: ${(err as Error).message}`);
    }
    await sleep(PACE_MS);
  }

  console.log('---');
  console.log(`updated=${updated} unchanged=${unchanged} failed=${failed}`);
  console.log(`new chapters: ${totalChapters}`);
  console.log(`new pages:    ${totalPages}`);
}

main()
  .then(async () => { await closePgDb(); process.exit(0); })
  .catch(async (e) => {
    console.error('FAIL:', e);
    try { await closePgDb(); } catch {}
    process.exit(1);
  });
