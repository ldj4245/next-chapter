-- Optional measurement adds to the existing goal, without assigning a new status.
alter table public.planner_goals
  add column metric_unit text,
  add column metric_target integer,
  add column metric_start_day date,
  add constraint planner_goals_metric_unit_check check (metric_unit is null or metric_unit in ('minutes','tasks','pages')),
  add constraint planner_goals_metric_target_check check (metric_target is null or metric_target between 1 and 10000000),
  add constraint planner_goals_metric_start_check check (metric_start_day is null or metric_start_day between date '1900-01-01' and date '2100-12-31'),
  add constraint planner_goals_metric_fields_check check (metric_unit is not null or (metric_target is null and metric_start_day is null)),
  add constraint planner_goals_metric_range_check check (metric_start_day is null or target_day is null or metric_start_day <= target_day);

-- Existing owner policies cover the additive columns, including direct client writes.
-- Completed focus sessions supply actual time and page deltas; task estimates are not backfilled.
