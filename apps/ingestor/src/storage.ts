import { extname, join, resolve } from 'node:path';
import slugify from 'slugify';
import { r2Upload } from '@yomiru/r2';
import { config } from './config.js';

export function makeSlug(title: string, fallback: string): string {
  const slug = slugify(title || '', { lower: true, strict: true, locale: 'es' });
  return slug || fallback;
}

export function chapterKey(
  kind: 'manga' | 'book',
  slug: string,
  chapterNumber: number,
): string {
  return `${kind}/${slug}/c${formatChapterNum(chapterNumber)}`;
}

export function formatChapterNum(n: number): string {
  if (Number.isInteger(n)) return String(n).padStart(4, '0');
  const [int, dec] = String(n).split('.');
  return `${int.padStart(4, '0')}.${dec}`;
}

// Keep for backward compat (local paths used in migration script)
export function seriesDir(kind: 'manga' | 'book', slug: string): string {
  return resolve(config.storageDir, kind, slug);
}

export function chapterDir(
  kind: 'manga' | 'book',
  slug: string,
  chapterNumber: number,
): string {
  return join(seriesDir(kind, slug), `c${formatChapterNum(chapterNumber)}`);
}

export function relativeStoragePath(absPath: string): string {
  return absPath.startsWith(config.storageDir)
    ? absPath.slice(config.storageDir.length + 1)
    : absPath;
}

export interface DownloadedAsset {
  key: string;
  bytes: number;
  mime: string | null;
}

const RETRYABLE = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up|aborted|fetch failed/i;

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status >= 500 && i < attempts - 1) {
        lastErr = new Error(`http ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!RETRYABLE.test(msg) && !(err instanceof Error && err.name === 'TimeoutError')) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function downloadAndUpload(
  url: string,
  key: string,
  headers: Record<string, string> = {},
): Promise<DownloadedAsset> {
  const res = await fetchWithRetry(url, {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    ...headers,
  });
  if (!res.ok) throw new Error(`download failed ${res.status} ${url}`);
  const mime = res.headers.get('content-type');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`download empty ${url}`);
  if (mime?.toLowerCase().startsWith('text/html')) {
    throw new Error(`download returned html ${url}`);
  }
  await r2Upload(key, buf, mime ?? undefined);
  return { key, bytes: buf.length, mime };
}

export function pageFileName(idx: number, sourceUrl: string): string {
  const ext = (extname(new URL(sourceUrl).pathname) || '.jpg').toLowerCase();
  const safeExt = /^\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(ext) ? ext : '.jpg';
  return `${String(idx).padStart(4, '0')}${safeExt}`;
}

export function pageKey(
  kind: 'manga' | 'book',
  slug: string,
  chapterNumber: number,
  idx: number,
  sourceUrl: string,
): string {
  return `${chapterKey(kind, slug, chapterNumber)}/${pageFileName(idx, sourceUrl)}`;
}
