import * as cheerio from 'cheerio';
import { ScrapeResult, ScrapedChapter } from '@yomiru/shared';
import { fetchJsonWithDnsFallback } from '../net.js';
import { ScraperStrategy, createEmptyResult, extractChapterNumber } from './base.js';

type InMangaChapter = {
  Number?: number | string;
  FriendlyChapterNumber?: string;
  FriendlyChapterNumberUrl?: string;
  Identification?: string;
  Description?: string;
};

type InMangaApiEnvelope = {
  data?: string;
  success?: boolean;
  result?: unknown;
};

type InMangaApiInner = {
  message?: string;
  success?: boolean;
  result?: InMangaChapter[];
};

export class InMangaStrategy implements ScraperStrategy {
  readonly domain = 'inmanga.com';
  readonly needsPlaywright = false;

  async parse(html: string, url: string): Promise<ScrapeResult> {
    const $ = cheerio.load(html);
    const result = createEmptyResult();

    const identification = this.extractMangaIdentification($, url);
    const mangaSlug = this.extractMangaSlug(url);
    const chapterTemplate = this.extractChapterTemplate(html, mangaSlug);
    const pageSynopsis = this.extractPageSynopsis($);
    const pageCover = this.extractPageCover($, url, identification);
    const ogDescription = this.pickString($('meta[property="og:description"]').attr('content'));
    const metaDescription = this.pickString($('meta[name="description"]').attr('content'));
    const cleanMetaDescription = this.pickBestDescription(
      pageSynopsis,
      this.isSeoLikeDescription(ogDescription) ? null : ogDescription,
      this.isSeoLikeDescription(metaDescription) ? null : metaDescription,
    );

    result.title =
      this.cleanTitle(
        $('h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('title').first().text().trim() ||
        mangaSlug.replace(/-/g, ' ') ||
        null,
      );

    result.description =
      cleanMetaDescription ||
      this.pickBestDescription(ogDescription, metaDescription);

    result.cover_image_url =
      pageCover ||
      this.pickString($('meta[property="og:image"]').attr('content')) ||
      this.pickString($('img[alt*="Manga Online"]').first().attr('src'));

    if (!identification) {
      result.warnings.push('Could not extract InManga identification for chapter API.');
      return result;
    }

    try {
      const chapters = await this.fetchChapters(url, identification, chapterTemplate);
      result.chapters = chapters;
      if (chapters.length === 0) {
        result.warnings.push('Could not extract chapters from InManga API.');
      }
    } catch (error) {
      result.warnings.push(
        `InManga chapter API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return result;
  }

  private async fetchChapters(
    pageUrl: string,
    identification: string,
    chapterTemplate: string,
  ): Promise<ScrapedChapter[]> {
    const apiUrl = new URL(
      `/chapter/getall?mangaIdentification=${encodeURIComponent(identification)}`,
      pageUrl,
    ).toString();

    const payload = await fetchJsonWithDnsFallback<InMangaApiEnvelope>(apiUrl, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const apiResult = this.extractChapterArray(payload);
    const chaptersByNumber = new Map<string, ScrapedChapter>();

    for (const chapter of apiResult) {
      const chapterNumber = this.toChapterNumber(chapter);
      if (chapterNumber === null) continue;

      const chapterId = this.pickString(chapter.Identification);
      if (!chapterId) continue;

      const chapterNumberUrl =
        this.pickString(chapter.FriendlyChapterNumberUrl) ||
        String(chapterNumber).replace(/\.0+$/, '');

      const chapterUrl = chapterTemplate
        .replace('chapterNumber', encodeURIComponent(chapterNumberUrl))
        .replace('identification', encodeURIComponent(chapterId));

      const resolvedChapterUrl = this.resolveUrl(chapterUrl, pageUrl);
      const chapterTitle = this.buildChapterTitle(chapter, chapterNumber);
      const key = chapterNumber.toFixed(2);

      if (!chaptersByNumber.has(key)) {
        chaptersByNumber.set(key, {
          title: chapterTitle,
          number: chapterNumber,
          url: resolvedChapterUrl,
        });
      }
    }

    return Array.from(chaptersByNumber.values()).sort((a, b) => a.number - b.number);
  }

  private extractChapterArray(payload: InMangaApiEnvelope): InMangaChapter[] {
    if (Array.isArray(payload?.result)) {
      return payload.result as InMangaChapter[];
    }

    if (typeof payload?.data !== 'string') {
      return [];
    }

    const inner = this.safeParseJson<InMangaApiInner>(payload.data);
    if (!inner || !Array.isArray(inner.result)) {
      return [];
    }

    return inner.result;
  }

  private extractMangaIdentification($: cheerio.CheerioAPI, pageUrl: string): string | null {
    const fromInput = this.pickString($('#Identification').attr('value'));
    if (fromInput) return fromInput;

    const parsed = new URL(pageUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const tail = parts[parts.length - 1] || '';
    return /^[0-9a-f-]{36}$/i.test(tail) ? tail : null;
  }

  private extractMangaSlug(pageUrl: string): string {
    try {
      const parsed = new URL(pageUrl);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((part) => part.toLowerCase() === 'manga');
      if (idx >= 0 && parts[idx + 1]) {
        return decodeURIComponent(parts[idx + 1]);
      }
    } catch {
      // Ignore malformed URL.
    }
    return 'manga';
  }

  private extractChapterTemplate(html: string, slug: string): string {
    const match = html.match(/var\s+chapterUrl\s*=\s*['"]([^'"]+)['"]/i);
    if (match && match[1]) return match[1];
    return `/ver/manga/${encodeURIComponent(slug)}/chapterNumber/identification`;
  }

  private extractPageSynopsis($: cheerio.CheerioAPI): string | null {
    const headingPanelSynopsis = this.pickString(
      $('h1').first().closest('.panel.widget').find('.panel-body').first().text(),
    );
    if (headingPanelSynopsis && !this.isSeoLikeDescription(headingPanelSynopsis)) {
      return headingPanelSynopsis;
    }

    const candidateSelectors = [
      '.panel-body',
      '.manga-description',
      '[itemprop="description"]',
      '[class*="description"]',
      '[class*="sinopsis"]',
      '[class*="synopsis"]',
    ];

    for (const selector of candidateSelectors) {
      const candidate = this.pickString($(selector).first().text());
      if (candidate && !this.isSeoLikeDescription(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private extractPageCover(
    $: cheerio.CheerioAPI,
    pageUrl: string,
    identification: string | null,
  ): string | null {
    const candidateSelectors = [
      '.custom-bg-center img',
      '.panel.widget img[src*="/i/m/"]',
      'img[alt*="Manga Online"]',
      'img[src*="cdn1.intomanga.com"]',
    ];

    for (const selector of candidateSelectors) {
      const imageUrl = this.pickString(
        $(selector).first().attr('src'),
        $(selector).first().attr('data-src'),
        $(selector).first().attr('data-lazy-src'),
      );
      if (imageUrl) return this.resolveUrl(imageUrl, pageUrl);
    }

    if (identification) {
      return `https://cdn1.intomanga.com/i/m/${encodeURIComponent(identification)}/t/o/${encodeURIComponent(identification)}.jpg`;
    }

    return null;
  }

  private buildChapterTitle(chapter: InMangaChapter, number: number): string {
    const description = this.pickString(chapter.Description);
    const friendly = this.pickString(chapter.FriendlyChapterNumber);
    const numberLabel = friendly || String(number).replace(/\.0+$/, '');

    if (description) {
      return `Capítulo ${numberLabel} - ${description}`;
    }

    return `Capítulo ${numberLabel}`;
  }

  private toChapterNumber(chapter: InMangaChapter): number | null {
    const fromNumber = this.toNumber(chapter.Number);
    if (fromNumber !== null) return Number(fromNumber.toFixed(2));

    const fromFriendly = this.toNumber(chapter.FriendlyChapterNumberUrl);
    if (fromFriendly !== null) return Number(fromFriendly.toFixed(2));

    const fromLabel = extractChapterNumber(this.pickString(chapter.FriendlyChapterNumber) || '');
    if (fromLabel !== null && Number.isFinite(fromLabel)) {
      return Number(fromLabel.toFixed(2));
    }

    return null;
  }

  private cleanTitle(value: string | null): string | null {
    if (!value) return null;
    return value
      .replace(/\s*Manga Online\s*-\s*InManga\s*$/i, '')
      .replace(/\s*-\s*InManga\s*$/i, '')
      .trim() || null;
  }

  private pickBestDescription(...values: Array<string | null>): string | null {
    for (const value of values) {
      const normalized = this.pickString(value);
      if (!normalized) continue;
      if (this.isSeoLikeDescription(normalized)) continue;
      return normalized;
    }

    for (const value of values) {
      const normalized = this.pickString(value);
      if (normalized) return normalized;
    }

    return null;
  }

  private isSeoLikeDescription(value: string | null): boolean {
    if (!value) return false;
    const normalized = value.toLowerCase();
    const commas = (value.match(/,/g) || []).length;
    const seoTokens = ['manga', 'online', 'gratis', 'leer'];
    const seoHits = seoTokens.reduce((acc, token) => acc + (normalized.includes(token) ? 1 : 0), 0);
    return commas >= 3 && seoHits >= 2;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private pickString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private resolveUrl(href: string, baseUrl: string): string {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  }

  private safeParseJson<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}
