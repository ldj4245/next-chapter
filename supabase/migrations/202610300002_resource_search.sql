-- Extend the existing private search; keep every original branch and its owner predicate.
create or replace function public.search_private_records(p_query text, p_kind text default 'all', p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  query_text text := btrim(p_query);
  literal_pattern text;
  result jsonb;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  if p_query is null or length(p_query)>80 or p_query ~ '[[:cntrl:]]' or
    p_kind is null or p_kind not in ('all','task','memo','review','library','resources','goal') or
    p_offset is null or p_offset<0 or p_offset>1000000 then raise invalid_parameter_value using message='Invalid search input'; end if;
  if query_text='' then return jsonb_build_object('results','[]'::jsonb,'hasMore',false,'nextOffset',null); end if;
  -- Escape the escape character first. %, _ and backslash always mean themselves.
  literal_pattern := '%' || replace(replace(replace(lower(query_text), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  with owned as (
    select t.id::text as id, 'task'::text as record_type, 'task'::text as kind,
      t.title, concat_ws(E'\n',t.title,t.note,t.reason,t.reason_detail,t.public_note,
        case t.reason when 'time' then '시간 부족' when 'energy' then '기운 부족' when 'overload' then '계획 과다'
          when 'difficulty' then '어려움' when 'priority' then '우선순위 변경' when 'other' then '기타' else '' end) as body,
      t.day as source_day, t.updated_at as touched_at, '/?day='||t.day||'#task-'||t.id as href
      from public.daily_tasks t where t.user_id=owner_id and p_kind in ('all','task')
    union all
    select g.id::text,'goal','goal',g.title,concat_ws(E'\n',g.title,g.motivation),
      (g.created_at at time zone 'Asia/Seoul')::date,g.updated_at,'/goals#goal-'||g.id
      from public.planner_goals g where g.user_id=owner_id and p_kind in ('all','goal')
    union all
    select r.day::text,'review','review','하루 회고',
      case when r.document is not null then public.record_search_document_text(r.document) else concat_ws(E'\n',r.helped,r.hindered,r.gained,r.next_step) end,
      r.day,r.updated_at,'/?day='||r.day||'#reflection-'||r.day
      from public.daily_reviews r where r.user_id=owner_id and p_kind in ('all','review')
    union all
    select w.day::text,'week_review','review','주간 회고',public.record_search_document_text(w.document),
      w.day,w.updated_at,'/?day='||w.day||'#week-review-'||w.day
      from public.planner_week_reviews w where w.user_id=owner_id and p_kind in ('all','review')
    union all
    select s.id::text,'session','task',coalesce(nullif(s.task_title,''),s.work_title),
      concat_ws(E'\n',s.task_title,s.work_title,s.memo),coalesce(s.reading_day,(s.started_at at time zone 'Asia/Seoul')::date),
      coalesce(s.finished_at,s.started_at),'/?day='||coalesce(s.reading_day,(s.started_at at time zone 'Asia/Seoul')::date)||'#session-'||s.id
      from public.reading_sessions s where s.user_id=owner_id and p_kind in ('all','task')
    union all
    select w.id::text,'work','library',w.title,concat_ws(E'\n',w.title,w.creator,w.summary,array_to_string(w.tags,' ')),
      (w.created_at at time zone 'Asia/Seoul')::date,w.updated_at,'/library/'||w.id
      from public.works w where w.user_id=owner_id and p_kind in ('all','library')
    union all
    select n.id::text,'note','library',left(n.content,100),concat_ws(E'\n',n.content,n.thought),
      (n.created_at at time zone 'Asia/Seoul')::date,n.updated_at,'/library/'||n.work_id||'#note-'||n.id
      from public.notes n where n.user_id=owner_id and p_kind in ('all','library')
    union all
    select m.id::text,'memo','memo',left(m.content,100),concat_ws(E'\n',m.content,case when m.converted_day is not null then '정리한 날짜 '||m.converted_day::text else null end,
        case m.converted_kind when 'task' then '할 일로 정리' when 'review' then '회고로 정리' when 'note' then '서재 기록으로 정리' else '' end),
      (m.created_at at time zone 'Asia/Seoul')::date,m.updated_at,
      case when m.converted_kind is null then '/notes#memo-' else '/notes?organized=1#memo-' end||m.id
      from public.quick_memos m where m.user_id=owner_id and p_kind in ('all','memo')
    union all
    select r.id::text,'revisit','memo',coalesce(nullif(r.source_title,''),'다시 읽기'),concat_ws(E'\n',r.thought,r.source_title,r.source_text),
      r.source_date,r.updated_at,'/revisit?entry='||r.id
      from public.record_revisits r where r.user_id=owner_id and p_kind in ('all','memo')
    union all
    select r.id::text,'resource','resources',r.title,concat_ws(E'\n',r.title,r.url,r.memo,array_to_string(r.tags,' ')),
      (r.created_at at time zone 'Asia/Seoul')::date,r.updated_at,'/resources/'||r.id
      from public.learning_resources r where r.user_id=owner_id and p_kind in ('all','resources')
    union all
    select b.id::text,'resource_bookmark','resources',left(r.title||' · '||b.label,200),concat_ws(E'\n',r.title,b.label,b.seconds::text),
      (b.created_at at time zone 'Asia/Seoul')::date,b.created_at,'/resources/'||r.id||'#bookmark-'||b.id
      from public.resource_bookmarks b join public.learning_resources r on r.id=b.resource_id and r.user_id=b.user_id
      where b.user_id=owner_id and r.user_id=owner_id and p_kind in ('all','resources')
  ), matched as (
    select * from owned where lower(body) like literal_pattern escape E'\\'
      order by touched_at desc, record_type, id limit 31 offset p_offset
  ), page as (
    select * from matched order by touched_at desc, record_type, id limit 30
  )
  select jsonb_build_object(
    'results',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'recordType',p.record_type,'group',p.kind,
      'title',left(p.title,200),'excerpt',public.record_search_excerpt(p.body,query_text),'date',p.source_day::text,'href',p.href)
      order by p.touched_at desc,p.record_type,p.id) from page p),'[]'::jsonb),
    'hasMore',(select count(*)>30 from matched),
    'nextOffset',case when (select count(*)>30 from matched) then p_offset+30 else null end
  ) into result;
  return result;
end;
$$;
revoke all on function public.record_search_document_text(jsonb),public.record_search_excerpt(text,text),public.search_private_records(text,text,integer) from public,anon;
grant execute on function public.record_search_document_text(jsonb),public.record_search_excerpt(text,text),public.search_private_records(text,text,integer) to authenticated;
comment on function public.search_private_records(text,text,integer) is 'Private owner-only literal substring search; bounded 30-row excerpts, read-only, no partner projection.';
