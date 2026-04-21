alter table manga.series
  add column if not exists watch_updates boolean not null default false,
  add column if not exists auto_download boolean not null default false,
  add column if not exists check_interval_minutes integer not null default 30,
  add column if not exists last_checked_at timestamptz;

create index if not exists series_watch_updates_idx
  on manga.series (watch_updates);

alter table manga.series
  alter column auto_download set default false;

update manga.series
set auto_download = false
where auto_download is distinct from false;
