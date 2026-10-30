-- Optional daily time budget and weekly free-form reflections. No existing rows are rewritten.
create table public.planner_day_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null check (day between '1900-01-01' and '2100-12-31'),
  available_minutes integer check (available_minutes between 0 and 1440),
  primary key(user_id, day)
);
create table public.planner_week_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null check (day between '1900-01-01' and '2100-12-31' and extract(isodow from day)=1),
  document jsonb not null check (public.valid_reflection_document(document)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, day)
);
alter table public.planner_day_preferences enable row level security;
alter table public.planner_day_preferences force row level security;
alter table public.planner_week_reviews enable row level security;
alter table public.planner_week_reviews force row level security;
revoke all on public.planner_day_preferences, public.planner_week_reviews from public, anon, authenticated;
grant select, insert, update, delete on public.planner_day_preferences, public.planner_week_reviews to authenticated;
create policy planner_day_preferences_owner on public.planner_day_preferences for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy planner_week_reviews_owner on public.planner_week_reviews for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
