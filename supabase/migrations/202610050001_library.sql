create table public.works (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 100),
  kind text not null check (kind in ('book', 'movie', 'drama')),
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'dropped')),
  rating smallint check (rating between 1 and 5),
  summary text not null default '' check (length(summary) <= 300),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  moods text[] not null default '{}' check (moods <@ array['calm', 'immersive', 'thoughtful', 'light']::text[]),
  minutes integer check (minutes > 0),
  progress integer check (progress >= 0),
  started_on date,
  finished_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint works_dates_check check (finished_on is null or started_on is null or finished_on >= started_on),
  constraint works_id_owner_unique unique (id, user_id)
);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid not null,
  content text not null check (length(btrim(content)) between 1 and 20000),
  thought text not null default '' check (length(thought) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_work_owner_fk foreign key (work_id, user_id) references public.works(id, user_id) on delete cascade
);
create index works_owner_updated_idx on public.works(user_id, updated_at desc);
create index notes_owner_work_idx on public.notes(user_id, work_id, created_at desc);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger works_updated before update on public.works
for each row execute function public.touch_updated_at();
create trigger notes_updated before update on public.notes
for each row execute function public.touch_updated_at();

create function public.touch_note_work() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.works set updated_at = now() where id = old.work_id and user_id = old.user_id;
    return old;
  end if;
  update public.works set updated_at = now() where id = new.work_id and user_id = new.user_id;
  return new;
end;
$$;
create trigger notes_touch_work after insert or update or delete on public.notes
for each row execute function public.touch_note_work();

alter table public.works enable row level security;
alter table public.notes enable row level security;
alter table public.works force row level security;
alter table public.notes force row level security;
revoke all on public.works, public.notes from anon;
revoke all on public.works, public.notes from authenticated;
grant select, insert, update, delete on public.works, public.notes to authenticated;

create policy works_select_owner on public.works for select to authenticated using (user_id = (select auth.uid()));
create policy works_insert_owner on public.works for insert to authenticated with check (user_id = (select auth.uid()));
create policy works_update_owner on public.works for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy works_delete_owner on public.works for delete to authenticated using (user_id = (select auth.uid()));
create policy notes_select_owner on public.notes for select to authenticated using (user_id = (select auth.uid()));
create policy notes_insert_owner on public.notes for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.works where id = work_id and user_id = (select auth.uid()))
);
create policy notes_update_owner on public.notes for update to authenticated
using (user_id = (select auth.uid())) with check (
  user_id = (select auth.uid()) and exists (select 1 from public.works where id = work_id and user_id = (select auth.uid()))
);
create policy notes_delete_owner on public.notes for delete to authenticated using (user_id = (select auth.uid()));
