-- Yomiru Database Schema
-- Run this in the Supabase SQL Editor

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BOOKS
-- ============================================================
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  cover_image_url TEXT,
  rating NUMERIC(3,1),
  status TEXT NOT NULL DEFAULT 'plan_to_read'
    CHECK (status IN ('reading', 'completed', 'dropped', 'plan_to_read')),
  source_domain TEXT NOT NULL,
  description TEXT,
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, source_url)
);

-- ============================================================
-- SEASONS (optional grouping for books with seasons)
-- ============================================================
CREATE TABLE public.seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(book_id, number)
);

-- ============================================================
-- CHAPTERS
-- ============================================================
CREATE TABLE public.chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  season_id UUID REFERENCES public.seasons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  number NUMERIC(10,2) NOT NULL,
  url TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  last_read_at TIMESTAMPTZ,
  page_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(book_id, number)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_books_user_id ON public.books(user_id);
CREATE INDEX idx_books_status ON public.books(user_id, status);
CREATE INDEX idx_chapters_book_id ON public.chapters(book_id);
CREATE INDEX idx_chapters_is_read ON public.chapters(book_id, is_read);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only access their own
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Books: users can only CRUD their own
CREATE POLICY "Users can view own books"
  ON public.books FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own books"
  ON public.books FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own books"
  ON public.books FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own books"
  ON public.books FOR DELETE USING (auth.uid() = user_id);

-- Seasons: users can access through their books
CREATE POLICY "Users can view own seasons"
  ON public.seasons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.books WHERE books.id = seasons.book_id AND books.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own seasons"
  ON public.seasons FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.books WHERE books.id = seasons.book_id AND books.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own seasons"
  ON public.seasons FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.books WHERE books.id = seasons.book_id AND books.user_id = auth.uid()
  ));

-- Chapters: users can access through their books
CREATE POLICY "Users can view own chapters"
  ON public.chapters FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.books WHERE books.id = chapters.book_id AND books.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own chapters"
  ON public.chapters FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.books WHERE books.id = chapters.book_id AND books.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own chapters"
  ON public.chapters FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.books WHERE books.id = chapters.book_id AND books.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own chapters"
  ON public.chapters FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.books WHERE books.id = chapters.book_id AND books.user_id = auth.uid()
  ));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
