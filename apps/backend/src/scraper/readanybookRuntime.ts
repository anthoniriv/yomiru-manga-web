import { BrowserPool } from './browser.js';

export interface ReadAnyBookTocChapter {
  title: string;
  number: number;
  href: string;
  url: string;
}

export interface ReadAnyBookChapterPayload {
  title: string | null;
  paragraphs: string[];
  images: string[];
}

interface TocItem {
  label: string;
  href: string;
}

interface ChapterRef {
  readerUrl: string;
  href: string | null;
  number: number | null;
}

const browserPool = new BrowserPool();

export function isReadAnyBookHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host.endsWith('readanybook.com');
  } catch {
    return false;
  }
}

export function isReadAnyBookReaderUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return isReadAnyBookHost(rawUrl) && /^\/reader\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isReadAnyBookDetailUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return isReadAnyBookHost(rawUrl) && /\/leer-libros-online-gratis\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function findReadAnyBookReaderUrl(html: string, pageUrl: string): string | null {
  const fromAnchor = html.match(/href=["']([^"']*\/reader\/[^"']+)["']/i)?.[1] || null;
  if (fromAnchor) return resolveUrl(fromAnchor, pageUrl);

  // Best-effort fallback from detail URL slug.
  try {
    const parsed = new URL(pageUrl);
    if (/\/leer-libros-online-gratis\//i.test(parsed.pathname)) {
      const readerPath = parsed.pathname.replace(/\/leer-libros-online-gratis\//i, '/reader/');
      return new URL(readerPath, parsed.origin).toString();
    }
  } catch {
    // Ignore malformed URL.
  }

  return null;
}

export function buildReadAnyBookChapterUrl(readerUrl: string, href: string, number: number): string {
  const normalizedReaderUrl = stripHash(readerUrl);
  const hash = new URLSearchParams({
    href,
    n: String(number),
  }).toString();
  return `${normalizedReaderUrl}#${hash}`;
}

export async function fetchReadAnyBookChapters(readerUrl: string): Promise<ReadAnyBookTocChapter[]> {
  const toc = await readReaderToc(stripHash(readerUrl));
  if (toc.length === 0) return [];

  const selected = pickReadableTocItems(toc);
  const out: ReadAnyBookTocChapter[] = [];
  const used = new Set<string>();

  for (let i = 0; i < selected.length; i++) {
    const item = selected[i];
    const href = item.href.trim();
    if (!href || used.has(href)) continue;
    used.add(href);

    const parsedNumber = parseLeadingNumber(item.label);
    const number = parsedNumber ?? i + 1;
    out.push({
      title: item.label || `Capítulo ${number}`,
      number,
      href,
      url: buildReadAnyBookChapterUrl(readerUrl, href, number),
    });
  }

  return out;
}

export async function fetchReadAnyBookChapterPayload(
  chapterUrl: string,
): Promise<ReadAnyBookChapterPayload | null> {
  const ref = parseReadAnyBookChapterRef(chapterUrl);
  if (!ref) return null;

  return withReaderPage(ref.readerUrl, async (page) => {
    await page.waitForFunction(() => {
      const docRef = (globalThis as any).document;
      const el = docRef?.querySelector?.('foliate-view');
      return !!(el && (el as any).book && Array.isArray((el as any).book.sections));
    }, { timeout: 45000 });

    const payload = await page.evaluate(async (params: { targetHref: string | null; targetNumber: number | null }) => {
      const docRef = (globalThis as any).document;
      const el = docRef?.querySelector?.('foliate-view') as any;
      if (!el || !el.book) return null;

      const book = el.book as any;
      const toc = Array.isArray(book.toc) ? book.toc : [];
      const flat: Array<{ label: string; href: string }> = [];

      const walk = (items: any[]) => {
        for (const it of items || []) {
          const label = typeof it?.label === 'string' ? it.label.trim() : '';
          const href = typeof it?.href === 'string' ? it.href.trim() : '';
          if (href) flat.push({ label, href });
          if (Array.isArray(it?.subitems)) walk(it.subitems);
        }
      };
      walk(toc);

      const targetHref = params.targetHref || null;
      const targetNumber = typeof params.targetNumber === 'number' ? params.targetNumber : null;

      let target = targetHref
        ? flat.find((item) => item.href === targetHref || decodeURIComponent(item.href) === decodeURIComponent(targetHref))
        : null;

      if (!target && targetNumber !== null) {
        target = flat.find((item) => {
          const match = item.label.match(/^\s*(\d+(?:\.\d+)?)/);
          if (!match) return false;
          const num = Number.parseFloat(match[1]);
          return Number.isFinite(num) && Math.abs(num - targetNumber) < 0.0001;
        }) || null;
      }

      if (!target && flat.length > 0) {
        target = flat[0];
      }

      let index = 0;
      try {
        const navigation = target?.href ? el.resolveNavigation(target.href) : { index: 0 };
        index = Number.isFinite(navigation?.index) ? navigation.index : 0;
      } catch {
        index = 0;
      }

      const section = book.sections[index];
      if (!section || typeof section.createDocument !== 'function') return null;

      const sectionDoc = await section.createDocument();
      const title =
        (target?.label && target.label.trim()) ||
        (sectionDoc.querySelector?.('h1,h2,title')?.textContent || '').trim() ||
        null;

      const paragraphCandidates = Array.from(
        sectionDoc.querySelectorAll?.('h1,h2,h3,p,li,blockquote,pre') || [],
      ) as Array<any>;
      const paragraphs = paragraphCandidates
        .map((node) => (node?.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((text) => text.length >= 30);

      const imageNodes = Array.from(sectionDoc.querySelectorAll?.('img') || []) as Array<any>;
      const imageUrls: string[] = [];

      const toDataUrl = async (blob: Blob, hintPath: string) => {
        const mime = blob.type || (() => {
          const lower = hintPath.toLowerCase();
          if (lower.endsWith('.png')) return 'image/png';
          if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
          if (lower.endsWith('.webp')) return 'image/webp';
          if (lower.endsWith('.gif')) return 'image/gif';
          if (lower.endsWith('.avif')) return 'image/avif';
          return 'application/octet-stream';
        })();

        const typedBlob = blob.type ? blob : new Blob([blob], { type: mime });
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error || new Error('Failed to read image blob'));
          reader.readAsDataURL(typedBlob);
        });
      };

      for (const img of imageNodes) {
        const raw = (img?.getAttribute?.('src') || '').trim();
        if (!raw) continue;
        if (/^data:/i.test(raw)) {
          imageUrls.push(raw);
          continue;
        }

        let resolved = raw;
        try {
          if (typeof section.resolveHref === 'function') {
            resolved = section.resolveHref(raw);
          }
        } catch {
          resolved = raw;
        }

        if (/^https?:\/\//i.test(resolved)) {
          imageUrls.push(resolved);
          continue;
        }

        try {
          if (typeof book.loadBlob === 'function') {
            const blob = await book.loadBlob(resolved);
            const dataUrl = await toDataUrl(blob, resolved);
            if (dataUrl) imageUrls.push(dataUrl);
          }
        } catch {
          // Ignore one-off image extraction failures.
        }
      }

      const uniqueParagraphs = Array.from(new Set(paragraphs));
      const uniqueImages = Array.from(new Set(imageUrls));

      return {
        title,
        paragraphs: uniqueParagraphs.slice(0, 1500),
        images: uniqueImages.slice(0, 500),
      };
    }, {
      targetHref: ref.href,
      targetNumber: ref.number,
    });

    return payload;
  });
}

async function readReaderToc(readerUrl: string): Promise<TocItem[]> {
  return withReaderPage(readerUrl, async (page) => {
    await page.waitForFunction(() => {
      const docRef = (globalThis as any).document;
      const el = docRef?.querySelector?.('foliate-view');
      return !!(el && (el as any).book && Array.isArray((el as any).book.toc));
    }, { timeout: 45000 });

    const toc = await page.evaluate(() => {
      const docRef = (globalThis as any).document;
      const el = docRef?.querySelector?.('foliate-view') as any;
      const raw = Array.isArray(el?.book?.toc) ? el.book.toc : [];
      const out: Array<{ label: string; href: string }> = [];

      const walk = (items: any[]) => {
        for (const it of items || []) {
          const label = typeof it?.label === 'string' ? it.label.trim() : '';
          const href = typeof it?.href === 'string' ? it.href.trim() : '';
          if (href) out.push({ label, href });
          if (Array.isArray(it?.subitems)) walk(it.subitems);
        }
      };
      walk(raw);

      return out;
    });

    return toc;
  });
}

function pickReadableTocItems(items: TocItem[]): TocItem[] {
  const chapterLike = items.filter((item) => /^(?:\s*\d+|\s*cap[ií]tulo|\s*chapter)/i.test(item.label));
  if (chapterLike.length >= 3) return chapterLike;

  const withoutFrontMatter = items.filter((item) => {
    const text = `${item.label} ${item.href}`.toLowerCase();
    return !/(cubierta|cover|titulo|title|copyright|indice|índice|toc|contents|portada)/i.test(text);
  });

  return withoutFrontMatter.length > 0 ? withoutFrontMatter : items;
}

function parseReadAnyBookChapterRef(chapterUrl: string): ChapterRef | null {
  if (!isReadAnyBookReaderUrl(chapterUrl)) return null;
  let parsed: URL;
  try {
    parsed = new URL(chapterUrl);
  } catch {
    return null;
  }

  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const href = hashParams.get('href');
  const numberRaw = hashParams.get('n');
  const number = numberRaw && Number.isFinite(Number.parseFloat(numberRaw))
    ? Number.parseFloat(numberRaw)
    : null;

  parsed.hash = '';
  return {
    readerUrl: parsed.toString(),
    href,
    number,
  };
}

function parseLeadingNumber(label: string): number | null {
  const match = label.match(/^\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function stripHash(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

async function withReaderPage<T>(
  readerUrl: string,
  run: (page: any) => Promise<T>,
): Promise<T> {
  const browser = await browserPool.getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  await page.route('**/*', (route: any) => {
    const resourceType = route.request().resourceType();
    if (['font', 'media'].includes(resourceType)) {
      return route.abort();
    }
    return route.continue();
  });

  try {
    await page.goto(readerUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    return await run(page);
  } finally {
    await context.close();
  }
}
