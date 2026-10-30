-- Private inbox and revisiting: authenticated callers can read/delete their own
-- rows; controlled RPCs derive ownership, destinations and source snapshots.
create table public.quick_memos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(content) <= 2000 and length(btrim(content,E' \t\n\r')) > 0),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  converted_kind text check (converted_kind in ('task','review','note')),
  converted_id uuid,
  converted_day date check (converted_day between date '1900-01-01' and date '2100-12-31'),
  converted_at timestamptz,
  constraint quick_memos_conversion_complete check (coalesce(
    (converted_kind is null and converted_id is null and converted_day is null and converted_at is null) or
    (converted_kind='task' and converted_id is not null and converted_day is not null and converted_at is not null) or
    (converted_kind='review' and converted_id is null and converted_day is not null and converted_at is not null) or
    (converted_kind='note' and converted_id is not null and converted_day is null and converted_at is not null)
  ,false))
);
create index quick_memos_owner_created_idx on public.quick_memos(user_id,created_at desc,id);
alter table public.quick_memos enable row level security;
alter table public.quick_memos force row level security;
revoke all on public.quick_memos from anon,authenticated;
grant select,delete on public.quick_memos to authenticated;
create policy quick_memos_read_owner on public.quick_memos for select to authenticated using(user_id=(select auth.uid()));
create policy quick_memos_delete_owner on public.quick_memos for delete to authenticated using(user_id=(select auth.uid()));

create function public.create_quick_memo(p_id uuid,p_content text) returns public.quick_memos
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); memo public.quick_memos;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_id is null or p_content is null then raise check_violation; end if;
  insert into public.quick_memos(id,user_id,content) values(p_id,actor,p_content) on conflict(id) do nothing;
  select * into memo from public.quick_memos where id=p_id and user_id=actor;
  if not found then raise no_data_found; end if;
  if memo.content is distinct from p_content then raise exception using errcode='40001',message='MEMO_ID_CONTENT_CONFLICT'; end if;
  return memo;
end;
$$;
create function public.update_quick_memo(p_id uuid,p_content text,p_revision bigint) returns public.quick_memos
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); memo public.quick_memos;
begin
  if actor is null then raise insufficient_privilege; end if;
  select * into memo from public.quick_memos where id=p_id and user_id=actor for update;
  if not found then raise no_data_found; end if;
  if memo.converted_kind is not null then raise exception using errcode='55000',message='MEMO_ALREADY_ORGANIZED'; end if;
  if p_revision is distinct from memo.revision then raise exception using errcode='40001',message='MEMO_REVISION_CONFLICT'; end if;
  if p_content is null then raise check_violation; end if;
  if p_content is not distinct from memo.content then return memo; end if;
  update public.quick_memos set content=p_content,revision=revision+1,updated_at=now() where id=p_id and user_id=actor returning * into memo;
  return memo;
end;
$$;

-- Editors and inbox appends share the same revision and lock. A stale editor
-- cannot overwrite a memo appended after that editor loaded the reflection.
alter table public.daily_reviews add column revision bigint not null default 1 check(revision>0);
create function public.increment_review_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.revision:=old.revision+1;
  return new;
end;
$$;
create trigger daily_reviews_revision before update on public.daily_reviews
  for each row execute function public.increment_review_revision();
create function public.save_daily_review(p_day date,p_expected_revision bigint,p_helped text,p_hindered text,p_gained text,p_next_step text,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); review public.daily_reviews;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_day is null or p_expected_revision is null or p_expected_revision<0 then raise check_violation; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review:'||actor::text||':'||p_day::text,0));
  select * into review from public.daily_reviews where user_id=actor and day=p_day for update;
  if not found then
    if p_expected_revision<>0 then raise exception using errcode='P0001',message='REVIEW_CONFLICT'; end if;
    insert into public.daily_reviews(user_id,day,helped,hindered,gained,next_step,document)
      values(actor,p_day,p_helped,p_hindered,p_gained,p_next_step,p_document) returning * into review;
  else
    if review.revision<>p_expected_revision then raise exception using errcode='P0001',message='REVIEW_CONFLICT'; end if;
    update public.daily_reviews set helped=p_helped,hindered=p_hindered,gained=p_gained,next_step=p_next_step,document=p_document
      where user_id=actor and day=p_day returning * into review;
  end if;
  return to_jsonb(review)-'user_id';
end;
$$;

create function public.convert_quick_memo(p_id uuid,p_kind text,p_day date,p_work_id uuid,p_revision bigint) returns public.quick_memos
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
  if p_revision is distinct from memo.revision then raise exception using errcode='40001',message='MEMO_REVISION_CONFLICT'; end if;
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

create table public.record_revisits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check(source_kind in ('review','note')),
  source_id uuid,
  source_day date,
  source_work_id uuid,
  source_date date not null,
  source_title text not null check(length(source_title) between 1 and 200),
  source_text text not null check(length(source_text) between 1 and 45000),
  thought text not null check(length(thought)<=4000 and length(btrim(thought,E' \t\n\r'))>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((source_kind='review' and source_id is null and source_day is not null and source_work_id is null) or
    (source_kind='note' and source_id is not null and source_day is null and source_work_id is not null))
);
create index record_revisits_owner_created_idx on public.record_revisits(user_id,created_at desc,id);
create index record_revisits_owner_source_idx on public.record_revisits(user_id,source_kind,source_id,source_day,created_at desc);
alter table public.record_revisits enable row level security;
alter table public.record_revisits force row level security;
revoke all on public.record_revisits from anon,authenticated;
grant select,delete on public.record_revisits to authenticated;
create policy record_revisits_read_owner on public.record_revisits for select to authenticated using(user_id=(select auth.uid()));
create policy record_revisits_delete_owner on public.record_revisits for delete to authenticated using(user_id=(select auth.uid()));

-- Centralize source extraction so the picker and immutable snapshot use exactly
-- the same nonempty content, age boundary, ownership and destination links.
create function public.memory_sources() returns table(kind text,source_id uuid,source_day date,source_work_id uuid,title text,body text,source_date date)
language sql stable security definer set search_path='' as $$
  select 'review',null::uuid,r.day,null::uuid,r.day::text||' 회고',
    case when r.document is not null then
      (select string_agg(b.value->>'text',E'\n' order by b.n) from jsonb_array_elements(r.document->'blocks') with ordinality b(value,n))
    else concat_ws(E'\n\n',nullif(r.helped,''),nullif(r.hindered,''),nullif(r.gained,''),nullif(r.next_step,'')) end,
    r.day
  from public.daily_reviews r where r.user_id=auth.uid() and r.day<=(current_timestamp at time zone 'Asia/Seoul')::date-7
    and case when r.document is not null then exists(select 1 from jsonb_array_elements(r.document->'blocks') b where length(btrim(b->>'text',E' \t\n\r'))>0)
      else length(btrim(r.helped||r.hindered||r.gained||r.next_step,E' \t\n\r'))>0 end
  union all
  select 'note',n.id,null::date,n.work_id,w.title,
    n.content||case when length(n.thought)>0 then E'\n\n'||n.thought else '' end,
    (n.created_at at time zone 'Asia/Seoul')::date
  from public.notes n join public.works w on w.id=n.work_id and w.user_id=n.user_id
  where n.user_id=auth.uid() and n.created_at <= current_timestamp-interval '7 days'
    and length(btrim(n.content||n.thought,E' \t\n\r'))>0;
$$;
create function public.next_memory_source(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_offset is null or p_offset<0 or p_offset>1000000 then raise check_violation; end if;
  select jsonb_build_object('kind',s.kind,'source_id',s.source_id,'source_day',s.source_day,
    'title',s.title,'text',s.body,'date',s.source_date,
    'href',case when s.kind='review' then '/?day='||s.source_day::text||'#reflection-'||s.source_day::text else '/library/'||s.source_work_id::text||'#note-'||s.source_id::text end)
    into result from public.memory_sources() s order by s.source_date,s.kind,coalesce(s.source_id::text,s.source_day::text) offset p_offset limit 1;
  return result;
end;
$$;
create function public.create_record_revisit(p_id uuid,p_source_kind text,p_source_id uuid,p_source_day date,p_thought text) returns public.record_revisits
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
      raise exception using errcode='40001',message='REVISIT_ID_CONTENT_CONFLICT';
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

revoke all on function public.create_quick_memo(uuid,text),public.update_quick_memo(uuid,text,bigint),public.convert_quick_memo(uuid,text,date,uuid,bigint),
  public.memory_sources(),public.next_memory_source(integer),public.create_record_revisit(uuid,text,uuid,date,text),
  public.save_daily_review(date,bigint,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_quick_memo(uuid,text),public.update_quick_memo(uuid,text,bigint),public.convert_quick_memo(uuid,text,date,uuid,bigint),
  public.next_memory_source(integer),public.create_record_revisit(uuid,text,uuid,date,text),
  public.save_daily_review(date,bigint,text,text,text,text,jsonb) to authenticated;
