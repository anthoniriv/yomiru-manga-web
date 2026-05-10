import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ulid } from 'ulid';
import slugify from 'slugify';
import { CapibaraProvider } from '../apps/ingestor/src/sources/capibara.js';
import {
  upsertSeries,
  upsertChapter,
  replacePages,
  setChapterStatus,
  findSeriesBySource,
  listChaptersBySeries,
  createId,
} from '../apps/ingestor/src/repo.js';
import { closePgDb } from '../packages/db/src/client.pg.js';
import { sql } from 'drizzle-orm';
import { getPgDb } from '../packages/db/src/index.js';

const OUT_DIR = join(process.cwd(), 'tools', 'data');
const SOURCE_NAME = 'capibaratraductor.com';
const PACE_MS = 150;
const PAGE_FETCH_CONCURRENCY = 4;

interface CapibaraEntry {
  scanSlug: string;
  scanName: string;
  mangaSlug: string;
  mangaCustomId: number;
  title: string;
  altTitle: string | null;
  isNSFW: boolean;
  views: number;
  totalChapters: number;
  imageUrl: string | null;
  bannerUrl: string | null;
  status: string;
  description: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeSlug(title: string, fallback: string): string {
  return slugify(title || '', { lower: true, strict: true, locale: 'es' }) || fallback;
}

async function processEntry(
  provider: CapibaraProvider,
  entry: CapibaraEntry,
  opts: { skipPages: boolean },
): Promise<{ chapters: number; pages: number; skipped: boolean }> {
  const externalId = `${entry.scanSlug}/${entry.mangaSlug}`;
  const sourceUrl = `https://capibaratraductor.com/${entry.scanSlug}/manga/${entry.mangaSlug}`;

  let existing = await findSeriesBySource(SOURCE_NAME, sourceUrl);
  if (existing && existing.totalChapters > 0 && !opts.skipPages) {
    // Resume: skip series fully ingested (chapters exist + at least one page exists)
    const existingChapters = await listChaptersBySeries(existing.id);
    if (existingChapters.length >= existing.totalChapters) {
      const r = await getPgDb().execute<{ count: string }>(sql`
        SELECT COUNT(*) AS count FROM manga.pages p
        JOIN manga.chapters c ON p.chapter_id = c.id
        WHERE c.series_id = ${existing.id}
      `);
      const rows: any = Array.isArray(r) ? r : (r as any).rows ?? [];
      if (Number(rows[0]?.count ?? 0) > 0) {
        return { chapters: 0, pages: 0, skipped: true };
      }
    }
  }

  const { series, chapters } = await provider.fetchSeriesDetails(externalId);

  let slug = makeSlug(series.title, externalId.replace('/', '-'));
  let normalizedTitle = makeSlug(series.title, slug);

  // Slug/normalizedTitle collision handling: if a series with this
  // slug+kind OR normalizedTitle+kind already exists (zonatmo orphan with
  // same title, or another capibara scan publishing the same manga), MERGE
  // or DISAMBIGUATE depending on what kind of row collides.
  if (!existing) {
    const db = getPgDb();
    const collision = await db.execute<{
      id: string; source_name: string; source_url: string; total_chapters: number;
    }>(sql`
      SELECT id, source_name, source_url, total_chapters
      FROM manga.series
      WHERE (slug = ${slug} OR normalized_title = ${normalizedTitle}) AND kind = ${series.kind}
      LIMIT 1
    `);
    const rows: any = Array.isArray(collision) ? collision : (collision as any).rows ?? [];
    const hit = rows[0];
    if (hit) {
      // If hit is already from capibara (another scan published same manga),
      // skip — first scan wins. Avoids creating duplicate entries.
      if (hit.source_name === SOURCE_NAME) {
        return { chapters: 0, pages: 0, skipped: true };
      }
      // Refuse to merge if colliding (non-capibara) series has real R2 pages —
      // would destroy user content. Disambiguate slug+normalizedTitle.
      const pc = await db.execute<{ count: string }>(sql`
        SELECT COUNT(*) AS count FROM manga.pages p
        JOIN manga.chapters c ON p.chapter_id = c.id
        WHERE c.series_id = ${hit.id}
      `);
      const pcRows: any = Array.isArray(pc) ? pc : (pc as any).rows ?? [];
      if (Number(pcRows[0]?.count ?? 0) > 0) {
        // Existing non-capibara row has R2 content — keep it, skip capibara dup
        return { chapters: 0, pages: 0, skipped: true };
      } else {
        // Empty cascarón — overwrite source, clear R2 paths, drop orphan chapters.
        await db.execute(sql`
          UPDATE manga.series
          SET source_name = ${SOURCE_NAME},
              source_url = ${sourceUrl},
              cover_path = NULL,
              banner_path = NULL,
              updated_at = now()
          WHERE id = ${hit.id}
        `);
        await db.execute(sql`DELETE FROM manga.chapters WHERE series_id = ${hit.id}`);
        existing = await findSeriesBySource(SOURCE_NAME, sourceUrl);
      }
    }
  }
  const popularity = entry.views > 0 ? entry.views : chapters.length;
  const saved = await upsertSeries({
    id: existing?.id ?? createId(),
    kind: series.kind,
    slug,
    title: series.title,
    normalizedTitle,
    altTitles: series.altTitles,
    description: series.description,
    coverPath: null,
    coverSourceUrl: series.coverUrl,
    bannerPath: null,
    bannerSourceUrl: entry.bannerUrl,
    rating: series.rating,
    voteCount: 0,
    popularity,
    totalChapters: chapters.length,
    mirrorPriority: Math.round(popularity * 100),
    status: series.status,
    isAdult: !!entry.isNSFW,
    year: series.year,
    author: series.author,
    artist: series.artist,
    sourceName: SOURCE_NAME,
    sourceUrl,
    sourceId: externalId,
  });

  let pageCount = 0;
  // Insert chapters first
  const chapterRecords: Array<{ id: string; number: number; sourceUrl: string }> = [];
  for (const ch of chapters) {
    const ins = await upsertChapter({
      seriesId: saved.id,
      number: ch.number,
      title: ch.title,
      language: ch.language,
      sourceUrl: ch.sourceUrl,
      sourceChapterId: ch.externalId,
      publishedAt: ch.publishedAt ?? undefined,
    });
    chapterRecords.push({ id: ins.id, number: ch.number, sourceUrl: ch.sourceUrl });
  }

  if (opts.skipPages) {
    return { chapters: chapters.length, pages: 0, skipped: false };
  }

  // Fetch pages in limited parallel batches
  for (let i = 0; i < chapterRecords.length; i += PAGE_FETCH_CONCURRENCY) {
    const batch = chapterRecords.slice(i, i + PAGE_FETCH_CONCURRENCY);
    await Promise.all(
      batch.map(async (cr) => {
        try {
          const imgs = await provider.fetchChapterImages({
            externalId: '',
            sourceUrl: cr.sourceUrl,
            seriesExternalId: externalId,
          });
          if (imgs.length === 0) {
            await setChapterStatus(cr.id, 'failed', { error: 'no images' });
            return;
          }
          // Hot-link: storagePath null, sourceUrl is the capibara CDN URL
          const rows = imgs.map((url, idx) => ({
            id: ulid(),
            chapterId: cr.id,
            idx,
            storagePath: null,
            sourceUrl: url,
          }));
          await replacePages(cr.id, rows);
          await setChapterStatus(cr.id, 'completed', { pageCount: imgs.length });
          pageCount += imgs.length;
        } catch (e) {
          await setChapterStatus(cr.id, 'failed', { error: (e as Error).message });
        }
      }),
    );
    await sleep(PACE_MS);
  }

  return { chapters: chapters.length, pages: pageCount, skipped: false };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const skipPages = args.has('--skip-pages');
  const limit = (() => {
    const idx = process.argv.indexOf('--limit');
    return idx > 0 ? parseInt(process.argv[idx + 1], 10) : Infinity;
  })();

  const raw = await readFile(join(OUT_DIR, 'capibara-extra.json'), 'utf8');
  const all = JSON.parse(raw) as CapibaraEntry[];
  // Order by views desc — ingest popular first
  all.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const entries = all.slice(0, Math.min(limit, all.length));
  console.log(`[ingest] ${entries.length} entries to process (skipPages=${skipPages})`);

  const provider = new CapibaraProvider();
  process.stdout.write(''); // ensure unbuffered
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let totalChapters = 0;
  let totalPages = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const tag = `[${i + 1}/${entries.length}] ${e.scanSlug}/${e.mangaSlug}`;
    process.stdout.write(`${tag} fetching...\n`);
    try {
      const res = await processEntry(provider, e, { skipPages });
      if (res.skipped) {
        skipped += 1;
        console.log(`${tag} SKIP (already ingested)`);
      } else {
        ok += 1;
        totalChapters += res.chapters;
        totalPages += res.pages;
        console.log(`${tag} OK chapters=${res.chapters} pages=${res.pages}`);
      }
    } catch (err) {
      failed += 1;
      console.warn(`${tag} FAIL: ${(err as Error).message}`);
    }
    await sleep(PACE_MS);
  }

  console.log('---');
  console.log(`ok=${ok} skipped=${skipped} failed=${failed}`);
  console.log(`chapters added: ${totalChapters}`);
  console.log(`pages added:    ${totalPages}`);
}

main()
  .then(async () => { await closePgDb(); process.exit(0); })
  .catch(async (e) => {
    console.error('FAIL:', e);
    try { await closePgDb(); } catch {}
    process.exit(1);
  });
