CREATE INDEX IF NOT EXISTS chapters_series_status_number_idx
ON manga.chapters (series_id, download_status, number);

CREATE INDEX IF NOT EXISTS chapters_status_downloaded_created_series_idx
ON manga.chapters (download_status, downloaded_at DESC, created_at DESC, series_id);

CREATE INDEX IF NOT EXISTS chapters_series_status_downloaded_created_idx
ON manga.chapters (series_id, download_status, downloaded_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS series_popularity_rating_idx
ON manga.series (popularity DESC, rating DESC);

CREATE INDEX IF NOT EXISTS series_created_at_idx
ON manga.series (created_at DESC);

CREATE INDEX IF NOT EXISTS series_updated_at_idx
ON manga.series (updated_at DESC);

CREATE INDEX IF NOT EXISTS series_comments_series_slug_created_idx
ON public.series_comments (series_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS series_ratings_series_slug_idx
ON public.series_ratings (series_slug);
