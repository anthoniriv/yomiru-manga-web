import type {
  SourceProvider,
  DiscoveredSeries,
  DiscoveredChapter,
} from './types.js';

const BASE = 'https://zonatmo.to';
const PUBLIC_BASE = BASE;
const LIST_API = `${BASE}/wp-api/api/listing/manga`;
const SERIES_API = `${BASE}/wp-json/seventi-manga/v1/manga`;
const CHAPTERS_API = `${BASE}/wp-json/seventi-manga/v1/chapters`;
const COVER_BASE = `${BASE}/wp-content/uploads`;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface ListingItem {
  _id: number;
  title: string;
  slug: string;
  cover: string | null;
  score: string | number;
  vote_count: number;
  total_chapters: number;
  alt_titles: string[];
  synonyms?: { text: string; lang: string }[];
  subtitle?: string;
  author?: { name: string }[];
  years?: number[];
  status?: number[];
  types?: number[];
  genres?: number[];
}

interface MangaDetail {
  id: number;
  title: string;
  description: string | null;
  subtitle: string | null;
  cover_image: string | null;
  score: string | number;
  total_chapters: string | number;
  type: string;
  status: string;
  status_raw: string;
  year_start: string | number;
  year_end: string | number;
  author: { name: string }[] | string;
  alt_titles: string;
  synonyms: string;
  genres: string;
}

interface ChapterDetail {
  id: string;
  manga_id: string;
  manga_key?: string;
  chapter_key?: string;
  chapter_number: string;
  title: string;
  language: string;
  release_date: string;
  view_url: string;
  images: { page_number: string; image_url: string }[];
}

function mapStatus(raw: string): DiscoveredSeries['status'] {
  const s = (raw || '').toLowerCase();
  if (s.includes('public') || s.includes('curso') || s.includes('ongoing')) return 'ongoing';
  if (s.includes('final') || s.includes('completed')) return 'completed';
  if (s.includes('paus') || s.includes('hiatus')) return 'hiatus';
  if (s.includes('cancel')) return 'cancelled';
  return 'unknown';
}

function buildCoverUrl(cover: string | null): string | null {
  if (!cover) return null;
  if (cover.startsWith('http')) return cover;
  return `${COVER_BASE}${cover.startsWith('/') ? '' : '/'}${cover}`;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSeriesUrl(externalId: string | number, slug: string): string {
  return `${PUBLIC_BASE}/library/manga/${externalId}/${slug}`;
}

function calculatePopularity(
  rating: number | null,
  voteCount: number,
  totalChapters: number,
): number {
  if (voteCount > 0) return Math.max(1, rating ?? 1) * voteCount;
  return Math.max(0, rating ?? 0) * 1000 + Math.max(0, totalChapters);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`zonatmo ${res.status} ${url}`);
  return (await res.json()) as T;
}

export class ZonatmoProvider implements SourceProvider {
  readonly name = 'zonatmo';

  async *crawlCatalog(opts: {
    startPage?: number;
    maxPages?: number;
  } = {}): AsyncIterable<DiscoveredSeries> {
    const startPage = opts.startPage ?? 1;
    const maxPages = opts.maxPages ?? Infinity;
    let page = startPage;
    let totalPages = Infinity;

    while (page <= Math.min(totalPages, startPage + maxPages - 1)) {
      const url = `${LIST_API}?page=${page}&orderBy=score&order=desc`;
      const body = await getJson<{
        data: { items: ListingItem[]; pagination: { total_pages: number } };
      }>(url);
      totalPages = body.data.pagination.total_pages;

      for (const it of body.data.items) {
        const rating = toNumber(it.score);
        const voteCount = Number.isFinite(it.vote_count) ? it.vote_count : 0;
        const totalChapters = Number.isFinite(it.total_chapters) ? it.total_chapters : 0;

        yield {
          externalId: String(it._id),
          slug: it.slug,
          title: it.title,
          altTitles: [
            ...(it.alt_titles ?? []),
            ...((it.synonyms ?? []).map((s) => s.text)),
            ...(it.subtitle ? [it.subtitle] : []),
          ].filter(Boolean),
          description: null,
          coverUrl: buildCoverUrl(it.cover),
          rating,
          voteCount,
          popularity: calculatePopularity(rating, voteCount, totalChapters),
          totalChapters,
          status: 'unknown',
          year: it.years?.[0] ?? null,
          author: it.author?.[0]?.name ?? null,
          artist: null,
          genres: [],
          kind: 'manga',
          sourceUrl: buildSeriesUrl(it._id, it.slug),
        };
      }

      page += 1;
      // gentle pacing
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async fetchSeriesDetails(externalId: string): Promise<{
    series: DiscoveredSeries;
    chapters: DiscoveredChapter[];
  }> {
    const detailRes = await getJson<MangaDetail | { id: number; title: string }>(
      `${SERIES_API}/${externalId}`,
    );
    const detail = detailRes as MangaDetail;
    const chapsRes = await getJson<{ data: ChapterDetail[] }>(
      `${CHAPTERS_API}/${externalId}`,
    );

    const yearStart = parseInt(String(detail.year_start ?? ''), 10);
    const totalChapters = toNumber(detail.total_chapters) ?? chapsRes.data.length;
    const rating = toNumber(detail.score);
    const series: DiscoveredSeries = {
      externalId: String(detail.id),
      slug: '', // filled by caller (already known)
      title: detail.title,
      altTitles: [
        ...(typeof detail.alt_titles === 'string' && detail.alt_titles
          ? detail.alt_titles.split('\n').filter(Boolean)
          : []),
        ...(typeof detail.synonyms === 'string' && detail.synonyms
          ? detail.synonyms.split('|').filter(Boolean)
          : []),
        ...(detail.subtitle ? [detail.subtitle] : []),
      ],
      description: detail.description ?? null,
      coverUrl: detail.cover_image ?? null,
      rating,
      totalChapters,
      status: mapStatus(detail.status_raw || detail.status),
      year: Number.isFinite(yearStart) ? yearStart : null,
      author: Array.isArray(detail.author)
        ? detail.author[0]?.name ?? null
        : null,
      artist: null,
      genres:
        typeof detail.genres === 'string'
          ? detail.genres.split('\n').map((g) => g.trim()).filter(Boolean)
          : [],
      kind: 'manga',
      sourceUrl: `${PUBLIC_BASE}/library/manga/${detail.id}`,
    };

    const chapters: DiscoveredChapter[] = chapsRes.data.map((c) => ({
      externalId: c.id,
      number: parseFloat(c.chapter_number),
      title: c.title || null,
      language: c.language || 'es',
      publishedAt: c.release_date && !Number.isNaN(Date.parse(c.release_date))
        ? new Date(c.release_date)
        : null,
      sourceUrl: c.view_url,
    }));

    return { series, chapters };
  }

  async fetchChapterImages(chapter: {
    externalId: string;
    sourceUrl: string;
    seriesExternalId: string;
  }): Promise<string[]> {
    // Try API first — the /chapters/{manga_id} endpoint returns images per chapter
    try {
      const res = await getJson<{ data: ChapterDetail[] }>(
        `${CHAPTERS_API}/${chapter.seriesExternalId}`,
      );
      const ch = res.data.find((c) => c.id === chapter.externalId);
      if (ch?.images?.length) {
        // image_url is filename; CDN path uses obfuscated keys when present.
        const mangaPath = ch.manga_key ?? chapter.seriesExternalId;
        const chapterPath = ch.chapter_key ?? chapter.externalId;
        const base = `https://cdn.zonatmo.to/manga/${mangaPath}/${chapterPath}`;
        return ch.images
          .sort((a, b) => parseInt(a.page_number, 10) - parseInt(b.page_number, 10))
          .map((img) => `${base}/${img.image_url}`);
      }
    } catch {
      // fall through to legacy
    }

    // Legacy fallback: scrape view_url (zonatmo.com/view_uploads/X)
    const { extractChapterContentWithFallback } = await import(
      '@yomiru/backend/scraper/chapterContent'
    );
    const { fetchTextWithDnsFallback } = await import(
      '@yomiru/backend/scraper/net'
    );
    const html = await fetchTextWithDnsFallback(chapter.sourceUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://zonatmo.com/library' },
    }).catch(() => '');
    const content = await extractChapterContentWithFallback(html, chapter.sourceUrl);
    return content.images;
  }
}
