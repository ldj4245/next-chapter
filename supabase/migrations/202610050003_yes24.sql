-- Keep existing catalog records and ownership policies; accept the new book provider.
alter table public.works drop constraint works_source_check;
alter table public.works add constraint works_source_check
  check (source in ('yes24', 'wikipedia', 'openlibrary', 'tvmaze'));
