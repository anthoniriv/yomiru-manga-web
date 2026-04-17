import * as cheerio from 'cheerio';
import { ScrapeResult } from '@yomiru/shared';
import { ScraperStrategy, createEmptyResult } from './base.js';
import {
  fetchReadAnyBookChapters,
  findReadAnyBookReaderUrl,
} from '../readanybookRuntime.js';

export class ReadAnyBookStrategy implements ScraperStrategy {
  readonly domain = 'readanybook.com';
  readonly needsPlaywright = false;

  async parse(html: string, url: string): Promise<ScrapeResult> {
    const $ = cheerio.load(html);
    const result = createEmptyResult();

    result.title = this.pickString(
      $('h1').first().text(),
      $('meta[property="og:title"]').attr('content'),
      $('meta[name="og:title"]').attr('content'),
      $('title').first().text(),
    );

    result.cover_image_url = this.resolveUrl(
      this.pickString(
        $('img[alt*="Portada"]').first().attr('src'),
        $('img[src*="/cover/"]').first().attr('src'),
        $('meta[property="og:image"]').attr('content'),
      ),
      url,
    );

    result.description = this.extractSynopsis($);
    result.rating = this.extractRating(html);

    const readerUrl = findReadAnyBookReaderUrl(html, url);
    if (readerUrl) {
      try {
        const chapters = await fetchReadAnyBookChapters(readerUrl);
        if (chapters.length > 0) {
          result.chapters = chapters.map((chapter) => ({
            title: chapter.title,
            number: chapter.number,
            url: chapter.url,
          }));
        }
      } catch (error) {
        result.warnings.push(
          `ReadAnyBook chapter extraction via EPUB reader failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    } else {
      result.warnings.push('Could not resolve ReadAnyBook reader URL from page.');
    }

    if (result.chapters.length === 0) {
      const chapterTitle = this.pickString(
        $('a[href="#section1"]').first().text(),
        'Libro completo',
      ) || 'Libro completo';
      result.chapters = [{
        title: chapterTitle,
        number: 1,
        url,
      }];
    }

    if (!result.description) {
      result.warnings.push('Could not extract full synopsis from ReadAnyBook page.');
    }

    return result;
  }

  private extractSynopsis($: cheerio.CheerioAPI): string | null {
    const preferred = $('div.row-span-1.col-span-2[x-data*="expanded"]').first();
    const candidates = preferred.length > 0
      ? [preferred]
      : $('div[x-data*="expanded"]').toArray().map((el) => $(el));

    for (const node of candidates) {
      const spanText = node
        .find('span')
        .toArray()
        .map((el) => $(el).text().trim())
        .filter((part) => part.length > 0 && part !== '...')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (spanText.length >= 80) {
        return spanText;
      }
    }

    const metaDescription = this.pickString(
      $('meta[property="og:description"]').attr('content'),
      $('meta[name="og:description"]').attr('content'),
      $('meta[name="description"]').attr('content'),
    );
    return metaDescription;
  }

  private extractRating(html: string): number | null {
    const match = html.match(/raterComponent\(\s*['"]book['"]\s*,\s*\d+\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,/i);
    if (!match) return null;
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  private pickString(...values: Array<string | undefined | null>): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }

  private resolveUrl(href: string | null, baseUrl: string): string | null {
    if (!href) return null;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  }
}
