-- Extend the existing carry-forward transaction without losing original notes,
-- reasons, privacy defaults or its unique-source retry protection.
create function public.defer_daily_tasks(p_ids uuid[],p_day date,p_source_day date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); source public.daily_tasks; carried public.daily_tasks; output jsonb:='[]'::jsonb; count_ids integer;
begin
  if actor is null then raise insufficient_privilege;end if;
  count_ids:=cardinality(p_ids);
  if count_ids is null or count_ids<1 or count_ids>50 or p_day is null or p_source_day is null or p_day<=p_source_day
    or p_day>'2100-12-31'::date or p_source_day<'1900-01-01'::date
    or exists(select 1 from unnest(p_ids) as t(id) where id is null)
    or (select count(distinct id) from unnest(p_ids) as t(id))<>count_ids then raise check_violation;end if;
  if (select count(*) from public.daily_tasks where user_id=actor and id=any(p_ids) and day=p_source_day)<>count_ids then raise no_data_found;end if;
  for source in select * from public.daily_tasks where user_id=actor and id=any(p_ids) order by id for update loop
    if source.day<>p_source_day then raise exception using errcode='P0001',message='BATCH_TASK_CHANGED';end if;
    select * into carried from public.daily_tasks where user_id=actor and carried_from_id=source.id;
    if found then
      if carried.day<>p_day then raise exception using errcode='P0001',message='BATCH_TARGET_CHANGED';end if;
    else
      if source.status='completed' then raise exception using errcode='P0001',message='BATCH_TASK_CHANGED';end if;
      carried:=public.defer_daily_task(source.id,gen_random_uuid(),p_day,source.reason,source.reason_detail);
    end if;
    select * into source from public.daily_tasks where user_id=actor and id=source.id;
    output:=output||jsonb_build_array(jsonb_build_object('task',to_jsonb(source)-'user_id','carried',to_jsonb(carried)-'user_id'));
  end loop;
  return output;
end;
$$;
revoke all on function public.defer_daily_tasks(uuid[],date,date) from public,anon;
grant execute on function public.defer_daily_tasks(uuid[],date,date) to authenticated;
