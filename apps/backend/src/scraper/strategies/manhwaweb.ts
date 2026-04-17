import { ScrapeResult, ScrapedChapter } from '@yomiru/shared';
import { ScraperStrategy, createEmptyResult } from './base.js';

const API_BASE = 'https://manhwawebbackend-production.up.railway.app';

interface ManhwaWebChapter {
  chapter?: number | string;
  link?: string;
}

interface ManhwaWebResponse {
  the_real_name?: string;
  name_esp?: string;
  _sinopsis?: string;
  _imagen?: string;
  chapters?: ManhwaWebChapter[];
  chapters_esp?: ManhwaWebChapter[];
  chapters_raw?: ManhwaWebChapter[];
}

export class ManhwaWebStrategy implements ScraperStrategy {
  readonly domain = 'manhwaweb.com';
  readonly needsPlaywright = false;
  readonly usesApi = true;

  async parse(_html: string, url: string): Promise<ScrapeResult> {
    const result = createEmptyResult();
    const workIds = this.extractWorkIds(url);

    if (workIds.length === 0) {
      result.warnings.push('Could not extract work ID from ManhwaWeb URL');
      return result;
    }

    try {
      let data: ManhwaWebResponse | null = null;
      let lastStatus: number | null = null;

      for (const workId of workIds) {
        const response = await fetch(`${API_BASE}/manhwa/see/${encodeURIComponent(workId)}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'application/json,text/plain,*/*',
            Referer: 'https://www.manhwaweb.com/',
          },
        });

        lastStatus = response.status;
        if (!response.ok) {
          // Some URLs arrive pre-encoded (e.g. %C2%BF...) and need a decoded fallback slug.
          if (response.status === 404) continue;
          result.warnings.push(`ManhwaWeb API error: ${response.status}`);
          return result;
        }

        data = (await response.json()) as ManhwaWebResponse;
        break;
      }

      if (!data) {
        result.warnings.push(`ManhwaWeb API error: ${lastStatus ?? 404}`);
        return result;
      }

      result.title = data.the_real_name || data.name_esp || null;
      result.description = data._sinopsis || null;
      result.cover_image_url = data._imagen || null;

      const candidates = data.chapters || data.chapters_esp || data.chapters_raw || [];
      const chapters: ScrapedChapter[] = [];

      for (const chapter of candidates) {
        const number = this.toChapterNumber(chapter.chapter);
        const chapterUrl = chapter.link;
        if (number === null || !chapterUrl) continue;

        chapters.push({
          title: `Chapter ${chapter.chapter}`,
          number,
          url: chapterUrl,
        });
      }

      chapters.sort((a, b) => a.number - b.number);
      result.chapters = chapters;

      if (!result.title) {
        result.warnings.push('Could not extract title from ManhwaWeb API response');
      }
      if (!result.cover_image_url) {
        result.warnings.push('Could not extract cover image from ManhwaWeb API response');
      }
      if (result.chapters.length === 0) {
        result.warnings.push('No chapters found in ManhwaWeb API response');
      }
    } catch (err) {
      result.warnings.push(
        `Failed to fetch ManhwaWeb API: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    return result;
  }

  private extractWorkIds(url: string): string[] {
    const match = url.match(/manhwaweb\.com\/(?:manhwa|manga)\/([^/?#]+)/i);
    if (!match?.[1]) return [];

    const raw = match[1].trim();
    const candidates = new Set<string>();
    if (raw) candidates.add(raw);
    try {
      const decoded = decodeURIComponent(raw).trim();
      if (decoded) candidates.add(decoded);
    } catch {
      // Keep raw candidate only.
    }

    return Array.from(candidates);
  }

  private toChapterNumber(value: number | string | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
}
