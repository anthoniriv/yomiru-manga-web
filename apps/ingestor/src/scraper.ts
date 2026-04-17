import { ScraperEngine } from '@yomiru/backend/scraper/engine';
import {
  extractChapterContentWithFallback,
  extractChapterContentFromUrlFallback,
} from '@yomiru/backend/scraper/chapterContent';
import { fetchTextWithDnsFallback } from '@yomiru/backend/scraper/net';
import { StrategyRegistry } from '@yomiru/backend/scraper/strategies/registry';
import type { ScrapeResult, ChapterContent } from '@yomiru/shared';

let _engine: ScraperEngine | null = null;
let _registry: StrategyRegistry | null = null;

export function engine(): ScraperEngine {
  if (!_engine) _engine = new ScraperEngine();
  return _engine;
}

export function registry(): StrategyRegistry {
  if (!_registry) _registry = new StrategyRegistry();
  return _registry;
}

export async function closeScraper(): Promise<void> {
  if (_engine) {
    await _engine.close();
    _engine = null;
  }
}

export async function scrapeSeries(url: string): Promise<ScrapeResult> {
  return engine().scrape(url);
}

async function fetchMangaDexChapter(chapterUrl: string): Promise<ChapterContent | null> {
  const m = chapterUrl.match(/mangadex\.org\/chapter\/([0-9a-f-]{36})/i);
  if (!m) return null;
  const chapterId = m[1];
  const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    baseUrl: string;
    chapter: { hash: string; data: string[]; dataSaver: string[] };
  };
  const images = data.chapter.data.map(
    (file) => `${data.baseUrl}/data/${data.chapter.hash}/${file}`,
  );
  return {
    title: null,
    source_url: chapterUrl,
    source_domain: 'mangadex.org',
    content_type: 'images',
    images,
    paragraphs: [],
    warnings: [],
  };
}

export async function scrapeChapterContent(
  chapterUrl: string,
): Promise<ChapterContent> {
  const parsed = new URL(chapterUrl);
  const domain = parsed.hostname;

  if (domain.endsWith('mangadex.org')) {
    const md = await fetchMangaDexChapter(chapterUrl);
    if (md) return md;
  }

  const strategy = registry().getStrategy(domain);

  let html = '';
  if (!strategy.usesApi) {
    try {
      html = await fetchTextWithDnsFallback(chapterUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
    } catch {
      html = '';
    }
  }

  const primary = await extractChapterContentWithFallback(html, chapterUrl);
  if (primary.images.length > 0 || primary.paragraphs.length > 0) {
    return primary;
  }
  const fallback = await extractChapterContentFromUrlFallback(chapterUrl);
  return fallback ?? primary;
}
