-- Business conflicts are final user decisions, not serialization failures.
-- Use explicit application errors so database gateways do not retry them.
create or replace function public.create_quick_memo(p_id uuid,p_content text) returns public.quick_memos
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); memo public.quick_memos;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_id is null or p_content is null then raise check_violation; end if;
  insert into public.quick_memos(id,user_id,content) values(p_id,actor,p_content) on conflict(id) do nothing;
  select * into memo from public.quick_memos where id=p_id and user_id=actor;
  if not found then raise no_data_found; end if;
  if memo.content is distinct from p_content then raise exception using errcode='P0001',message='MEMO_ID_CONTENT_CONFLICT'; end if;
  return memo;
end;
$$;

create or replace function public.update_quick_memo(p_id uuid,p_content text,p_revision bigint) returns public.quick_memos
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); memo public.quick_memos;
begin
  if actor is null then raise insufficient_privilege; end if;
  select * into memo from public.quick_memos where id=p_id and user_id=actor for update;
  if not found then raise no_data_found; end if;
  if memo.converted_kind is not null then raise exception using errcode='55000',message='MEMO_ALREADY_ORGANIZED'; end if;
  if p_revision is distinct from memo.revision then raise exception using errcode='P0001',message='MEMO_REVISION_CONFLICT'; end if;
  if p_content is null then raise check_violation; end if;
  if p_content is not distinct from memo.content then return memo; end if;
  update public.quick_memos set content=p_content,revision=revision+1,updated_at=now() where id=p_id and user_id=actor returning * into memo;
  return memo;
end;
$$;

create or replace function public.convert_quick_memo(p_id uuid,p_kind text,p_day date,p_work_id uuid,p_revision bigint) returns public.quick_memos
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); memo public.quick_memos; target_id uuid; target_title text;
  review public.daily_reviews; doc jsonb; blocks jsonb:='[]'::jsonb; legacy record;
begin
  if actor is null then raise insufficient_privilege; end if;
  select * into memo from public.quick_memos where id=p_id and user_id=actor for update;
  if not found then raise no_data_found; end if;
  -- The locked source is the idempotency key, including retries after editing
  -- or deleting the destination. Never create another target from this memo.
  if memo.converted_kind is not null then return memo; end if;
  if p_revision is distinct from memo.revision then raise exception using errcode='P0001',message='MEMO_REVISION_CONFLICT'; end if;
  if p_kind is null or p_kind not in ('task','review','note') or p_day is null or p_day not between date '1900-01-01' and date '2100-12-31' then raise check_violation; end if;
  if p_kind='note' then
    perform 1 from public.works where id=p_work_id and user_id=actor for key share;
    if not found then raise no_data_found; end if;
    target_id:=gen_random_uuid();
    insert into public.notes(id,user_id,work_id,content,thought) values(target_id,actor,p_work_id,memo.content,'');
  elsif p_kind='task' then
    select left(btrim(line,E' \t\r'),200) into target_title
      from regexp_split_to_table(memo.content,E'\n') with ordinality as lines(line,n)
      where length(btrim(line,E' \t\r'))>0 order by n limit 1;
    target_id:=gen_random_uuid();
    insert into public.daily_tasks(id,user_id,day,title,note) values(target_id,actor,p_day,target_title,memo.content);
  else
    -- Serialize empty-day creation as well as appends to existing rows. Read the
    -- document only after locking; an ordinary concurrent update also takes the
    -- row lock, so this append preserves the latest committed body.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review:'||actor::text||':'||p_day::text,0));
    insert into public.daily_reviews(user_id,day) values(actor,p_day) on conflict(user_id,day) do nothing;
    select * into review from public.daily_reviews where user_id=actor and day=p_day for update;
    if review.document is not null then
      blocks:=review.document->'blocks';
    else
      for legacy in select * from (values
        (1,'잘 된 것',review.helped),(2,'어려웠던 것',review.hindered),
        (3,'얻은 것',review.gained),(4,'다음에 해볼 것',review.next_step)) as answers(n,heading,body) order by n loop
        if length(legacy.body)>0 then
          blocks:=blocks||jsonb_build_array(
            jsonb_build_object('id',gen_random_uuid(),'kind','heading2','text',legacy.heading,'checked',false),
            jsonb_build_object('id',gen_random_uuid(),'kind','paragraph','text',legacy.body,'checked',false));
        end if;
      end loop;
    end if;
    blocks:=blocks||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','paragraph','text',memo.content,'checked',false));
    doc:=jsonb_build_object('version',1,'blocks',blocks);
    if not public.valid_reflection_document(doc) then raise exception using errcode='22001',message='REFLECTION_CAPACITY_EXCEEDED'; end if;
    update public.daily_reviews set document=doc where user_id=actor and day=p_day;
  end if;
  update public.quick_memos set converted_kind=p_kind,converted_id=target_id,
    converted_day=case when p_kind in ('task','review') then p_day else null end,
    converted_at=now(),updated_at=now(),revision=revision+1
    where id=p_id and user_id=actor returning * into memo;
  return memo;
end;
$$;

create or replace function public.create_record_revisit(p_id uuid,p_source_kind text,p_source_id uuid,p_source_day date,p_thought text) returns public.record_revisits
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); entry public.record_revisits; source record;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_id is null or p_thought is null or p_source_kind is null or p_source_kind not in ('review','note')
    or (p_source_kind='review' and (p_source_day is null or p_source_id is not null))
    or (p_source_kind='note' and (p_source_id is null or p_source_day is not null)) then raise check_violation; end if;
  -- Serialize same-ID retries before checking a source which may since have
  -- disappeared. The saved snapshot remains readable after source deletion.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revisit:'||p_id::text,0));
  select * into entry from public.record_revisits where id=p_id and user_id=actor;
  if found then
    if entry.source_kind is distinct from p_source_kind or entry.source_id is distinct from p_source_id or entry.source_day is distinct from p_source_day or entry.thought is distinct from p_thought then
      raise exception using errcode='P0001',message='REVISIT_ID_CONTENT_CONFLICT';
    end if;
    return entry;
  end if;
  select * into source from public.memory_sources() s where s.kind=p_source_kind and s.source_id is not distinct from p_source_id and s.source_day is not distinct from p_source_day;
  if not found then raise no_data_found; end if;
  insert into public.record_revisits(id,user_id,source_kind,source_id,source_day,source_work_id,source_date,source_title,source_text,thought)
    values(p_id,actor,source.kind,source.source_id,source.source_day,source.source_work_id,source.source_date,source.title,source.body,p_thought)
    on conflict(id) do nothing returning * into entry;
  if entry.id is null then raise no_data_found; end if;
  return entry;
end;
$$;
