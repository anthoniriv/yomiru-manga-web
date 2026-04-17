import * as cheerio from 'cheerio';
import { ScrapeResult, ScrapedChapter } from '@yomiru/shared';
import { ScraperStrategy, createEmptyResult, extractChapterNumber } from './base.js';

export class ZonaTmoStrategy implements ScraperStrategy {
  readonly domain = 'zonatmo.com';
  readonly needsPlaywright = false;

  async parse(html: string, url: string): Promise<ScrapeResult> {
    const $ = cheerio.load(html);
    const result = createEmptyResult();

    result.title = this.extractTitle($);

    result.description =
      $('meta[property="og:description"]').attr('content')?.trim() ||
      $('meta[name="description"]').attr('content')?.trim() ||
      this.pickDescriptionFromBody($) ||
      null;

    result.cover_image_url =
      $('meta[property="og:image"]').attr('content')?.trim() ||
      this.extractCoverFromStyle(html);

    result.chapters = this.extractChapters($, url);

    if (!result.title) result.warnings.push('Could not extract title from ZonaTMO page');
    if (!result.cover_image_url) result.warnings.push('Could not extract cover image from ZonaTMO page');
    if (result.chapters.length === 0) result.warnings.push('Could not extract chapters from ZonaTMO page');

    return result;
  }

  private extractChapters($: cheerio.CheerioAPI, pageUrl: string): ScrapedChapter[] {
    const chaptersByNumber = new Map<string, ScrapedChapter>();
    const chapterBlocks = $('li.upload-link');

    if (chapterBlocks.length === 0) {
      $('a[href*="/view_uploads/"]').each((_index, el) => {
        const anchor = $(el);
        const href = anchor.attr('href')?.trim();
        if (!href) return;

        const context = anchor.closest('li.upload-link');
        const headerText = this.normalizeSpaces(
          context.find('> h4').first().text() ||
          context.find('h4').first().text() ||
          context.text() ||
          '',
        );

        const chapterInfo = this.parseChapterFromText(headerText);
        if (!chapterInfo) return;

        this.upsertChapter(chaptersByNumber, {
          number: chapterInfo.number,
          title: chapterInfo.title,
          url: this.resolveUrl(href, pageUrl),
        });
      });

      return Array.from(chaptersByNumber.values()).sort((a, b) => a.number - b.number);
    }

    chapterBlocks.each((_index, el) => {
      const block = $(el);
      const headerText = this.normalizeSpaces(
        block.find('> h4').first().text() ||
        block.find('h4').first().text() ||
        '',
      );

      const chapterInfo = this.parseChapterFromText(headerText);
      if (!chapterInfo) return;

      const href =
        block
          .find('a[href*="/view_uploads/"]')
          .first()
          .attr('href')
          ?.trim() || null;
      if (!href) return;

      this.upsertChapter(chaptersByNumber, {
        number: chapterInfo.number,
        title: chapterInfo.title,
        url: this.resolveUrl(href, pageUrl),
      });
    });

    const chapters = Array.from(chaptersByNumber.values());
    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  private upsertChapter(
    chaptersByNumber: Map<string, ScrapedChapter>,
    chapter: { number: number; title: string | null; url: string },
  ): void {
    const chapterNumber = Number(chapter.number.toFixed(2));
    if (!Number.isInteger(chapterNumber)) {
      // ZonaTMO often publishes extras as x.5; keep mainline list stable.
      return;
    }

    const chapterTitle = chapter.title || `Capítulo ${chapterNumber}`;
    const key = chapterNumber.toFixed(2);
    const existing = chaptersByNumber.get(key);

    if (!existing) {
      chaptersByNumber.set(key, {
        title: chapterTitle,
        number: chapterNumber,
        url: chapter.url,
      });
      return;
    }

    // Keep one chapter per numeric release, but upgrade title if previous one was generic.
    const existingGeneric = this.isGenericChapterTitle(existing.title, existing.number);
    const incomingGeneric = this.isGenericChapterTitle(chapterTitle, chapterNumber);
    if (existingGeneric && !incomingGeneric) {
      existing.title = chapterTitle;
      existing.url = chapter.url;
    }
  }

  private extractTitle($: cheerio.CheerioAPI): string | null {
    const elementTitle = (() => {
      const node = $('h1.element-title').first().clone();
      if (node.length === 0) return '';
      node.find('small').remove();
      return this.normalizeSpaces(node.text());
    })();

    const candidates = [
      elementTitle,
      $('meta[property="og:title"]').attr('content')?.trim() || '',
      $('meta[name="twitter:title"]').attr('content')?.trim() || '',
      $('h2.element-subtitle').first().text().trim(),
      $('title').first().text().trim(),
    ];

    for (const candidate of candidates) {
      const cleaned = this.cleanTitle(candidate || null);
      if (cleaned && !this.isGenericBookTitle(cleaned)) {
        return cleaned;
      }
    }

    return this.cleanTitle(candidates.find(Boolean) || null);
  }

  private parseChapterFromText(text: string): { number: number; title: string | null } | null {
    const normalized = this.normalizeSpaces(text);
    if (!normalized) return null;

    const match = normalized.match(
      /Cap[ií]tulo\s+(\d+(?:\.\d+)?)(?:\s*[-:]\s*|\s+)?(.+)?/i,
    );

    const number = match ? parseFloat(match[1]) : extractChapterNumber(normalized);
    if (number === null || !Number.isFinite(number)) return null;

    let title = match?.[2]?.trim() || null;
    if (title) {
      // Trim date/group noise often present in chapter list rows.
      title = title.replace(/\b\d{4}-\d{2}-\d{2}\b.*$/i, '').trim();
      title = title.replace(/\b(leer|read)\b\s*$/i, '').trim();
      if (!title || /^cap[ií]tulo/i.test(title)) title = null;
    }

    return { number, title };
  }

  private pickDescriptionFromBody($: cheerio.CheerioAPI): string | null {
    const candidates = [
      $('section p').first().text().trim(),
      $('article p').first().text().trim(),
      $('.panel-body p').first().text().trim(),
      $('p').first().text().trim(),
    ];

    for (const candidate of candidates) {
      if (candidate && candidate.length > 40) {
        return candidate;
      }
    }

    return null;
  }

  private extractCoverFromStyle(html: string): string | null {
    const match = html.match(/book-thumbnail-[^}]*background-image:\s*url\(['"]([^'"]+)['"]\)/i);
    return match ? match[1] : null;
  }

  private cleanTitle(value: string | null): string | null {
    if (!value) return null;
    return value
      .replace(/\s*-\s*(manga|manhwa|manhua)\s*-\s*zonatmo\s*$/i, '')
      .replace(/\s*-\s*zonatmo\s*$/i, '')
      .replace(/\s*\(\s*\d{4}\s*\)\s*$/i, '')
      .trim() || null;
  }

  private isGenericBookTitle(value: string): boolean {
    const normalized = this.normalizeSpaces(value).toLowerCase();
    return ['manga', 'manhwa', 'manhua', 'webcomic', 'novela'].includes(normalized);
  }

  private isGenericChapterTitle(value: string, chapterNumber: number): boolean {
    const normalized = this.normalizeSpaces(value).toLowerCase();
    return (
      normalized === `capítulo ${chapterNumber}`.toLowerCase() ||
      normalized === `capitulo ${chapterNumber}`.toLowerCase() ||
      normalized === `chapter ${chapterNumber}`.toLowerCase()
    );
  }

  private normalizeSpaces(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private resolveUrl(href: string, baseUrl: string): string {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  }
}
