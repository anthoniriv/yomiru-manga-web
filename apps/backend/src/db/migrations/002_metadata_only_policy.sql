-- Metadata-only policy:
-- Keep only user library metadata in backend.
-- Do not persist scraped content payloads server-side.

DROP TABLE IF EXISTS public.scrape_cache;
