import * as cheerio from 'cheerio';
import { ScrapeResult, ScrapedChapter } from '@yomiru/shared';
import { ScraperStrategy, createEmptyResult, extractChapterNumber } from './base.js';

export class MangasnoseKaiStrategy implements ScraperStrategy {
  readonly domain = 'mangasnosekai.com';
  readonly needsPlaywright = true; // Cloudflare protected

  async parse(html: string, url: string): Promise<ScrapeResult> {
    const $ = cheerio.load(html);
    const result = createEmptyResult();

    // Title
    result.title = $('div.post-title h1').text().trim()
      || $('h1.entry-title').text().trim()
      || $('h1').first().text().trim()
      || null;
    if (!result.title) result.warnings.push('Could not extract title');

    // Cover image
    result.cover_image_url = $('div.summary_image img').attr('src')
      || $('div.tab-summary img').attr('src')
      || $('div.thumb img').attr('src')
      || $('meta[property="og:image"]').attr('content')
      || null;
    if (!result.cover_image_url) result.warnings.push('Could not extract cover image');

    // Description
    result.description = $('div.summary__content p').text().trim()
      || $('div.description-summary p').text().trim()
      || $('div.manga-excerpt p').text().trim()
      || null;

    // Rating
    const ratingText = $('span.score').text().trim()
      || $('div.post-rating span.score').text().trim()
      || $('span.total_votes').text().trim();
    if (ratingText) {
      const rating = parseFloat(ratingText);
      if (!isNaN(rating)) result.rating = rating;
    }

    // Chapters - Madara theme (WordPress manga theme) uses this structure
    const chapters: ScrapedChapter[] = [];
    $('li.wp-manga-chapter').each((_i, el) => {
      const link = $(el).find('a');
      const chapterUrl = link.attr('href') || '';
      const chapterTitle = link.text().trim();
      const number = extractChapterNumber(chapterTitle);

      if (chapterUrl && number !== null) {
        chapters.push({
          title: chapterTitle,
          number,
          url: chapterUrl,
        });
      }
    });

    // Fallback: generic list items with links
    if (chapters.length === 0) {
      $('ul.main li a, div.listing-chapters_wrap li a, ul.version-chap li a').each((_i, el) => {
        const chapterUrl = $(el).attr('href') || '';
        const chapterTitle = $(el).text().trim();
        const number = extractChapterNumber(chapterTitle);

        if (chapterUrl && number !== null) {
          chapters.push({
            title: chapterTitle,
            number,
            url: chapterUrl,
          });
        }
      });
    }

    if (chapters.length === 0) {
      result.warnings.push('Could not extract chapters');
    }

    // Sort chapters by number (ascending)
    chapters.sort((a, b) => a.number - b.number);
    result.chapters = chapters;

    return result;
  }
}
