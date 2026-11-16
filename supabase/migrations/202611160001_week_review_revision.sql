-- Optimistic concurrency revision for weekly reviews, matching daily_reviews.
alter table public.planner_week_reviews add column revision bigint not null default 1 check (revision > 0);

create trigger planner_week_reviews_revision before update on public.planner_week_reviews
  for each row execute function public.increment_review_revision();

create function public.save_week_review(p_day date, p_expected_revision bigint, p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); review public.planner_week_reviews;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_day is null or p_expected_revision is null or p_expected_revision < 0 then raise check_violation; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('week-review:' || actor::text || ':' || p_day::text, 0));
  select * into review from public.planner_week_reviews where user_id = actor and day = p_day for update;
  if not found then
    if p_expected_revision <> 0 then raise exception using errcode = 'P0001', message = 'REVIEW_CONFLICT'; end if;
    insert into public.planner_week_reviews(user_id, day, document)
      values(actor, p_day, p_document) returning * into review;
  else
    if review.revision <> p_expected_revision then raise exception using errcode = 'P0001', message = 'REVIEW_CONFLICT'; end if;
    update public.planner_week_reviews set document = p_document, updated_at = now()
      where user_id = actor and day = p_day returning * into review;
  end if;
  return to_jsonb(review) - 'user_id';
end;
$$;

revoke all on function public.save_week_review(date, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_week_review(date, bigint, jsonb) to authenticated;
