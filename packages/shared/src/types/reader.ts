export type ChapterContentType = 'images' | 'text' | 'mixed' | 'unknown';

export interface ChapterContent {
  title: string | null;
  source_url: string;
  source_domain: string;
  content_type: ChapterContentType;
  images: string[];
  paragraphs: string[];
  warnings: string[];
}

export interface ChapterContentResponse {
  chapter_id: string;
  chapter_title: string;
  chapter_number: number;
  content: ChapterContent;
}
