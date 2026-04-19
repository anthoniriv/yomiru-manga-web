-- Add AniList banner columns to manga.series
ALTER TABLE manga.series
  ADD COLUMN IF NOT EXISTS banner_path text,
  ADD COLUMN IF NOT EXISTS banner_source_url text;
