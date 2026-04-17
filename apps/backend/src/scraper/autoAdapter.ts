import { ScrapedChapter } from '@yomiru/shared';
import { extractChapterNumber } from './strategies/base.js';

export interface AutoAdapterResult {
  title: string | null;
  description: string | null;
  cover_image_url: string | null;
  chapters: ScrapedChapter[];
  warnings: string[];
}

interface InferredData {
  title: string | null;
  description: string | null;
  cover_image_url: string | null;
  chapters: ScrapedChapter[];
}

interface CandidateArray {
  path: string;
  items: unknown[];
}

const CHAPTER_NUMBER_KEYS = [
  'chapter',
  'capitulo',
  'cap',
  'number',
  'num',
  'episode',
  'ep',
  'index',
  'position',
  'order',
];

const CHAPTER_TITLE_KEYS = ['title', 'name', 'chapter_title', 'chapterName', 'chapter_name'];
const CHAPTER_URL_KEYS = ['url', 'link', 'href', 'path', 'readUrl', 'read_url', 'chapter_url'];

const TITLE_KEYS = [
  'the_real_name',
  'name_esp',
  'title',
  'name',
  'series_name',
  'manga_name',
  'novel_name',
];

const DESCRIPTION_KEYS = ['description', 'synopsis', 'sinopsis', 'summary', 'story', '_sinopsis'];
const COVER_KEYS = [
  'cover_image_url',
  'cover',
  'poster',
  'thumbnail',
  'image',
  'img',
  '_imagen',
];

const DEFAULT_API_ROUTES = [
  '/api/manga',
  '/api/manhwa',
  '/api/novel',
  '/api/series',
  '/api/comic',
  '/api/title',
  '/manga/see',
  '/manhwa/see',
  '/novel/see',
  '/series/see',
  '/comic/see',
  '/manga/info',
  '/manhwa/info',
  '/chapters/see',
];

export async function runAutoAdapter(url: string, html: string): Promise<AutoAdapterResult> {
  const result: AutoAdapterResult = {
    title: null,
    description: null,
    cover_image_url: null,
    chapters: [],
    warnings: [],
  };

  let baseUrl: URL;
  try {
    baseUrl = new URL(url);
  } catch {
    result.warnings.push('Auto-adapter skipped: invalid URL');
    return result;
  }

  // 1) Parse embedded page JSON (hydration payloads, scripts, etc.).
  const inlineJson = extractInlineJsonCandidates(html);
  for (const payload of inlineJson) {
    const inferred = inferFromUnknownData(payload, url);
    mergeInferred(result, inferred, url);
    if (result.chapters.length >= 5 && result.title) {
      return result;
    }
  }

  // 2) Discover potential API hosts/routes from JS bundles and query them.
  const scriptUrls = extractScriptUrls(html, url).slice(0, 4);
  const scriptBodies = await fetchTextBatch(scriptUrls, 2);
  const relatedHosts = discoverRelatedHosts(baseUrl.hostname, scriptBodies);
  const routes = discoverApiRoutes(scriptBodies);

  const ids = extractEntityIds(baseUrl);
  const endpoints = buildCandidateEndpoints(baseUrl, relatedHosts, routes, ids);

  const endpointPayloads = await fetchJsonBatch(endpoints, 48);
  for (const payload of endpointPayloads) {
    const inferred = inferFromUnknownData(payload, url);
    mergeInferred(result, inferred, url);
  }

  return result;
}

function mergeInferred(target: AutoAdapterResult, inferred: InferredData, pageUrl: string) {
  if (!target.title && inferred.title) target.title = inferred.title;
  if (!target.description && inferred.description) target.description = inferred.description;
  if (!target.cover_image_url && inferred.cover_image_url) {
    target.cover_image_url = safeResolve(inferred.cover_image_url, pageUrl);
  }

  if (inferred.chapters.length === 0) return;

  const seen = new Set(target.chapters.map((ch) => `${ch.number}|${ch.url}`));
  for (const chapter of inferred.chapters) {
    const key = `${chapter.number}|${chapter.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      target.chapters.push(chapter);
    }
  }

  target.chapters.sort((a, b) => a.number - b.number);
}

function extractInlineJsonCandidates(html: string): unknown[] {
  const candidates: unknown[] = [];

  const scriptJsonMatches = html.matchAll(
    /<script[^>]*type=["'](?:application\/json|application\/ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scriptJsonMatches) {
    const payload = safeParseJson(match[1]);
    if (payload) candidates.push(payload);
  }

  const nextMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextMatch) {
    const payload = safeParseJson(nextMatch[1]);
    if (payload) candidates.push(payload);
  }

  const nuxtMatches = [
    /window\.__NUXT__\s*=\s*({[\s\S]*?})\s*;<\/script>/i,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;<\/script>/i,
  ];
  for (const pattern of nuxtMatches) {
    const match = html.match(pattern);
    if (!match) continue;
    const payload = safeParseJson(match[1]);
    if (payload) candidates.push(payload);
  }

  return candidates;
}

function extractScriptUrls(html: string, pageUrl: string): string[] {
  const found = new Set<string>();
  const matches = html.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi);
  for (const match of matches) {
    const src = match[1]?.trim();
    if (!src) continue;
    const resolved = safeResolve(src, pageUrl);
    if (resolved) found.add(resolved);
  }
  return Array.from(found);
}

async function fetchTextBatch(urls: string[], maxCount: number): Promise<string[]> {
  const out: string[] = [];
  for (const target of urls.slice(0, maxCount)) {
    try {
      const response = await fetchWithTimeout(target, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      });
      if (!response.ok) continue;
      const body = await response.text();
      if (body && body.length > 0) out.push(body);
    } catch {
      // Ignore and continue probing.
    }
  }
  return out;
}

function discoverRelatedHosts(baseHost: string, scripts: string[]): string[] {
  const hosts = new Set<string>();
  for (const body of scripts) {
    const urls = body.match(/https?:\/\/[a-z0-9.-]+(?:\/[^\s"'`<>]*)?/gi) || [];
    for (const value of urls) {
      try {
        const host = new URL(value).hostname;
        if (isRelatedHost(baseHost, host)) hosts.add(host);
      } catch {
        // Ignore invalid URLs.
      }
    }
  }
  return Array.from(hosts).slice(0, 5);
}

function discoverApiRoutes(scripts: string[]): string[] {
  const routes = new Set<string>();
  const pattern = /\/(?:api\/)?[a-z0-9/_-]*(?:manga|manhwa|novel|series|comic|chapter|chapters)[a-z0-9/_-]*/gi;

  for (const body of scripts) {
    const matches = body.match(pattern) || [];
    for (const route of matches) {
      const normalized = normalizeRoute(route);
      if (normalized) routes.add(normalized);
    }
  }

  for (const route of DEFAULT_API_ROUTES) {
    routes.add(route);
  }

  return Array.from(routes).slice(0, 30);
}

function buildCandidateEndpoints(
  baseUrl: URL,
  relatedHosts: string[],
  routes: string[],
  ids: string[],
): string[] {
  const endpoints: string[] = [];
  const hosts = new Set<string>([baseUrl.host, ...relatedHosts]);
  const prioritizedRoutes = [
    '/manhwa/see',
    '/manga/see',
    '/novel/see',
    '/series/see',
    '/comic/see',
    '/chapters/see',
    '/api/manhwa',
    '/api/manga',
    '/api/novel',
    '/api/series',
    '/api/comic',
  ];

  const pushUnique = (value: string | null) => {
    if (!value) return;
    if (!endpoints.includes(value)) endpoints.push(value);
  };

  // Highest-confidence candidates first.
  for (const host of hosts) {
    for (const id of ids) {
      for (const route of prioritizedRoutes) {
        const normalized = route.endsWith('/') ? route.slice(0, -1) : route;
        pushUnique(safeResolve(`${normalized}/${encodeURIComponent(id)}`, `https://${host}`));
      }
    }
  }

  // Then discovered and generic routes.
  for (const host of hosts) {
    for (const route of routes) {
      for (const id of ids) {
        const routeNoSlash = route.endsWith('/') ? route.slice(0, -1) : route;
        const candidates = [
          `${routeNoSlash}/${encodeURIComponent(id)}`,
          `${routeNoSlash}?id=${encodeURIComponent(id)}`,
          `${routeNoSlash}?slug=${encodeURIComponent(id)}`,
        ];

        for (const candidate of candidates) {
          const full = safeResolve(candidate, `https://${host}`);
          pushUnique(full);
        }
      }
    }
  }

  return endpoints.slice(0, 80);
}

async function fetchJsonBatch(endpoints: string[], maxCount: number): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const endpoint of endpoints.slice(0, maxCount)) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'application/json,text/plain,*/*',
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      if (!text || text.length < 2) continue;
      if (!contentType.includes('json') && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        continue;
      }

      const parsed = safeParseJson(text);
      if (parsed) out.push(parsed);
    } catch {
      // Ignore endpoint probing failures.
    }
  }
  return out;
}

function inferFromUnknownData(data: unknown, pageUrl: string): InferredData {
  const nodes = flattenDataNodes(data);

  const title = pickFirstStringByKeys(nodes, TITLE_KEYS);
  const description = pickFirstStringByKeys(nodes, DESCRIPTION_KEYS);
  const cover = pickFirstStringByKeys(nodes, COVER_KEYS);
  const chapters = inferChapters(nodes, pageUrl);

  return {
    title,
    description,
    cover_image_url: cover,
    chapters,
  };
}

function inferChapters(nodes: Array<Record<string, unknown>>, pageUrl: string): ScrapedChapter[] {
  const arrays = collectCandidateArrays(nodes);
  let best: ScrapedChapter[] = [];

  for (const array of arrays) {
    const parsed: ScrapedChapter[] = [];
    const seen = new Set<string>();

    for (const item of array.items.slice(0, 3000)) {
      const chapter = parseChapterItem(item, pageUrl);
      if (!chapter) continue;
      const key = `${chapter.number}|${chapter.url}`;
      if (!seen.has(key)) {
        seen.add(key);
        parsed.push(chapter);
      }
    }

    if (parsed.length > best.length) {
      best = parsed;
    }
  }

  best.sort((a, b) => a.number - b.number);
  return best;
}

function collectCandidateArrays(nodes: Array<Record<string, unknown>>): CandidateArray[] {
  const candidates: CandidateArray[] = [];
  for (const node of nodes) {
    collectArraysRecursive(node, '$', candidates, 0);
  }
  return candidates;
}

function collectArraysRecursive(
  value: unknown,
  path: string,
  out: CandidateArray[],
  depth: number,
) {
  if (depth > 6 || out.length > 80) return;

  if (Array.isArray(value)) {
    if (value.length >= 2) {
      out.push({ path, items: value });
    }
    for (let i = 0; i < Math.min(value.length, 20); i++) {
      collectArraysRecursive(value[i], `${path}[${i}]`, out, depth + 1);
    }
    return;
  }

  if (!value || typeof value !== 'object') return;

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
  for (const [key, next] of entries) {
    collectArraysRecursive(next, `${path}.${key}`, out, depth + 1);
  }
}

function parseChapterItem(item: unknown, pageUrl: string): ScrapedChapter | null {
  if (!item) return null;

  if (typeof item === 'string') {
    const number = extractChapterNumber(item);
    if (number === null) return null;
    return {
      title: `Chapter ${number}`,
      number,
      url: safeResolve(item, pageUrl) || item,
    };
  }

  if (typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  const number = pickFirstNumberByKeys(obj, CHAPTER_NUMBER_KEYS)
    ?? extractChapterNumber(pickFirstStringByKeys([obj], CHAPTER_TITLE_KEYS) || '')
    ?? extractChapterNumber(pickFirstStringByKeys([obj], CHAPTER_URL_KEYS) || '');

  if (number === null) return null;

  const title = pickFirstStringByKeys([obj], CHAPTER_TITLE_KEYS) || `Chapter ${number}`;
  const rawUrl = pickFirstStringByKeys([obj], CHAPTER_URL_KEYS) || '';
  const finalUrl = rawUrl ? safeResolve(rawUrl, pageUrl) || rawUrl : pageUrl;

  return {
    title,
    number,
    url: finalUrl,
  };
}

function flattenDataNodes(data: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const queue: unknown[] = [data];
  let visited = 0;

  while (queue.length > 0 && visited < 1200) {
    const current = queue.shift();
    visited++;
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      for (const value of current.slice(0, 50)) queue.push(value);
      continue;
    }

    const obj = current as Record<string, unknown>;
    out.push(obj);
    for (const value of Object.values(obj).slice(0, 60)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return out;
}

function pickFirstStringByKeys(
  nodes: Array<Record<string, unknown>>,
  keys: string[],
): string | null {
  for (const node of nodes) {
    for (const key of keys) {
      const value = node[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

function pickFirstNumberByKeys(
  node: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function extractEntityIds(url: URL): string[] {
  const ids = new Set<string>();
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length > 0) {
    ids.add(segments[segments.length - 1]);
  }

  if (segments.length > 1) {
    ids.add(segments[segments.length - 2]);
  }

  for (const segment of segments) {
    if (segment.includes('_')) ids.add(segment);
  }

  return Array.from(ids)
    .map((value) => decodeURIComponent(value).trim())
    .filter((value) => value.length > 0)
    .slice(0, 4);
}

function isRelatedHost(baseHost: string, candidateHost: string): boolean {
  if (candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`)) return true;

  const baseToken = baseHost.split('.').find((part) => part.length >= 5) || '';
  if (!baseToken) return false;

  return candidateHost.includes(baseToken);
}

function normalizeRoute(route: string): string | null {
  const clean = route.trim().replace(/\/{2,}/g, '/');
  if (!clean.startsWith('/')) return null;
  if (clean.length < 4) return null;
  return clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeResolve(target: string, base: string): string | null {
  try {
    return new URL(target, base).toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
