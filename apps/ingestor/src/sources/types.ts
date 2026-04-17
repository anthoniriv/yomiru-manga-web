export interface DiscoveredSeries {
  externalId: string;
  slug: string;
  title: string;
  altTitles: string[];
  description: string | null;
  coverUrl: string | null;
  rating: number | null;
  voteCount?: number;
  popularity?: number;
  totalChapters?: number;
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
  year: number | null;
  author: string | null;
  artist: string | null;
  genres: string[];
  kind: 'manga' | 'book';
  sourceUrl: string;
}

export interface DiscoveredChapter {
  externalId: string;
  number: number;
  title: string | null;
  language: string;
  publishedAt: Date | null;
  sourceUrl: string;
}

export interface SourceProvider {
  readonly name: string;
  /** Iterate full catalog from this source. */
  crawlCatalog(opts?: {
    startPage?: number;
    maxPages?: number;
  }): AsyncIterable<DiscoveredSeries>;
  /** Fetch full metadata + chapter list for one series. */
  fetchSeriesDetails(externalId: string): Promise<{
    series: DiscoveredSeries;
    chapters: DiscoveredChapter[];
  }>;
  /** Fetch ordered image URLs for a chapter. */
  fetchChapterImages(chapter: {
    externalId: string;
    sourceUrl: string;
    seriesExternalId: string;
  }): Promise<string[]>;
}
