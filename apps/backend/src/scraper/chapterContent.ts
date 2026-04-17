import * as cheerio from 'cheerio';
import { ChapterContent, ChapterContentType } from '@yomiru/shared';
import { fetchTextWithDnsFallback } from './net.js';
import {
  fetchReadAnyBookChapterPayload,
  isReadAnyBookReaderUrl,
} from './readanybookRuntime.js';

const ROOT_SELECTORS = [
  '#chapter-content',
  '#readerarea',
  '.reading-content',
  '.chapter-content',
  '.entry-content',
  '.post-content',
  '.read-container',
  '.reader-container',
  '.manga-chapter',
  '.chapter-page',
  '.content-area',
  'article',
  'main',
];

const IMAGE_ATTRS = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-url',
  'src',
  'srcset',
];

const HARD_IGNORE_IMG_PATTERN =
  /(avatar|favicon|emoji|sprite|blank\.gif|loading|spinner|gravatar|pixel|analytics)/i;

const SOFT_IGNORE_IMG_PATTERN =
  /(logo|icon|banner|ads?|advert|thumb|thumbnail|placeholder)/i;

const IMAGE_URL_PATTERN =
  /\.(?:png|jpe?g|webp|gif|avif|bmp)(?:[?#].*)?$/i;

interface ImageCandidate {
  url: string;
  width: number | null;
  height: number | null;
}

export function extractChapterContent(html: string, pageUrl: string): ChapterContent {
  const $ = cheerio.load(html);

  const readAnyBookContent = extractReadAnyBookChapterContent($, pageUrl);
  if (readAnyBookContent) {
    return readAnyBookContent;
  }

  // Strip obvious non-content sections before scoring.
  $('script, style, noscript, template, iframe, svg, canvas, form').remove();

  const root = pickBestRoot($);
  const scriptSequenceImages = extractScriptedImageSequence(html, pageUrl);
  const primaryImages = extractImagesFromNode(root, $, pageUrl);
  const fallbackImages = primaryImages.length > 0 ? [] : extractImagesFromNode($('body').first(), $, pageUrl);
  const scriptImages = primaryImages.length + fallbackImages.length + scriptSequenceImages.length > 0
    ? []
    : extractImageUrlsFromRawHtml(html, pageUrl);

  const paragraphs = extractParagraphs(root, $);
  const fallbackParagraphs = paragraphs.length > 0 ? [] : extractParagraphs($('body').first(), $);

  const images = uniqueStrings([
    ...scriptSequenceImages,
    ...primaryImages,
    ...fallbackImages,
    ...scriptImages,
  ]).slice(0, 250);
  const textBlocks = uniqueStrings([...paragraphs, ...fallbackParagraphs]).slice(0, 500);
  const contentType = resolveContentType(images.length, textBlocks.length);

  const warnings: string[] = [];
  if (images.length === 0 && textBlocks.length === 0) {
    warnings.push('No readable chapter content could be extracted from this page.');
  } else if (images.length === 0) {
    warnings.push('This chapter appears to be text-only or image URLs are protected.');
  }

  return {
    title: extractTitle($),
    source_url: pageUrl,
    source_domain: safeDomain(pageUrl),
    content_type: contentType,
    images,
    paragraphs: textBlocks,
    warnings,
  };
}

export async function extractChapterContentWithFallback(
  html: string,
  pageUrl: string,
): Promise<ChapterContent> {
  if (isReadAnyBookReaderUrl(pageUrl)) {
    const readAnyBookChapter = await fetchReadAnyBookChapterPayload(pageUrl);
    if (readAnyBookChapter && (readAnyBookChapter.paragraphs.length > 0 || readAnyBookChapter.images.length > 0)) {
      return {
        title: readAnyBookChapter.title,
        source_url: pageUrl,
        source_domain: safeDomain(pageUrl),
        content_type: resolveContentType(readAnyBookChapter.images.length, readAnyBookChapter.paragraphs.length),
        images: readAnyBookChapter.images,
        paragraphs: readAnyBookChapter.paragraphs,
        warnings: [],
      };
    }
  }

  const primary = extractChapterContent(html, pageUrl);
  const shouldTryInMangaFallback =
    isInMangaChapterUrl(pageUrl) &&
    (primary.images.length === 0 || primary.images.every((image) => isInMangaUiImage(image)));

  if (!shouldTryInMangaFallback && (primary.images.length > 0 || primary.paragraphs.length > 0)) {
    return primary;
  }

  const inMangaFallback = await extractInMangaChapterFallback(html, pageUrl);
  if (inMangaFallback && inMangaFallback.images.length > 0) {
    return {
      title: inMangaFallback.title || primary.title,
      source_url: pageUrl,
      source_domain: safeDomain(pageUrl),
      content_type: resolveContentType(inMangaFallback.images.length, inMangaFallback.paragraphs.length),
      images: inMangaFallback.images,
      paragraphs: inMangaFallback.paragraphs,
      warnings: inMangaFallback.warnings,
    };
  }

  const apiFallback = await extractFromApiFallback(pageUrl);
  if (!apiFallback || apiFallback.images.length === 0) {
    return primary;
  }

  return {
    title: apiFallback.title || primary.title,
    source_url: pageUrl,
    source_domain: safeDomain(pageUrl),
    content_type: resolveContentType(apiFallback.images.length, apiFallback.paragraphs.length),
    images: apiFallback.images,
    paragraphs: apiFallback.paragraphs,
    warnings: apiFallback.warnings,
  };
}

export async function extractChapterContentFromUrlFallback(
  pageUrl: string,
): Promise<ChapterContent | null> {
  const html = await fetchChapterHtmlForFallback(pageUrl);
  if (html) {
    const extracted = await extractChapterContentWithFallback(html, pageUrl);
    if (extracted.images.length > 0 || extracted.paragraphs.length > 0) {
      return {
        ...extracted,
        warnings: uniqueStrings([
          ...extracted.warnings.filter(
            (warning) => !/No readable chapter content could be extracted/i.test(warning),
          ),
          'Recovered chapter content using URL fallback.',
        ]),
      };
    }
  }

  const apiFallback = await extractFromApiFallback(pageUrl);
  if (!apiFallback || apiFallback.images.length === 0) {
    return null;
  }

  return {
    title: apiFallback.title,
    source_url: pageUrl,
    source_domain: safeDomain(pageUrl),
    content_type: resolveContentType(apiFallback.images.length, apiFallback.paragraphs.length),
    images: apiFallback.images,
    paragraphs: apiFallback.paragraphs,
    warnings: uniqueStrings([
      ...apiFallback.warnings,
      'Recovered chapter content using URL fallback.',
    ]),
  };
}

function pickBestRoot($: cheerio.CheerioAPI): cheerio.Cheerio<any> {
  const candidates: cheerio.Cheerio<any>[] = [];
  const seen = new Set<any>();

  for (const selector of ROOT_SELECTORS) {
    $(selector).slice(0, 8).each((_i, el) => {
      if (!seen.has(el)) {
        seen.add(el);
        candidates.push($(el));
      }
    });
  }

  if (candidates.length === 0) {
    $('div, section').slice(0, 120).each((_i, el) => {
      if (seen.has(el)) return;
      const node = $(el);
      const imageCount = node.find('img').length;
      const textLength = normalizeText(node.text()).length;
      if (imageCount >= 2 || textLength >= 600) {
        seen.add(el);
        candidates.push(node);
      }
    });
  }

  if (candidates.length === 0) {
    return $('body').first();
  }

  let best = candidates[0];
  let bestScore = scoreNode(best);
  for (const candidate of candidates.slice(1)) {
    const score = scoreNode(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function scoreNode(node: cheerio.Cheerio<any>): number {
  const imageCount = node.find('img').length;
  const paragraphCount = node.find('p').length;
  const linkCount = node.find('a').length;
  const textLength = normalizeText(node.text()).length;

  return (
    imageCount * 20 +
    Math.min(paragraphCount, 120) * 4 +
    Math.min(textLength, 20000) / 150 -
    Math.min(linkCount, 300) * 0.7
  );
}

function extractImagesFromNode(
  root: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
  pageUrl: string,
): string[] {
  const raw: ImageCandidate[] = [];

  root.find('img').slice(0, 3000).each((_i, el) => {
    const image = $(el);
    const url = pickImageUrl(image, pageUrl);
    if (!url || url.startsWith('data:')) return;

    raw.push({
      url,
      width: toNumber(image.attr('width')),
      height: toNumber(image.attr('height')),
    });
  });

  if (raw.length === 0) return [];

  const hardFiltered = raw.filter((item) => !HARD_IGNORE_IMG_PATTERN.test(item.url));
  const softFiltered = hardFiltered.filter((item) => !isProbablyUiImage(item));

  if (softFiltered.length >= Math.max(2, Math.floor(raw.length * 0.2))) {
    return uniqueStrings(softFiltered.map((item) => item.url));
  }

  if (hardFiltered.length > 0) {
    return uniqueStrings(hardFiltered.map((item) => item.url));
  }

  return uniqueStrings(raw.map((item) => item.url));
}

function isProbablyUiImage(candidate: ImageCandidate): boolean {
  if (SOFT_IGNORE_IMG_PATTERN.test(candidate.url)) return true;

  if (
    candidate.width !== null &&
    candidate.height !== null &&
    candidate.width <= 140 &&
    candidate.height <= 140
  ) {
    return true;
  }

  return false;
}

function pickImageUrl(image: cheerio.Cheerio<any>, pageUrl: string): string | null {
  for (const attr of IMAGE_ATTRS) {
    const value = image.attr(attr)?.trim();
    if (!value) continue;

    const picked = attr === 'srcset' ? pickFromSrcset(value) : value;
    if (!picked) continue;

    const resolved = safeResolve(picked, pageUrl);
    if (resolved) return resolved;
  }

  return null;
}

function pickFromSrcset(srcset: string): string | null {
  const parts = srcset
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  // Prefer last candidate, usually the largest image.
  const last = parts[parts.length - 1];
  const url = last.split(/\s+/)[0];
  return url || null;
}

function extractParagraphs(
  root: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): string[] {
  const lines: string[] = [];

  root.find('p, blockquote').slice(0, 1200).each((_i, el) => {
    const text = normalizeText($(el).text());
    if (text.length >= 30) {
      lines.push(text);
    }
  });

  if (lines.length > 0) {
    return lines;
  }

  const clone = root.clone();
  clone.find('img, figure, nav, aside, footer, header').remove();
  const fallback = normalizeText(clone.text());
  if (!fallback) return [];

  const chunks = fallback
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 50);

  return chunks;
}

function extractImageUrlsFromRawHtml(html: string, pageUrl: string): string[] {
  const matches = html.match(/https?:\/\/[^"'`\s<>]+?\.(?:png|jpe?g|webp|gif|avif)(?:\?[^"'`\s<>]*)?/gi) || [];
  const resolved = matches
    .map((value) => safeResolve(value, pageUrl))
    .filter((value): value is string => Boolean(value));
  return uniqueStrings(resolved).filter((value) => !HARD_IGNORE_IMG_PATTERN.test(value));
}

function extractScriptedImageSequence(html: string, pageUrl: string): string[] {
  const dirMatch = html.match(/var\s+dirPath\s*=\s*(['"])([^"'`]+)\1/i);
  if (!dirMatch) return [];

  const imageNames = extractScriptImageNames(html);
  if (imageNames.length === 0) return [];

  const basePath = safeResolve(dirMatch[2].trim(), pageUrl);
  if (!basePath) return [];

  return uniqueStrings(
    imageNames
      .map((name) => safeResolve(name, basePath))
      .filter((url): url is string => Boolean(url))
      .filter((url) => isLikelyImageUrl(url, 'images')),
  );
}

function extractScriptImageNames(html: string): string[] {
  const parseMatch = html.match(/var\s+images\s*=\s*JSON\.parse\(\s*(['"])([\s\S]*?)\1\s*\)/i);
  if (parseMatch) {
    const parsed = parseImageStringArray(parseMatch[2]);
    if (parsed.length > 0) return parsed;
  }

  const arrayMatch = html.match(/var\s+images\s*=\s*(\[[\s\S]*?\])\s*;/i);
  if (!arrayMatch) return [];

  return parseImageStringArray(arrayMatch[1]);
}

function parseImageStringArray(raw: string): string[] {
  const attempts = [
    raw,
    raw.replace(/\\"/g, '"').replace(/\\'/g, "'"),
  ];

  for (const candidate of attempts) {
    const parsed = safeParseJson(candidate);
    if (Array.isArray(parsed)) {
      const out = parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
      if (out.length > 0) {
        return uniqueStrings(out);
      }
    }
  }

  return [];
}

async function fetchChapterHtmlForFallback(pageUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(pageUrl, {
      headers: buildChapterRequestHeaders(pageUrl),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function extractInMangaChapterFallback(
  html: string,
  pageUrl: string,
): Promise<Pick<ChapterContent, 'title' | 'images' | 'paragraphs' | 'warnings'> | null> {
  if (!isInMangaChapterUrl(pageUrl)) return null;

  const imageTemplateMatch = html.match(/var\s+pu\s*=\s*['"]([^'"]+)['"]/i);
  const chapterIdMatch = html.match(/var\s+cid\s*=\s*['"]([0-9a-f-]{36})['"]/i);
  if (!imageTemplateMatch || !chapterIdMatch) return null;

  const template = imageTemplateMatch[1].trim();
  const chapterId = chapterIdMatch[1].trim();
  if (!template || !chapterId) return null;

  const controlsUrl = new URL(
    `/chapter/chapterIndexControls?identification=${encodeURIComponent(chapterId)}`,
    pageUrl,
  ).toString();

  let controlsHtml = '';
  try {
    controlsHtml = await fetchTextWithDnsFallback(controlsUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: pageUrl,
      },
    });
  } catch {
    return null;
  }

  const $$ = cheerio.load(controlsHtml);
  const pageIds = $$('#PageList option')
    .map((_idx, el) => $$(el).attr('value')?.trim() || '')
    .get()
    .filter(Boolean);

  if (pageIds.length === 0) return null;

  const images = uniqueStrings(
    pageIds
      .map((id) => template.replace(/identification/gi, id))
      .map((url) => safeResolve(url, pageUrl))
      .filter((url): url is string => Boolean(url)),
  );

  if (images.length === 0) return null;

  const title =
    normalizeText(cheerio.load(html)('title').first().text()) ||
    null;

  return {
    title,
    images,
    paragraphs: [],
    warnings: ['Recovered pages via InManga chapter controls fallback.'],
  };
}

function buildChapterRequestHeaders(pageUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.7,en;q=0.6',
  };

  try {
    const parsed = new URL(pageUrl);
    const host = parsed.hostname.replace(/^www\./i, '');
    if (host === 'zonatmo.com' && /^\/view_uploads\/\d+/i.test(parsed.pathname)) {
      headers.Referer = `${parsed.origin}/library`;
      headers.Origin = parsed.origin;
    }
  } catch {
    // Keep default headers.
  }

  return headers;
}

function isInMangaChapterUrl(pageUrl: string): boolean {
  try {
    const parsed = new URL(pageUrl);
    const host = parsed.hostname.replace(/^www\./i, '');
    return host === 'inmanga.com' && /^\/ver\/manga\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isInMangaUiImage(url: string): boolean {
  return (
    /assets\.intomanga\.com\/content\/img\/onmangalogo/i.test(url) ||
    /loading-gear/i.test(url)
  );
}

function extractReadAnyBookChapterContent(
  $: cheerio.CheerioAPI,
  pageUrl: string,
): ChapterContent | null {
  if (!isReadAnyBookDetailUrl(pageUrl)) return null;

  const textSectionHeading = $('h2').filter((_i, el) => /texto del libro/i.test($(el).text())).first();
  const textSection = textSectionHeading.next('div');
  const summarySection = $('div.row-span-1.col-span-2[x-data*="expanded"]').first();

  const textBlocks = uniqueStrings([
    ...extractReadAnyBookParagraphs(textSection, $),
    ...extractReadAnyBookParagraphs(summarySection, $),
  ]).slice(0, 500);

  if (textBlocks.length === 0) return null;

  return {
    title: extractTitle($),
    source_url: pageUrl,
    source_domain: safeDomain(pageUrl),
    content_type: resolveContentType(0, textBlocks.length),
    images: [],
    paragraphs: textBlocks,
    warnings: [],
  };
}

function extractReadAnyBookParagraphs(
  node: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): string[] {
  if (!node || node.length === 0) return [];

  const merged = node
    .find('span')
    .toArray()
    .map((el) => $(el).text())
    .map((text) => text.replace(/\r/g, '').trim())
    .filter((text) => text.length > 0 && text !== '...')
    .join(' ');

  if (!merged) return [];

  return merged
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => line.replace(/\s+/g, ' '))
    .filter((line) => line.length >= 40);
}

function isReadAnyBookDetailUrl(pageUrl: string): boolean {
  try {
    const parsed = new URL(pageUrl);
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('readanybook.com') && /\/leer-libros-online-gratis\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function extractFromApiFallback(pageUrl: string): Promise<ChapterContent | null> {
  const chapterId = extractChapterIdFromUrl(pageUrl);
  if (!chapterId) return null;

  const endpoints = buildChapterApiCandidates(pageUrl, chapterId);
  for (const endpoint of endpoints) {
    const payload = await fetchJson(endpoint);
    if (!payload) continue;

    const parsed = parseChapterPayload(payload, pageUrl);
    if (parsed.images.length === 0) continue;

    return {
      title: parsed.title,
      source_url: pageUrl,
      source_domain: safeDomain(pageUrl),
      content_type: resolveContentType(parsed.images.length, parsed.paragraphs.length),
      images: parsed.images,
      paragraphs: parsed.paragraphs,
      warnings: [`Recovered pages via API fallback (${new URL(endpoint).hostname}).`],
    };
  }

  return null;
}

function extractChapterIdFromUrl(pageUrl: string): string | null {
  try {
    const parsed = new URL(pageUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const targets = new Set([
      'leer',
      'leer_18',
      'read',
      'reader',
      'chapter',
      'chapters',
      'view_uploads',
    ]);

    for (let i = 0; i < segments.length - 1; i++) {
      if (targets.has(segments[i].toLowerCase())) {
        return decodeURIComponent(segments[i + 1]);
      }
    }

    const last = segments[segments.length - 1];
    if (last && /[_-]/.test(last)) {
      return decodeURIComponent(last);
    }
  } catch {
    return null;
  }

  return null;
}

function buildChapterApiCandidates(pageUrl: string, chapterId: string): string[] {
  try {
    const parsed = new URL(pageUrl);
    const hostNoWww = parsed.hostname.replace(/^www\./i, '');
    const isManhwaWeb = /manhwaweb\.com$/i.test(hostNoWww);
    const hostCandidates = new Set<string>([
      ...(isManhwaWeb ? ['https://manhwawebbackend-production.up.railway.app'] : []),
      `https://${hostNoWww}`,
      `https://www.${hostNoWww}`,
      parsed.origin,
    ]);

    const routeCandidates = [
      `/chapters/see/${encodeURIComponent(chapterId)}`,
      `/api/chapters/see/${encodeURIComponent(chapterId)}`,
      `/chapter/see/${encodeURIComponent(chapterId)}`,
      `/api/chapter/see/${encodeURIComponent(chapterId)}`,
    ];

    const out: string[] = [];
    for (const host of hostCandidates) {
      for (const route of routeCandidates) {
        try {
          out.push(new URL(route, host).toString());
        } catch {
          // Ignore invalid combinations.
        }
      }
    }

    return uniqueStrings(out).slice(0, 8);
  } catch {
    return [];
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (!text || text.length < 2) return null;

    if (
      !contentType.includes('json') &&
      !text.trim().startsWith('{') &&
      !text.trim().startsWith('[')
    ) {
      return null;
    }

    return safeParseJson(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseChapterPayload(
  payload: unknown,
  pageUrl: string,
): Pick<ChapterContent, 'title' | 'images' | 'paragraphs'> {
  const obj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  const directImages = toImageArray((obj.chapter as Record<string, unknown> | undefined)?.img, pageUrl);
  if (directImages.length > 0) {
    const title =
      pickString(obj.name, (obj.chapter as Record<string, unknown> | undefined)?.name) || null;
    return { title, images: directImages, paragraphs: [] };
  }

  const images = extractImagesFromUnknownJson(payload, pageUrl);
  const title =
    pickString(
      obj.title,
      obj.name,
      (obj.chapter as Record<string, unknown> | undefined)?.name,
      (obj.chapter as Record<string, unknown> | undefined)?.title,
    ) || null;

  return {
    title,
    images,
    paragraphs: [],
  };
}

function toImageArray(value: unknown, baseUrl: string): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value
      .map((item) => (typeof item === 'string' ? safeResolve(item, baseUrl) : null))
      .filter((item): item is string => Boolean(item)),
  );
}

function extractImagesFromUnknownJson(payload: unknown, baseUrl: string): string[] {
  const out = new Set<string>();
  const queue: Array<{ value: unknown; keyHint: string }> = [{ value: payload, keyHint: '' }];
  let visits = 0;

  while (queue.length > 0 && visits < 2500) {
    const current = queue.shift();
    if (!current) break;
    visits++;

    const { value, keyHint } = current;
    if (typeof value === 'string') {
      const normalized = value.trim();
      const resolved = safeResolve(normalized, baseUrl);
      if (!resolved) continue;
      if (isLikelyImageUrl(resolved, keyHint)) {
        out.add(resolved);
      }
      continue;
    }

    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (const item of value.slice(0, 300)) {
        queue.push({ value: item, keyHint });
      }
      continue;
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(0, 300);
    for (const [key, nested] of entries) {
      queue.push({ value: nested, keyHint: key.toLowerCase() });
    }
  }

  return Array.from(out);
}

function isLikelyImageUrl(url: string, keyHint: string): boolean {
  if (HARD_IGNORE_IMG_PATTERN.test(url)) return false;

  if (IMAGE_URL_PATTERN.test(url)) return true;
  if (/\/images?\//i.test(url)) return true;
  if (/(img|image|page|pages|panel|panels|chapter)/i.test(keyHint)) return true;

  return false;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractTitle($: cheerio.CheerioAPI): string | null {
  return (
    normalizeText($('h1').first().text()) ||
    normalizeText($('meta[property="og:title"]').attr('content') || '') ||
    normalizeText($('title').first().text()) ||
    null
  );
}

function resolveContentType(imageCount: number, paragraphCount: number): ChapterContentType {
  if (imageCount > 0 && paragraphCount > 0) return 'mixed';
  if (imageCount > 0) return 'images';
  if (paragraphCount > 0) return 'text';
  return 'unknown';
}

function safeResolve(input: string, base: string): string | null {
  try {
    return new URL(input, base).toString();
  } catch {
    return null;
  }
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
