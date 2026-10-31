create schema internal_admin;
revoke all on schema internal_admin from public,anon,authenticated;

create table internal_admin.operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table internal_admin.account_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_test boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table internal_admin.settings (
  singleton boolean primary key default true check(singleton),
  tracking_since timestamptz not null default now()
);
insert into internal_admin.settings(singleton) values(true);
create table internal_admin.activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  feature text not null check(feature in ('planning','reviews','focus','library','resources','memos','photos','partner')),
  saves bigint not null default 1 check(saves>0),
  last_at timestamptz not null default now(),
  primary key(user_id,day,feature)
);
create index admin_activity_date on internal_admin.activity_days(day,last_at);
create table internal_admin.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('overview','members','member','records','photo','classification','audit')),
  section text,
  created_at timestamptz not null default now()
);
create index admin_audit_date on internal_admin.audit_events(created_at desc,id desc);
create index admin_audit_target on internal_admin.audit_events(target_id,created_at desc);
alter table internal_admin.operators enable row level security;
alter table internal_admin.operators force row level security;
alter table internal_admin.account_flags enable row level security;
alter table internal_admin.account_flags force row level security;
alter table internal_admin.settings enable row level security;
alter table internal_admin.settings force row level security;
alter table internal_admin.activity_days enable row level security;
alter table internal_admin.activity_days force row level security;
alter table internal_admin.audit_events enable row level security;
alter table internal_admin.audit_events force row level security;
revoke all on all tables in schema internal_admin from public,anon,authenticated;
revoke all on all sequences in schema internal_admin from public,anon,authenticated;

create function public.admin_access() returns boolean
language plpgsql security definer set search_path='' as $$
begin
  return exists(select 1 from internal_admin.operators a join auth.users u on u.id=a.user_id
    where a.user_id=auth.uid() and a.enabled and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now()));
end;
$$;
create function internal_admin.require_operator() returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if not public.admin_access() then raise insufficient_privilege using message='ADMIN_REQUIRED'; end if;
  return auth.uid();
end;
$$;
create function internal_admin.audit(p_action text,p_target uuid default null,p_section text default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal_admin.require_operator();
begin
  delete from internal_admin.audit_events where created_at<now()-interval '90 days';
  delete from internal_admin.activity_days where day<(now() at time zone 'Asia/Seoul')::date-89;
  insert into internal_admin.audit_events(actor_id,target_id,action,section) values(actor,p_target,p_action,p_section);
end;
$$;

create function internal_admin.track_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare payload jsonb; previous jsonb; owner_id uuid; feature_name text:=tg_argv[0];
begin
  if tg_op='DELETE' then return old; end if;
  payload:=to_jsonb(new); owner_id:=(payload->>'user_id')::uuid;
  if auth.uid() is null or owner_id is distinct from auth.uid() then return new; end if;
  if tg_op='UPDATE' then
    previous:=to_jsonb(old);
    if (payload-array['updated_at','revision'])=(previous-array['updated_at','revision']) then return new; end if;
  end if;
  if tg_table_name='reading_sessions' then
    if payload->>'status'<>'completed' or (tg_op='UPDATE' and previous->>'status'='completed') then return new; end if;
  end if;
  if tg_table_name='task_photos' then
    if payload->>'state'<>'ready' or (tg_op='UPDATE' and previous->>'state'='ready') then return new; end if;
  end if;
  insert into internal_admin.activity_days(user_id,day,feature,last_at)
    values(owner_id,(now() at time zone 'Asia/Seoul')::date,feature_name,now())
    on conflict(user_id,day,feature) do update set saves=internal_admin.activity_days.saves+1,last_at=excluded.last_at;
  return new;
end;
$$;
create trigger admin_activity_tasks after insert or update on public.daily_tasks for each row execute function internal_admin.track_activity('planning');
create trigger admin_activity_goals after insert or update on public.planner_goals for each row execute function internal_admin.track_activity('planning');
create trigger admin_activity_routines after insert or update on public.planner_routines for each row execute function internal_admin.track_activity('planning');
create trigger admin_activity_reviews after insert or update on public.daily_reviews for each row execute function internal_admin.track_activity('reviews');
create trigger admin_activity_week_reviews after insert or update on public.planner_week_reviews for each row execute function internal_admin.track_activity('reviews');
create trigger admin_activity_focus after insert or update on public.reading_sessions for each row execute function internal_admin.track_activity('focus');
create trigger admin_activity_works after insert or update on public.works for each row execute function internal_admin.track_activity('library');
create trigger admin_activity_notes after insert or update on public.notes for each row execute function internal_admin.track_activity('library');
create trigger admin_activity_memos after insert or update on public.quick_memos for each row execute function internal_admin.track_activity('memos');
create trigger admin_activity_revisits after insert or update on public.record_revisits for each row execute function internal_admin.track_activity('memos');
create trigger admin_activity_resources after insert or update on public.learning_resources for each row execute function internal_admin.track_activity('resources');
create trigger admin_activity_bookmarks after insert or update on public.resource_bookmarks for each row execute function internal_admin.track_activity('resources');
create trigger admin_activity_photos after insert or update on public.task_photos for each row execute function internal_admin.track_activity('photos');
create trigger admin_activity_partner after insert or update on public.partner_profiles for each row execute function internal_admin.track_activity('partner');

create function internal_admin.member_rows() returns table(
  id uuid,email text,nickname text,created_at timestamptz,last_sign_in_at timestamptz,
  confirmed boolean,account_status text,is_test boolean,is_admin boolean,last_activity_at timestamptz
)
language plpgsql security definer set search_path='' as $$
begin
  perform internal_admin.require_operator();
  return query select u.id,u.email::text,coalesce(p.nickname,''),u.created_at,u.last_sign_in_at,
    u.email_confirmed_at is not null,
    case when u.deleted_at is not null then 'deleted' when u.banned_until>now() then 'banned'
      when u.email_confirmed_at is null then 'unconfirmed' else 'active' end,
    coalesce(f.is_test,false),coalesce(a.enabled,false),v.last_at
    from auth.users u left join public.partner_profiles p on p.user_id=u.id
    left join internal_admin.account_flags f on f.user_id=u.id
    left join internal_admin.operators a on a.user_id=u.id
    left join lateral(select max(d.last_at) as last_at from internal_admin.activity_days d where d.user_id=u.id) v on true;
end;
$$;

create function public.admin_overview() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
  perform internal_admin.audit('overview');
  select jsonb_build_object(
    'registered',count(*),'members',count(*) filter(where not is_test),'tests',count(*) filter(where is_test),
    'active_today',count(*) filter(where not is_test and last_activity_at>=today::timestamp at time zone 'Asia/Seoul'),
    'active_7d',count(*) filter(where not is_test and last_activity_at>=(today-6)::timestamp at time zone 'Asia/Seoul'),
    'active_30d',count(*) filter(where not is_test and last_activity_at>=(today-29)::timestamp at time zone 'Asia/Seoul'),
    'tracking_since',(select tracking_since from internal_admin.settings),
    'server_now',now(),
    'features',coalesce((select jsonb_agg(to_jsonb(s) order by s.feature) from(
      select d.feature,count(distinct d.user_id) as users,sum(d.saves) as saves from internal_admin.activity_days d
      left join internal_admin.account_flags f on f.user_id=d.user_id
      where not coalesce(f.is_test,false) and d.day>=today-29 group by d.feature)s),'[]'::jsonb)
  ) into result from internal_admin.member_rows();
  return result;
end;
$$;
create function public.admin_members(p_search text default '',p_kind text default 'all',p_sort text default 'joined',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform internal_admin.require_operator();
  if p_search is null or length(p_search)>120 or p_kind not in ('all','members','test') or p_kind is null
    or p_sort not in ('joined','login','activity') or p_sort is null or p_offset is null or p_offset<0 or p_offset>1000000 then raise check_violation; end if;
  perform internal_admin.audit('members');
  with filtered as materialized(select * from internal_admin.member_rows() m
    where (p_kind='all' or p_kind='test' and m.is_test or p_kind='members' and not m.is_test)
      and (btrim(p_search)='' or position(lower(btrim(p_search)) in lower(coalesce(m.email,'')||' '||m.nickname))>0)),
  page as(select * from filtered order by
    case when p_sort='login' then last_sign_in_at when p_sort='activity' then last_activity_at else created_at end desc nulls last,id limit 25 offset p_offset)
  select jsonb_build_object('total',(select count(*) from filtered),'offset',p_offset,'limit',25,
    'members',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;

-- Only service records enter this projection. Authentication secrets, invite
-- hashes and Storage object paths are deliberately absent.
create function internal_admin.record_rows(p_user uuid) returns table(kind text,id text,title text,day date,at timestamptz,data jsonb)
language plpgsql security definer set search_path='' as $$
begin
  perform internal_admin.require_operator();
  return query
  select 'task',t.id::text,t.title,t.day,t.updated_at,to_jsonb(t)-'user_id'||jsonb_build_object('goal_title',g.title,'work_title',w.title)
    from public.daily_tasks t left join public.planner_goals g on g.id=t.goal_id and g.user_id=t.user_id left join public.works w on w.id=t.work_id and w.user_id=t.user_id where t.user_id=p_user
  union all select 'goal',g.id::text,g.title,(g.created_at at time zone 'Asia/Seoul')::date,g.updated_at,to_jsonb(g)-'user_id' from public.planner_goals g where g.user_id=p_user
  union all select 'routine',r.id::text,r.title,(r.created_at at time zone 'Asia/Seoul')::date,r.updated_at,to_jsonb(r)-'user_id' from public.planner_routines r where r.user_id=p_user
  union all select 'review',r.day::text,'하루 회고',r.day,r.updated_at,to_jsonb(r)-'user_id' from public.daily_reviews r where r.user_id=p_user
  union all select 'week_review',r.day::text,'주간 회고',r.day,r.updated_at,to_jsonb(r)-'user_id' from public.planner_week_reviews r where r.user_id=p_user
  union all select 'work',w.id::text,w.title,(w.created_at at time zone 'Asia/Seoul')::date,w.updated_at,to_jsonb(w)-'user_id' from public.works w where w.user_id=p_user
  union all select 'note',n.id::text,coalesce(w.title,'작품 기록'),(n.created_at at time zone 'Asia/Seoul')::date,n.updated_at,to_jsonb(n)-'user_id' from public.notes n left join public.works w on w.id=n.work_id and w.user_id=n.user_id where n.user_id=p_user
  union all select 'focus',r.id::text,coalesce(nullif(r.task_title,''),nullif(r.work_title,''),'집중 기록'),coalesce(r.reading_day,(r.started_at at time zone 'Asia/Seoul')::date),coalesce(r.finished_at,r.started_at),to_jsonb(r)-'user_id' from public.reading_sessions r where r.user_id=p_user
  union all select 'memo',m.id::text,'메모',(m.created_at at time zone 'Asia/Seoul')::date,m.updated_at,to_jsonb(m)-'user_id' from public.quick_memos m where m.user_id=p_user
  union all select 'revisit',r.id::text,r.source_title,(r.created_at at time zone 'Asia/Seoul')::date,r.updated_at,to_jsonb(r)-'user_id' from public.record_revisits r where r.user_id=p_user
  union all select 'resource',r.id::text,r.title,(r.created_at at time zone 'Asia/Seoul')::date,r.updated_at,to_jsonb(r)-'user_id' from public.learning_resources r where r.user_id=p_user
  union all select 'bookmark',b.id::text,coalesce(r.title,'영상 구간'),(b.created_at at time zone 'Asia/Seoul')::date,b.created_at,to_jsonb(b)-'user_id'||jsonb_build_object('resource_url',r.url) from public.resource_bookmarks b left join public.learning_resources r on r.id=b.resource_id and r.user_id=b.user_id where b.user_id=p_user
  union all select 'photo',p.id::text,coalesce(t.title,'첨부 사진'),(p.created_at at time zone 'Asia/Seoul')::date,p.created_at,to_jsonb(p)-array['user_id','original_path','thumbnail_path']||jsonb_build_object('task_day',t.day,'shared',t.photos_shared) from public.task_photos p left join public.daily_tasks t on t.id=p.task_id and t.user_id=p.user_id where p.user_id=p_user
  union all select 'connection',c.id::text,'함께 확인',(c.connected_at at time zone 'Asia/Seoul')::date,coalesce(c.revoked_at,c.connected_at),jsonb_build_object('peer_id',u.id,'peer_email',u.email,'peer_nickname',p.nickname,'connected_at',c.connected_at,'revoked_at',c.revoked_at) from public.partner_connections c join auth.users u on u.id=case when c.user_a=p_user then c.user_b else c.user_a end left join public.partner_profiles p on p.user_id=u.id where c.user_a=p_user or c.user_b=p_user
  union all select 'invite',p_user::text,'연결 초대',(i.created_at at time zone 'Asia/Seoul')::date,i.created_at,to_jsonb(i)-array['user_id','token_hash'] from public.partner_invites i where i.user_id=p_user
  union all select 'reading_settings',p_user::text,'독서 설정',null,null,to_jsonb(p)-'user_id' from public.reading_preferences p where p.user_id=p_user
  union all select 'day_settings',p.day::text,'하루 설정',p.day,null,to_jsonb(p)-'user_id' from public.planner_day_preferences p where p.user_id=p_user
  union all select 'occurrence',r.routine_id::text||'/'||r.day::text,'반복 일정',r.day,r.created_at,to_jsonb(r)-'user_id' from public.routine_occurrences r where r.user_id=p_user;
end;
$$;

create function public.admin_member(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform internal_admin.require_operator();
  select to_jsonb(m) into result from internal_admin.member_rows() m where m.id=p_user;
  if result is null then raise no_data_found; end if;
  perform internal_admin.audit('member',p_user);
  return result||jsonb_build_object('counts',coalesce((select jsonb_object_agg(s.kind,s.total) from(select kind,count(*) as total from internal_admin.record_rows(p_user) group by kind)s),'{}'::jsonb),
    'tracking_since',(select tracking_since from internal_admin.settings));
end;
$$;
create function public.admin_records(p_user uuid,p_section text default 'planning',p_from date default null,p_to date default null,p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform internal_admin.require_operator();
  if not exists(select 1 from auth.users where id=p_user) then raise no_data_found; end if;
  if p_section is null or p_section not in ('planning','reviews','library','focus','memos','resources','photos','partner','settings')
    or p_search is null or length(p_search)>120 or p_offset is null or p_offset<0 or p_offset>1000000
    or (p_from is not null and p_to is not null and p_from>p_to) then raise check_violation; end if;
  perform internal_admin.audit('records',p_user,p_section);
  with filtered as materialized(select * from internal_admin.record_rows(p_user) r where
    case p_section when 'planning' then r.kind in ('task','goal','routine','occurrence') when 'reviews' then r.kind in ('review','week_review')
      when 'library' then r.kind in ('work','note') when 'focus' then r.kind='focus' when 'memos' then r.kind in ('memo','revisit')
      when 'resources' then r.kind in ('resource','bookmark') when 'photos' then r.kind='photo' when 'partner' then r.kind in ('connection','invite')
      when 'settings' then r.kind in ('reading_settings','day_settings') else false end
    and (p_from is null or r.day>=p_from) and (p_to is null or r.day<=p_to)
    and (btrim(p_search)='' or position(lower(btrim(p_search)) in lower(r.title||' '||r.data::text))>0)),
  page as(select * from filtered order by day desc nulls last,at desc nulls last,kind,id limit 25 offset p_offset)
  select jsonb_build_object('total',(select count(*) from filtered),'offset',p_offset,'limit',25,
    'records',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;
create function public.admin_set_test_account(p_user uuid,p_is_test boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=internal_admin.require_operator();
begin
  if p_is_test is null then raise check_violation; end if;
  if not exists(select 1 from auth.users where id=p_user) then raise no_data_found; end if;
  insert into internal_admin.account_flags(user_id,is_test,updated_by) values(p_user,p_is_test,actor)
    on conflict(user_id) do update set is_test=excluded.is_test,updated_by=excluded.updated_by,updated_at=now();
  perform internal_admin.audit('classification',p_user,case when p_is_test then 'test' else 'member' end);
  return jsonb_build_object('id',p_user,'is_test',p_is_test);
end;
$$;
create function public.admin_photo(p_id uuid,p_log boolean default true) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
  perform internal_admin.require_operator();
  select user_id into owner_id from public.task_photos where id=p_id and state='ready';
  if owner_id is null then return false; end if;
  if p_log then perform internal_admin.audit('photo',owner_id,p_id::text); end if;
  return true;
end;
$$;
create function public.admin_audit(p_user uuid default null,p_offset integer default 0,p_before bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; cutoff bigint;
begin
  perform internal_admin.require_operator();
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_before<1 then raise check_violation; end if;
  perform internal_admin.audit('audit',p_user);
  select coalesce(p_before,max(id)) into cutoff from internal_admin.audit_events;
  with filtered as materialized(select a.id::text,a.action,a.section,a.created_at,u.email as actor_email,t.email as target_email
    from internal_admin.audit_events a left join auth.users u on u.id=a.actor_id left join auth.users t on t.id=a.target_id
    where a.id<=cutoff and (p_user is null or a.target_id=p_user)),page as(select * from filtered order by created_at desc,id::bigint desc limit 25 offset p_offset)
  select jsonb_build_object('total',(select count(*) from filtered),'offset',p_offset,'limit',25,
    'before_id',cutoff::text,'events',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on all functions in schema internal_admin from public,anon,authenticated;
revoke all on function public.admin_access(),public.admin_overview(),public.admin_members(text,text,text,integer),public.admin_member(uuid),
  public.admin_records(uuid,text,date,date,text,integer),public.admin_set_test_account(uuid,boolean),public.admin_photo(uuid,boolean),public.admin_audit(uuid,integer,bigint) from public,anon,authenticated;
grant execute on function public.admin_access(),public.admin_overview(),public.admin_members(text,text,text,integer),public.admin_member(uuid),
  public.admin_records(uuid,text,date,date,text,integer),public.admin_set_test_account(uuid,boolean),public.admin_photo(uuid,boolean),public.admin_audit(uuid,integer,bigint) to authenticated;
