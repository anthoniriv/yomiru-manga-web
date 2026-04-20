-- Run this on the AUTH Supabase project (jtdymqosfcnzdnuxxdyo), NOT the manga catalog.
CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id text NOT NULL,
  series_slug text NOT NULL,
  series_title text,
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, series_id)
);

CREATE INDEX IF NOT EXISTS user_favorites_user_idx ON public.user_favorites(user_id, created_at DESC);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users select own favs" ON public.user_favorites;
CREATE POLICY "users select own favs" ON public.user_favorites
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own favs" ON public.user_favorites;
CREATE POLICY "users insert own favs" ON public.user_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users delete own favs" ON public.user_favorites;
CREATE POLICY "users delete own favs" ON public.user_favorites
  FOR DELETE USING (auth.uid() = user_id);
