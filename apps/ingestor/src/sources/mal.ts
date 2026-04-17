import { config } from '../config.js';

export interface MalMangaStats {
  malId: string;
  title: string;
  url: string;
  score: number | null;
  scoredBy: number;
  members: number;
  popularityRank: number | null;
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const cache = new Map<string, Promise<MalMangaStats | null>>();
let nextRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(): Promise<void> {
  const waitMs = nextRequestAt - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  nextRequestAt = Date.now() + config.mal.delayMs;
}

async function fetchText(url: string): Promise<string> {
  await throttle();
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`mal ${res.status} ${url}`);
  return res.text();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value: string): string {
  return decodeHtml(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: string | undefined): number | null {
  if (!value || value === '-') return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function findSearchCandidates(html: string): Array<{
  id: string;
  title: string;
  url: string;
}> {
  const out: Array<{ id: string; title: string; url: string }> = [];
  const seen = new Set<string>();
  const re =
    /href="(https:\/\/myanimelist\.net\/manga\/(\d+)\/[^"]+)"[\s\S]{0,500}?<strong>([\s\S]*?)<\/strong>/g;
  for (const match of html.matchAll(re)) {
    const [, url, id, rawTitle] = match;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title: stripTags(rawTitle), url });
  }
  return out;
}

function pickCandidate(
  candidates: Array<{ id: string; title: string; url: string }>,
  titles: string[],
): { id: string; title: string; url: string } | null {
  const normalizedTargets = titles.map(normalizeTitle).filter(Boolean);
  for (const target of normalizedTargets) {
    const exact = candidates.find((c) => normalizeTitle(c.title) === target);
    if (exact) return exact;
  }
  for (const target of normalizedTargets) {
    const partial = candidates.find((c) => {
      const current = normalizeTitle(c.title);
      return current.includes(target) || target.includes(current);
    });
    if (partial) return partial;
  }
  return candidates[0] ?? null;
}

function parseStats(html: string, candidate: { id: string; title: string; url: string }): MalMangaStats {
  const text = stripTags(html);
  const start = text.indexOf('Statistics Score:');
  const stats = start >= 0 ? text.slice(start, start + 1500) : text;
  const score = toNullableNumber(stats.match(/Score:\s*([0-9.]+)/)?.[1]);
  const scoredBy =
    toNumber(stats.match(/scored by\s+\d+\s+([\d,]+)\s+users/i)?.[1]) ||
    toNumber(stats.match(/scored by\s+([\d,]+)\s+users/i)?.[1]);
  const members = toNumber(stats.match(/Members:\s*([\d,]+)/)?.[1]);
  const popularityRank = toNullableNumber(stats.match(/Popularity:\s*#([\d,]+)/)?.[1]);

  return {
    malId: candidate.id,
    title: candidate.title,
    url: candidate.url,
    score,
    scoredBy,
    members,
    popularityRank,
  };
}

async function lookup(title: string, altTitles: string[] = []): Promise<MalMangaStats | null> {
  const searchUrl = `https://myanimelist.net/manga.php?q=${encodeURIComponent(title)}&cat=manga`;
  const searchHtml = await fetchText(searchUrl);
  const candidate = pickCandidate(findSearchCandidates(searchHtml), [title, ...altTitles]);
  if (!candidate) return null;
  const detailHtml = await fetchText(candidate.url);
  return parseStats(detailHtml, candidate);
}

export function lookupMalMangaStats(
  title: string,
  altTitles: string[] = [],
): Promise<MalMangaStats | null> {
  const key = normalizeTitle(title);
  if (!key) return Promise.resolve(null);
  const existing = cache.get(key);
  if (existing) return existing;
  const promise = lookup(title, altTitles).catch((err) => {
    console.warn(`[mal] ${title}: ${(err as Error).message}`);
    return null;
  });
  cache.set(key, promise);
  return promise;
}
