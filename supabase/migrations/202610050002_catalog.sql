alter table public.works
  add column creator text not null default '' check (length(creator) <= 160),
  add column year smallint check (year between 1000 and 2100),
  add column description text not null default '' check (length(description) <= 3000),
  add column cover_url text not null default '' check (length(cover_url) <= 3000),
  add column source text check (source in ('wikipedia', 'openlibrary', 'tvmaze')),
  add column source_id text check (length(source_id) between 1 and 120),
  add column source_url text not null default '' check (length(source_url) <= 3000),
  add constraint works_source_pair check ((source is null) = (source_id is null));
create unique index works_catalog_owner_unique
  on public.works(user_id, source, source_id) where source is not null;
