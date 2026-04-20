create table if not exists public.series_comments (
  id uuid primary key default gen_random_uuid(),
  series_id text not null,
  series_slug text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Lector',
  body text not null check (char_length(trim(body)) between 1 and 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists series_comments_series_created_idx
  on public.series_comments (series_id, created_at desc);

alter table public.series_comments enable row level security;

drop policy if exists "comments are public" on public.series_comments;
create policy "comments are public"
  on public.series_comments for select
  using (true);

drop policy if exists "users insert own comments" on public.series_comments;
create policy "users insert own comments"
  on public.series_comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own comments" on public.series_comments;
create policy "users update own comments"
  on public.series_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own comments" on public.series_comments;
create policy "users delete own comments"
  on public.series_comments for delete
  using (auth.uid() = user_id);

create table if not exists public.series_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id text not null,
  series_slug text not null,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

create index if not exists series_ratings_series_idx
  on public.series_ratings (series_id);

alter table public.series_ratings enable row level security;

drop policy if exists "ratings are public" on public.series_ratings;
create policy "ratings are public"
  on public.series_ratings for select
  using (true);

drop policy if exists "users upsert own ratings" on public.series_ratings;
create policy "users upsert own ratings"
  on public.series_ratings for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own ratings" on public.series_ratings;
create policy "users update own ratings"
  on public.series_ratings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select on public.series_comments to anon, authenticated;
grant insert, update, delete on public.series_comments to authenticated;
grant select on public.series_ratings to anon, authenticated;
grant insert, update on public.series_ratings to authenticated;
