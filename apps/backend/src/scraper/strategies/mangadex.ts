import { ScrapeResult, ScrapedChapter } from '@yomiru/shared';
import { ScraperStrategy, createEmptyResult } from './base.js';

const API_BASE = 'https://api.mangadex.org';

interface MangaDexManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    description: Record<string, string>;
    status: string;
    year: number | null;
    contentRating: string;
  };
  relationships: Array<{
    id: string;
    type: string;
    attributes?: { fileName?: string };
  }>;
}

interface MangaDexChapter {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    publishAt: string;
    externalUrl: string | null;
    pages?: number;
  };
}

export class MangaDexStrategy implements ScraperStrategy {
  readonly domain = 'mangadex.org';
  readonly needsPlaywright = false;
  readonly usesApi = true;

  async parse(_html: string, url: string): Promise<ScrapeResult> {
    const result = createEmptyResult();
    const mangaId = this.extractMangaId(url);

    if (!mangaId) {
      result.warnings.push('Could not extract manga ID from MangaDex URL');
      return result;
    }

    // Fetch manga metadata
    try {
      const mangaResp = await fetch(
        `${API_BASE}/manga/${mangaId}?includes[]=cover_art&includes[]=author`,
      );
      if (!mangaResp.ok) {
        result.warnings.push(`MangaDex API error: ${mangaResp.status}`);
        return result;
      }

      const mangaData = (await mangaResp.json()) as { data: MangaDexManga };
      const manga = mangaData.data;
      const attrs = manga.attributes;

      // Title — prefer English, fallback to Japanese, then any available
      result.title =
        attrs.title['en'] ||
        attrs.title['es'] ||
        attrs.title['es-la'] ||
        attrs.title['ja'] ||
        attrs.title['ja-ro'] ||
        Object.values(attrs.title)[0] ||
        null;

      // Description
      result.description =
        attrs.description['es'] ||
        attrs.description['es-la'] ||
        attrs.description['en'] ||
        Object.values(attrs.description)[0] ||
        null;

      // Cover image
      const coverRel = manga.relationships.find((r) => r.type === 'cover_art');
      if (coverRel?.attributes?.fileName) {
        result.cover_image_url = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
      }
    } catch (err) {
      result.warnings.push(
        `Failed to fetch manga metadata: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    // Fetch chapters (Spanish + English, sorted ascending)
    try {
      const chapters: ScrapedChapter[] = [];
      let offset = 0;
      const limit = 100;
      let total = Infinity;

      while (offset < total && offset < 1000) {
        const params = new URLSearchParams({
          'translatedLanguage[]': 'es',
          'order[chapter]': 'asc',
          limit: String(limit),
          offset: String(offset),
        });
        // Also include es-la
        params.append('translatedLanguage[]', 'es-la');
        params.append('translatedLanguage[]', 'en');

        const chapResp = await fetch(`${API_BASE}/manga/${mangaId}/feed?${params}`);
        if (!chapResp.ok) break;

        const chapData = (await chapResp.json()) as {
          data: MangaDexChapter[];
          total: number;
        };
        total = chapData.total;

        for (const ch of chapData.data) {
          const num = ch.attributes.chapter ? parseFloat(ch.attributes.chapter) : null;
          if (num === null || isNaN(num)) continue;
          // Skip externally-hosted chapters (licensed series like JJK redirect to MangaPlus)
          if (ch.attributes.externalUrl) continue;
          if (ch.attributes.pages === 0) continue;

          // Avoid duplicate chapter numbers (prefer Spanish)
          const existing = chapters.find((c) => c.number === num);
          if (existing) {
            // Prefer Spanish over English
            if (
              ch.attributes.translatedLanguage.startsWith('es') &&
              !existing.url.includes('/es/')
            ) {
              existing.url = `https://mangadex.org/chapter/${ch.id}`;
              existing.title =
                ch.attributes.title || `Capítulo ${ch.attributes.chapter}`;
            }
            continue;
          }

          chapters.push({
            title:
              ch.attributes.title ||
              `Capítulo ${ch.attributes.chapter}`,
            number: num,
            url: `https://mangadex.org/chapter/${ch.id}`,
          });
        }

        offset += limit;
      }

      chapters.sort((a, b) => a.number - b.number);
      result.chapters = chapters;

      if (chapters.length === 0) {
        result.warnings.push('No chapters found (may not have Spanish/English translations)');
      }
    } catch (err) {
      result.warnings.push(
        `Failed to fetch chapters: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    return result;
  }

  private extractMangaId(url: string): string | null {
    // MangaDex URLs: https://mangadex.org/title/{uuid} or /title/{uuid}/{slug}
    const match = url.match(
      /mangadex\.org\/title\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    return match ? match[1] : null;
  }
}
