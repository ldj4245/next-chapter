-- Reading history and preferences remain private, including after a book is removed.
alter table public.notes add constraint notes_id_owner_unique unique (id, user_id);

create table public.reading_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  work_id uuid,
  cue text not null default '자기 전에' check (length(btrim(cue)) between 1 and 80),
  reminder_time time not null default '22:00',
  constraint reading_preferences_work_owner_fk foreign key (work_id, user_id)
    references public.works(id, user_id) on delete set null (work_id)
);
create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid,
  work_title text not null check (length(btrim(work_title)) between 1 and 100),
  cover_url text not null default '',
  status text not null default 'active' check (status in ('active','completed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  running_since timestamptz default now(),
  elapsed_seconds integer not null default 0 check (elapsed_seconds between 0 and 86400),
  reading_day date,
  end_page integer check (end_page >= 0),
  note_id uuid,
  constraint reading_sessions_state_check check (
    (status='active' and finished_at is null and reading_day is null) or
    (status='completed' and finished_at is not null and reading_day is not null and running_since is null)
  ),
  constraint reading_sessions_work_owner_fk foreign key (work_id, user_id)
    references public.works(id, user_id) on delete set null (work_id),
  constraint reading_sessions_note_owner_fk foreign key (note_id, user_id)
    references public.notes(id, user_id) on delete set null (note_id)
);
create unique index reading_one_active_per_owner on public.reading_sessions(user_id) where status='active';
create index reading_owner_day_idx on public.reading_sessions(user_id, reading_day desc);
alter table public.reading_preferences enable row level security;
alter table public.reading_preferences force row level security;
alter table public.reading_sessions enable row level security;
alter table public.reading_sessions force row level security;
revoke all on public.reading_preferences, public.reading_sessions from anon, authenticated;
grant select, insert, update, delete on public.reading_preferences, public.reading_sessions to authenticated;
create policy reading_preferences_owner on public.reading_preferences for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy reading_sessions_owner on public.reading_sessions for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create function public.start_reading(p_id uuid, p_work_id uuid) returns public.reading_sessions
language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  book public.works;
  entry public.reading_sessions;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  -- Retrying a start or starting on another device returns the same session.
  select * into entry from public.reading_sessions where user_id=owner_id and (id=p_id or status='active')
    order by (status='active') desc limit 1;
  if found then return entry; end if;
  select * into book from public.works where id=p_work_id and user_id=owner_id and kind='book' and status in ('planned','active') for update;
  if not found then raise no_data_found; end if;
  insert into public.reading_sessions(id,user_id,work_id,work_title,cover_url)
    values(p_id,owner_id,book.id,book.title,book.cover_url) on conflict do nothing returning * into entry;
  if not found then
    select * into entry from public.reading_sessions where user_id=owner_id and (id=p_id or status='active')
      order by (status='active') desc limit 1;
    if not found then raise insufficient_privilege; end if;
    return entry;
  end if;
  update public.works set status='active', started_on=coalesce(started_on,(now() at time zone 'Asia/Seoul')::date)
    where id=book.id and user_id=owner_id and status='planned';
  insert into public.reading_preferences(user_id,work_id) values(owner_id,book.id)
    on conflict(user_id) do update set work_id=excluded.work_id;
  return entry;
end;
$$;

create function public.change_reading(p_id uuid, p_action text, p_progress integer default null,
  p_content text default null, p_thought text default null) returns public.reading_sessions
language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  entry public.reading_sessions;
  seconds integer;
  saved_note uuid;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  select * into entry from public.reading_sessions where id=p_id and user_id=owner_id for update;
  if not found then raise no_data_found; end if;
  if p_action not in ('pause','resume','complete','details','cancel') then raise check_violation; end if;
  if p_action='complete' and entry.status='completed' then return entry; end if;
  if p_action='details' and entry.status<>'completed' then raise check_violation; end if;
  if p_action<>'details' and entry.status<>'active' then raise check_violation; end if;
  seconds := least(86400,entry.elapsed_seconds + case when entry.running_since is null then 0
    else greatest(0,floor(extract(epoch from (now()-entry.running_since)))::integer) end);
  if p_action='cancel' then
    delete from public.reading_sessions where id=p_id and user_id=owner_id;
    return entry;
  elsif p_action='pause' then
    update public.reading_sessions set elapsed_seconds=seconds,running_since=null where id=p_id and user_id=owner_id returning * into entry;
  elsif p_action='resume' then
    update public.reading_sessions set running_since=coalesce(running_since,now()) where id=p_id and user_id=owner_id returning * into entry;
  else
    if p_progress is not null and p_progress<0 then raise check_violation; end if;
    if p_content is not null and (length(btrim(p_content)) not between 1 and 20000 or length(coalesce(p_thought,''))>20000) then raise check_violation; end if;
    if p_progress is not null or p_content is not null then
      perform 1 from public.works where id=entry.work_id and user_id=owner_id and kind='book' for update;
      if not found then raise no_data_found; end if;
      if p_progress is not null then
        update public.works set progress=p_progress where id=entry.work_id and user_id=owner_id;
      end if;
      saved_note := entry.note_id;
      if p_content is not null then
        if saved_note is null then
          insert into public.notes(user_id,work_id,content,thought) values(owner_id,entry.work_id,btrim(p_content),coalesce(p_thought,'')) returning id into saved_note;
        else
          update public.notes set content=btrim(p_content),thought=coalesce(p_thought,'') where id=saved_note and user_id=owner_id;
        end if;
      end if;
      update public.reading_sessions set end_page=coalesce(p_progress,end_page),note_id=saved_note where id=p_id and user_id=owner_id returning * into entry;
    end if;
    if p_action='complete' then
      update public.reading_sessions set status='completed',elapsed_seconds=seconds,running_since=null,finished_at=now(),
        reading_day=(now() at time zone 'Asia/Seoul')::date where id=p_id and user_id=owner_id returning * into entry;
    end if;
  end if;
  return entry;
end;
$$;
revoke all on function public.start_reading(uuid,uuid), public.change_reading(uuid,text,integer,text,text) from public, anon;
grant execute on function public.start_reading(uuid,uuid), public.change_reading(uuid,text,integer,text,text) to authenticated;
