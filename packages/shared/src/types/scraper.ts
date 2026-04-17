export interface ScrapeRequest {
  url: string;
}

export interface ScrapedChapter {
  title: string;
  number: number;
  url: string;
  season_name?: string;
  season_number?: number;
}

export interface ScrapeResult {
  title: string | null;
  cover_image_url: string | null;
  description: string | null;
  rating: number | null;
  chapters: ScrapedChapter[];
  warnings: string[];
  source_domain: string;
  source_url: string;
}
