import { ScrapeResult } from './scraper';
import { Book, Chapter, Season } from './book';
import { ChapterContentResponse } from './reader';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

export type ScrapeResponse = ApiResponse<ScrapeResult>;

export interface SaveBookRequest {
  title: string;
  source_url: string;
  cover_image_url: string | null;
  rating: number | null;
  description: string | null;
  source_domain: string;
  status: string;
  chapters: Array<{
    title: string;
    number: number;
    url: string;
    season_name?: string;
    season_number?: number;
  }>;
}

export interface SaveBookResponse extends ApiResponse<{
  book: Book;
  seasons: Season[];
  chapters: Chapter[];
}> {}

export type ChapterContentApiResponse = ApiResponse<ChapterContentResponse>;
