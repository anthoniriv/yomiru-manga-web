import * as cheerio from 'cheerio';
import { ScrapeResult, ScrapedChapter } from '@yomiru/shared';
import { ScraperStrategy, createEmptyResult, extractChapterNumber } from './base.js';
import { runAutoAdapter } from '../autoAdapter.js';

export class GenericStrategy implements ScraperStrategy {
  readonly domain = '*';
  readonly needsPlaywright = false; // Try simple fetch first

  async parse(html: string, url: string): Promise<ScrapeResult> {
    const $ = cheerio.load(html);
    const result = createEmptyResult();
    const chapters: ScrapedChapter[] = [];
    const seenNumbers = new Set<number>();

    // Structured metadata (JSON-LD) is the most stable cross-site signal.
    const structured = this.extractFromJsonLd($, url);
    if (structured.title) result.title = structured.title;
    if (structured.description) result.description = structured.description;
    if (structured.cover_image_url) result.cover_image_url = structured.cover_image_url;
    for (const chapter of structured.chapters) {
      if (!seenNumbers.has(chapter.number)) {
        seenNumbers.add(chapter.number);
        chapters.push(chapter);
      }
    }

    // === TITLE ===
    // Priority: h1 > og:title > title tag
    result.title = result.title || $('h1').first().text().trim() || null;
    if (!result.title) {
      result.title = $('meta[property="og:title"]').attr('content')?.trim() || null;
    }
    if (!result.title) {
      result.title = $('title').text().trim() || null;
    }

    // === COVER IMAGE ===
    // Priority: og:image > img with cover/poster/thumbnail keywords > largest image
    result.cover_image_url = result.cover_image_url || $('meta[property="og:image"]').attr('content') || null;

    if (!result.cover_image_url) {
      const coverSelectors = [
        'img[class*="cover"]',
        'img[class*="poster"]',
        'img[class*="thumb"]',
        'img[alt*="cover" i]',
        'img[alt*="poster" i]',
        'img[src*="cover"]',
        'img[src*="poster"]',
      ];

      for (const selector of coverSelectors) {
        const img = $(selector).first();
        const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src');
        if (src) {
          result.cover_image_url = this.resolveUrl(src, url);
          break;
        }
      }
    }

    // === DESCRIPTION ===
    result.description = result.description || $('meta[property="og:description"]').attr('content')?.trim()
      || $('meta[name="description"]').attr('content')?.trim()
      || null;

    // === RATING ===
    // Look for common rating patterns
    const ratingSelectors = [
      '[class*="rating"] [class*="score"]',
      '[class*="rating"] span',
      '[class*="score"]',
      '[itemprop="ratingValue"]',
    ];

    for (const selector of ratingSelectors) {
      const text = $(selector).first().text().trim();
      if (text) {
        const num = parseFloat(text);
        if (!isNaN(num) && num >= 0 && num <= 10) {
          result.rating = num;
          break;
        }
      }
    }

    // === CHAPTERS ===
    // Strategy 1: Look for lists of links with chapter-like text
    const chapterSelectors = [
      'li.wp-manga-chapter a',
      'ul.chapter-list li a',
      '[class*="chapter"] li a',
      '[class*="chapter"] a',
      'ul.listing li a',
      'div.chapters li a',
      'table.chapter-list a',
    ];

    for (const selector of chapterSelectors) {
      $(selector).each((_i, el) => {
        const link = $(el);
        const href = link.attr('href') || '';
        const text = link.text().trim();
        const number = extractChapterNumber(text);

        if (href && number !== null && !seenNumbers.has(number)) {
          seenNumbers.add(number);
          chapters.push({
            title: text,
            number,
            url: this.resolveUrl(href, url),
          });
        }
      });

      if (chapters.length > 0) break;
    }

    // Strategy 2: Look for any ordered list of links with sequential numbers
    if (chapters.length === 0) {
      $('a').each((_i, el) => {
        const link = $(el);
        const href = link.attr('href') || '';
        const text = link.text().trim();

        // Check if the link text or href contains chapter-like patterns
        if (href && /chapter|cap[ií]tulo|ch[\.\-_]?\d|episode|ep[\.\-_]?\d/i.test(text + href)) {
          const number = extractChapterNumber(text) || extractChapterNumber(href);
          if (number !== null && !seenNumbers.has(number)) {
            seenNumbers.add(number);
            chapters.push({
              title: text || `Chapter ${number}`,
              number,
              url: this.resolveUrl(href, url),
            });
          }
        }
      });
    }

    // Strategy 3: Auto-adapter (API/SPA fallback) when HTML does not expose chapters.
    if (chapters.length === 0) {
      const adapted = await runAutoAdapter(url, html);

      if (
        adapted.title &&
        (!result.title || this.isLikelyPlaceholderTitle(result.title, url))
      ) {
        result.title = adapted.title;
      }
      if (adapted.description && !result.description) {
        result.description = adapted.description;
      }
      if (adapted.cover_image_url && !result.cover_image_url) {
        result.cover_image_url = this.resolveUrl(adapted.cover_image_url, url);
      }

      for (const chapter of adapted.chapters) {
        if (!seenNumbers.has(chapter.number)) {
          seenNumbers.add(chapter.number);
          chapters.push(chapter);
        }
      }
    }

    if (chapters.length === 0) {
      result.warnings.push('Could not extract chapters. This site may require a custom scraper strategy.');
    }
    if (!result.title) {
      result.warnings.push('Could not extract title from page');
    }
    if (!result.cover_image_url) {
      result.warnings.push('Could not extract cover image');
    }

    // Sort ascending by chapter number
    chapters.sort((a, b) => a.number - b.number);
    result.chapters = chapters;

    return result;
  }

  private resolveUrl(href: string, baseUrl: string): string {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  }

  private extractFromJsonLd(
    $: cheerio.CheerioAPI,
    baseUrl: string,
  ): Pick<ScrapeResult, 'title' | 'description' | 'cover_image_url'> & { chapters: ScrapedChapter[] } {
    const out: Pick<ScrapeResult, 'title' | 'description' | 'cover_image_url'> & {
      chapters: ScrapedChapter[];
    } = {
      title: null,
      description: null,
      cover_image_url: null,
      chapters: [],
    };

    const scripts = $('script[type="application/ld+json"]');
    if (scripts.length === 0) return out;

    scripts.each((_i, el) => {
      const text = $(el).contents().text().trim();
      if (!text) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }

      const nodes = this.flattenJsonLd(parsed);
      for (const node of nodes) {
        if (!out.title) {
          out.title = this.pickString(node.name, node.headline);
        }
        if (!out.description) {
          out.description = this.pickString(node.description);
        }
        if (!out.cover_image_url) {
          const image = this.pickImage(node.image);
          if (image) out.cover_image_url = this.resolveUrl(image, baseUrl);
        }

        const parts = this.toArray(node.hasPart).concat(this.toArray(node.itemListElement));
        for (const part of parts) {
          const label = this.pickString(part.name, part.headline, part.title) || '';
          const candidateUrl = this.pickString(part.url, part['@id']) || '';
          const number =
            this.toNumber(part.position) ||
            extractChapterNumber(label) ||
            extractChapterNumber(candidateUrl);

          if (number !== null && candidateUrl) {
            out.chapters.push({
              title: label || `Chapter ${number}`,
              number,
              url: this.resolveUrl(candidateUrl, baseUrl),
            });
          }
        }
      }
    });

    return out;
  }

  private flattenJsonLd(value: unknown): Array<Record<string, any>> {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.flattenJsonLd(item));
    }

    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) {
      return (obj['@graph'] as unknown[]).flatMap((item) => this.flattenJsonLd(item));
    }

    return [obj as Record<string, any>];
  }

  private toArray(value: unknown): Array<Record<string, any>> {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item) => item && typeof item === 'object') as Array<Record<string, any>>;
    }
    if (typeof value === 'object') {
      return [value as Record<string, any>];
    }
    return [];
  }

  private pickString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private pickImage(image: unknown): string | null {
    if (typeof image === 'string' && image.trim()) return image.trim();
    if (Array.isArray(image)) {
      for (const item of image) {
        const candidate = this.pickImage(item);
        if (candidate) return candidate;
      }
      return null;
    }
    if (image && typeof image === 'object') {
      const obj = image as Record<string, unknown>;
      return this.pickString(obj.url, obj['@id']);
    }
    return null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private isLikelyPlaceholderTitle(title: string, pageUrl: string): boolean {
    const normalizedTitle = title.toLowerCase();
    const host = new URL(pageUrl).hostname.toLowerCase();
    const hostToken = host
      .split('.')
      .filter((part) => !['www', 'm', 'en', 'es'].includes(part))
      .sort((a, b) => b.length - a.length)[0] || host;
    return normalizedTitle.includes(hostToken);
  }
}
