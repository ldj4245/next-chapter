-- Extend the existing history instead of moving or rewriting earlier reading records.
-- A single partial unique index still permits only one active timer per owner.
alter table public.reading_sessions
  add column task_id uuid,
  add column goal_id uuid,
  add column task_title text not null default '' check (length(task_title) <= 200),
  add column target_seconds integer not null default 300 check (target_seconds=0 or target_seconds between 60 and 14400),
  add column memo text not null default '' check (length(memo) <= 20000),
  add column start_page integer check (start_page >= 0),
  -- Existing rows are all genuine reading sessions. Keep this durable classification
  -- after a linked book or task is deleted; study time never becomes reading time.
  add column is_reading boolean not null default true,
  add constraint reading_sessions_task_owner_fk foreign key (task_id,user_id)
    references public.daily_tasks(id,user_id) on delete set null (task_id),
  add constraint reading_sessions_goal_owner_fk foreign key (goal_id,user_id)
    references public.planner_goals(id,user_id) on delete set null (goal_id);
create index focus_owner_task_idx on public.reading_sessions(user_id,task_id,finished_at desc);
create index focus_owner_goal_day_idx on public.reading_sessions(user_id,goal_id,reading_day);

create function public.start_focus(p_id uuid,p_task_id uuid,p_target_seconds integer)
returns public.reading_sessions language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  task public.daily_tasks;
  work public.works;
  entry public.reading_sessions;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  if p_target_seconds is null or not (p_target_seconds=0 or p_target_seconds between 60 and 14400) then raise check_violation; end if;
  select * into task from public.daily_tasks where id=p_task_id and user_id=owner_id for update;
  if not found then raise no_data_found; end if;
  -- An exact retry returns its own recorded session, including after completion.
  select * into entry from public.reading_sessions where user_id=owner_id and id=p_id;
  if found then
    if entry.task_id is distinct from p_task_id then raise check_violation; end if;
    return entry;
  end if;
  select * into entry from public.reading_sessions where user_id=owner_id and status='active';
  if found then return entry; end if;
  if task.work_id is not null then
    select * into work from public.works where id=task.work_id and user_id=owner_id for update;
    if not found then raise no_data_found; end if;
  end if;
  if task.goal_id is not null then
    perform 1 from public.planner_goals where id=task.goal_id and user_id=owner_id;
    if not found then raise no_data_found; end if;
  end if;
  insert into public.reading_sessions(id,user_id,work_id,work_title,cover_url,task_id,goal_id,task_title,target_seconds,start_page,is_reading)
    values(p_id,owner_id,work.id,coalesce(work.title,'할 일'),coalesce(work.cover_url,''),task.id,task.goal_id,task.title,p_target_seconds,
      case when work.kind='book' then work.progress else null end,coalesce(work.kind='book',false))
    on conflict do nothing returning * into entry;
  if not found then
    -- Another start can win the unique active-owner constraint while this insert waits.
    select * into entry from public.reading_sessions where user_id=owner_id and (id=p_id or status='active')
      order by (id=p_id) desc limit 1;
    if not found then raise insufficient_privilege; end if;
    if entry.id=p_id and entry.task_id is distinct from p_task_id then raise check_violation; end if;
    return entry;
  end if;
  if entry.is_reading then
    update public.works set status='active',started_on=coalesce(started_on,(now() at time zone 'Asia/Seoul')::date)
      where id=work.id and user_id=owner_id and status='planned';
  end if;
  -- A timer is an execution record. It deliberately does not alter task status.
  return entry;
end;
$$;

create function public.change_focus(p_id uuid,p_action text,p_memo text default null)
returns public.reading_sessions language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  entry public.reading_sessions;
  seconds integer;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  select * into entry from public.reading_sessions where id=p_id and user_id=owner_id for update;
  if not found then raise no_data_found; end if;
  if p_action is null or p_action not in ('pause','resume','complete','cancel','memo') then raise check_violation; end if;
  if p_action='memo' then
    if p_memo is null or length(p_memo)>20000 then raise check_violation; end if;
    -- Preserve whitespace and every duration/status field during memo autosave.
    update public.reading_sessions set memo=p_memo where id=p_id and user_id=owner_id returning * into entry;
    return entry;
  end if;
  if p_action='complete' and entry.status='completed' then return entry; end if;
  if entry.status<>'active' then raise check_violation; end if;
  seconds := least(86400,entry.elapsed_seconds + case when entry.running_since is null then 0
    else greatest(0,floor(extract(epoch from (now()-entry.running_since)))) end)::integer;
  if p_action='cancel' then
    delete from public.reading_sessions where id=p_id and user_id=owner_id;
    return entry;
  elsif p_action='pause' then
    update public.reading_sessions set elapsed_seconds=seconds,running_since=null
      where id=p_id and user_id=owner_id returning * into entry;
  elsif p_action='resume' then
    update public.reading_sessions set running_since=coalesce(running_since,now())
      where id=p_id and user_id=owner_id returning * into entry;
  else
    update public.reading_sessions set status='completed',elapsed_seconds=seconds,running_since=null,finished_at=now(),
      reading_day=(now() at time zone 'Asia/Seoul')::date where id=p_id and user_id=owner_id returning * into entry;
  end if;
  return entry;
end;
$$;

-- Preserve the original reading API, with a starting-page snapshot for future deltas.
-- It shares the same table/index and returns a task timer if one is already active.
create or replace function public.start_reading(p_id uuid,p_work_id uuid) returns public.reading_sessions
language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  book public.works;
  entry public.reading_sessions;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  select * into entry from public.reading_sessions where user_id=owner_id and (id=p_id or status='active')
    order by (status='active') desc limit 1;
  if found then return entry; end if;
  select * into book from public.works where id=p_work_id and user_id=owner_id and kind='book' and status in ('planned','active') for update;
  if not found then raise no_data_found; end if;
  insert into public.reading_sessions(id,user_id,work_id,work_title,cover_url,start_page)
    values(p_id,owner_id,book.id,book.title,book.cover_url,book.progress) on conflict do nothing returning * into entry;
  if not found then
    select * into entry from public.reading_sessions where user_id=owner_id and (id=p_id or status='active')
      order by (status='active') desc limit 1;
    if not found then raise insufficient_privilege; end if;
    return entry;
  end if;
  update public.works set status='active',started_on=coalesce(started_on,(now() at time zone 'Asia/Seoul')::date)
    where id=book.id and user_id=owner_id and status='planned';
  insert into public.reading_preferences(user_id,work_id) values(owner_id,book.id)
    on conflict(user_id) do update set work_id=excluded.work_id;
  return entry;
end;
$$;
revoke all on function public.start_focus(uuid,uuid,integer),public.change_focus(uuid,text,text) from public,anon;
grant execute on function public.start_focus(uuid,uuid,integer),public.change_focus(uuid,text,text) to authenticated;
