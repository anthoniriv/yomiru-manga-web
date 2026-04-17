export enum ReadingStatus {
  READING = 'reading',
  COMPLETED = 'completed',
  DROPPED = 'dropped',
  PLAN_TO_READ = 'plan_to_read',
}

export interface Book {
  id: string;
  user_id: string;
  title: string;
  source_url: string;
  cover_image_url: string | null;
  rating: number | null;
  status: ReadingStatus;
  source_domain: string;
  description: string | null;
  last_scraped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Season {
  id: string;
  book_id: string;
  name: string;
  number: number;
  created_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  season_id: string | null;
  title: string;
  number: number;
  url: string;
  is_read: boolean;
  last_read_at: string | null;
  page_count: number | null;
  created_at: string;
}

export interface BookWithProgress extends Book {
  total_chapters: number;
  read_chapters: number;
  seasons: Season[];
  chapters: Chapter[];
}
