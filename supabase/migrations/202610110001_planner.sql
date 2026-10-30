-- Daily plans and reflection share one private space for reading, learning and life.
create table public.planner_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  period text not null check (period in ('short','long')),
  status text not null default 'active' check (status in ('active','completed','paused')),
  motivation text not null default '' check (length(motivation) <= 3000),
  target_day date check (target_day between date '1900-01-01' and date '2100-12-31'),
  parent_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  check (parent_id is null or (period='short' and parent_id<>id)),
  foreign key (parent_id,user_id) references public.planner_goals(id,user_id) on delete set null (parent_id)
);
create table public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null check (day between date '1900-01-01' and date '2100-12-31'),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'planned' check (status in ('planned','partial','completed','not_done')),
  important boolean not null default false,
  minutes integer check (minutes between 1 and 1440),
  goal_id uuid,
  work_id uuid,
  reason text not null default '' check (reason in ('','time','energy','overload','difficulty','priority','other')),
  reason_detail text not null default '' check (length(reason_detail) <= 2000),
  note text not null default '' check (length(note) <= 2000),
  carried_from_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  unique (user_id,carried_from_id),
  check (carried_from_id is null or carried_from_id<>id),
  check (status in ('partial','not_done') or (reason='' and reason_detail='')),
  foreign key (goal_id,user_id) references public.planner_goals(id,user_id) on delete set null (goal_id),
  foreign key (work_id,user_id) references public.works(id,user_id) on delete set null (work_id),
  foreign key (carried_from_id,user_id) references public.daily_tasks(id,user_id) on delete set null (carried_from_id)
);
create table public.daily_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null check (day between date '1900-01-01' and date '2100-12-31'),
  helped text not null default '' check (length(helped) <= 5000),
  hindered text not null default '' check (length(hindered) <= 5000),
  gained text not null default '' check (length(gained) <= 5000),
  next_step text not null default '' check (length(next_step) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,day)
);
create index planner_goals_owner_idx on public.planner_goals(user_id,created_at desc);
create index daily_tasks_owner_day_idx on public.daily_tasks(user_id,day,important desc,created_at);
create index daily_tasks_owner_goal_idx on public.daily_tasks(user_id,goal_id,day desc);

create function public.check_planner_parent() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.parent_id is not null then
    perform 1 from public.planner_goals where id=new.parent_id and user_id=new.user_id and period='long';
    if not found then raise foreign_key_violation using message='Parent must be an owned long-term goal'; end if;
  end if;
  if new.period<>'long' and exists(select 1 from public.planner_goals where parent_id=new.id and user_id=new.user_id) then
    raise check_violation using message='A goal with children must remain long-term';
  end if;
  return new;
end;
$$;
create trigger planner_goals_parent before insert or update on public.planner_goals
for each row execute function public.check_planner_parent();
create trigger planner_goals_updated before update on public.planner_goals for each row execute function public.touch_updated_at();
create trigger daily_tasks_updated before update on public.daily_tasks for each row execute function public.touch_updated_at();
create trigger daily_reviews_updated before update on public.daily_reviews for each row execute function public.touch_updated_at();

alter table public.planner_goals enable row level security;
alter table public.planner_goals force row level security;
alter table public.daily_tasks enable row level security;
alter table public.daily_tasks force row level security;
alter table public.daily_reviews enable row level security;
alter table public.daily_reviews force row level security;
revoke all on public.planner_goals, public.daily_tasks, public.daily_reviews from anon, authenticated;
grant select,insert,update,delete on public.planner_goals, public.daily_tasks, public.daily_reviews to authenticated;
create policy planner_goals_owner on public.planner_goals for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy daily_tasks_owner on public.daily_tasks for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy daily_reviews_owner on public.daily_reviews for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- Moving a task creates a new plan while preserving the original day's outcome.
-- Row locking plus a unique source prevents duplicates on retries/concurrent requests.
create function public.defer_daily_task(p_id uuid,p_new_id uuid,p_day date,p_reason text default '',p_detail text default '')
returns public.daily_tasks language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  original public.daily_tasks;
  carried public.daily_tasks;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  select * into original from public.daily_tasks where id=p_id and user_id=owner_id for update;
  if not found then raise no_data_found; end if;
  select * into carried from public.daily_tasks where carried_from_id=p_id and user_id=owner_id;
  if found then return carried; end if;
  if original.status='completed' or p_day<=original.day or p_new_id=p_id then raise check_violation; end if;
  insert into public.daily_tasks(id,user_id,day,title,important,minutes,goal_id,work_id,carried_from_id)
    values(p_new_id,owner_id,p_day,original.title,original.important,original.minutes,original.goal_id,original.work_id,original.id)
    returning * into carried;
  update public.daily_tasks set status=case when status='partial' then 'partial' else 'not_done' end,
    reason=p_reason,reason_detail=p_detail where id=p_id and user_id=owner_id;
  return carried;
end;
$$;
revoke all on function public.defer_daily_task(uuid,uuid,date,text,text) from public,anon;
grant execute on function public.defer_daily_task(uuid,uuid,date,text,text) to authenticated;
