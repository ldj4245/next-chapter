-- Repeat templates produce independent daily plans. Templates never rewrite them.
create function public.routine_weekdays_valid(p_days integer[]) returns boolean
language sql immutable set search_path='' as $$
  select p_days is not null and array_ndims(p_days)=1 and cardinality(p_days) between 1 and 7
    and (select count(*)=count(distinct n) and count(*) filter (where n between 1 and 7)=count(*) from unnest(p_days) as n);
$$;

create table public.planner_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  weekdays integer[] not null check (public.routine_weekdays_valid(weekdays)),
  start_day date not null check (start_day between date '1900-01-01' and date '2100-12-31'),
  end_day date check (end_day between date '1900-01-01' and date '2100-12-31'),
  active boolean not null default true,
  minutes integer check (minutes between 1 and 1440),
  important boolean not null default false,
  goal_id uuid,
  work_id uuid,
  note text not null default '' check (length(note)<=2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  check (end_day is null or end_day>=start_day),
  foreign key (goal_id,user_id) references public.planner_goals(id,user_id) on delete set null (goal_id),
  foreign key (work_id,user_id) references public.works(id,user_id) on delete set null (work_id)
);
create index planner_routines_owner_idx on public.planner_routines(user_id,created_at,id);
create trigger planner_routines_updated before update on public.planner_routines
for each row execute function public.touch_updated_at();

alter table public.daily_tasks add column routine_id uuid;
alter table public.daily_tasks add constraint daily_tasks_routine_owner_fk
foreign key (routine_id,user_id) references public.planner_routines(id,user_id) on delete set null (routine_id);

-- This ledger intentionally keeps the UUID of a removed template. A null task_id
-- marks a deleted occurrence, so revisiting the day cannot recreate it.
create table public.routine_occurrences (
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null,
  day date not null check (day between date '1900-01-01' and date '2100-12-31'),
  task_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id,routine_id,day),
  foreign key (task_id,user_id) references public.daily_tasks(id,user_id) on delete set null (task_id)
);
create index routine_occurrences_task_idx on public.routine_occurrences(task_id,user_id);
create index routine_occurrences_day_idx on public.routine_occurrences(user_id,day);

alter table public.planner_routines enable row level security;
alter table public.planner_routines force row level security;
alter table public.routine_occurrences enable row level security;
alter table public.routine_occurrences force row level security;
revoke all on public.planner_routines,public.routine_occurrences from anon,authenticated;
grant select,insert,update,delete on public.planner_routines to authenticated;
grant select on public.routine_occurrences to authenticated;
create policy planner_routines_owner on public.planner_routines for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy routine_occurrences_owner on public.routine_occurrences for select to authenticated
using (user_id=(select auth.uid()));

create function public.apply_planner_routines(p_day date) returns setof public.daily_tasks
language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  korean_today date := (now() at time zone 'Asia/Seoul')::date;
  template public.planner_routines;
  occurrence_id uuid;
  claimed uuid;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  if p_day is null or p_day<korean_today or p_day not between date '1900-01-01' and date '2100-12-31' then
    raise check_violation using message='Repeat plans can only be generated for today or a future Korean calendar date';
  end if;
  -- Fixed lock order serializes concurrent retries and template edits/deletes.
  for template in select * from public.planner_routines
    where user_id=owner_id and active and start_day<=p_day and (end_day is null or end_day>=p_day)
      and extract(isodow from p_day)::integer=any(weekdays)
    order by id for update
  loop
    claimed := null;
    insert into public.routine_occurrences(user_id,routine_id,day)
      values(owner_id,template.id,p_day) on conflict do nothing returning routine_id into claimed;
    if claimed is null then continue; end if;
    occurrence_id := gen_random_uuid();
    insert into public.daily_tasks(id,user_id,day,title,important,minutes,goal_id,work_id,note,routine_id)
      values(occurrence_id,owner_id,p_day,template.title,template.important,template.minutes,template.goal_id,template.work_id,template.note,template.id);
    update public.routine_occurrences set task_id=occurrence_id
      where user_id=owner_id and routine_id=template.id and day=p_day;
  end loop;
  return query select task.* from public.routine_occurrences occurrence
    join public.daily_tasks task on task.id=occurrence.task_id and task.user_id=occurrence.user_id
    where occurrence.user_id=owner_id and occurrence.day=p_day and task.day=p_day
    order by task.important desc,task.created_at,task.id;
end;
$$;
revoke all on function public.apply_planner_routines(date) from public,anon;
grant execute on function public.apply_planner_routines(date) to authenticated;
