-- Reuse the existing summary; compare only this field, because adding a quote
-- legitimately changes works.updated_at and must not invalidate a verdict draft.
create function public.save_work_summary(p_id uuid,p_summary text,p_expected_summary text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.works;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_summary is null or p_expected_summary is null or length(p_summary)>300 or length(p_expected_summary)>300 then raise check_violation; end if;
  select * into item from public.works where id=p_id and user_id=actor for update;
  if not found then raise no_data_found; end if;
  if item.summary=p_summary then return to_jsonb(item)-'user_id'; end if;
  if item.summary is distinct from p_expected_summary then raise exception using errcode='P0001',message='SUMMARY_CONFLICT'; end if;
  update public.works set summary=p_summary where id=p_id and user_id=actor returning * into item;
  return to_jsonb(item)-'user_id';
end;
$$;
revoke all on function public.save_work_summary(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_work_summary(uuid,text,text) to authenticated;
