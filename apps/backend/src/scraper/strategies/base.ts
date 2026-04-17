import { ScrapeResult } from '@yomiru/shared';

export interface ScraperStrategy {
  readonly domain: string;
  readonly needsPlaywright: boolean;
  /** If true, skip HTML fetching — strategy makes its own API calls in parse() */
  readonly usesApi?: boolean;
  parse(html: string, url: string): Promise<ScrapeResult>;
}

export function createEmptyResult(): ScrapeResult {
  return {
    title: null,
    cover_image_url: null,
    description: null,
    rating: null,
    chapters: [],
    warnings: [],
    source_domain: '',
    source_url: '',
  };
}

export function extractChapterNumber(text: string): number | null {
  // Try common patterns: "Chapter 10", "Cap. 5", "Ch.10.5", "#10", "Capitulo 3"
  const patterns = [
    /(?:chapter|cap[ií]tulo|ch\.?|ep\.?|episode)\s*#?(\d+(?:\.\d+)?)/i,
    /#(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseFloat(match[1]);
  }

  return null;
}
