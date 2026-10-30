-- One accepted partner, with an explicit per-task public projection. Existing
-- private tables retain their owner-only policies; no peer policy is added.
create table public.partner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (length(nickname) between 2 and 24 and nickname=btrim(nickname)
    and nickname !~ ('[' || chr(1) || '-' || chr(31) || chr(127) || '-' || chr(159) || '<>]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger partner_profiles_updated before update on public.partner_profiles
for each row execute function public.touch_updated_at();

create table public.partner_connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (user_a<user_b)
);
-- This primary key enforces one active pair per user even under concurrent
-- accepts. Only the RPCs can write membership and connections.
create table public.partner_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connection_id uuid not null references public.partner_connections(id) on delete cascade
);
create index partner_members_connection_idx on public.partner_members(connection_id);
create table public.partner_invites (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.partner_profiles enable row level security;
alter table public.partner_profiles force row level security;
alter table public.partner_connections enable row level security;
alter table public.partner_connections force row level security;
alter table public.partner_members enable row level security;
alter table public.partner_members force row level security;
alter table public.partner_invites enable row level security;
alter table public.partner_invites force row level security;
revoke all on public.partner_profiles,public.partner_connections,public.partner_members,public.partner_invites from anon,authenticated;
grant select,insert,update on public.partner_profiles to authenticated;
grant select on public.partner_connections,public.partner_members to authenticated;
grant select(user_id,expires_at,accepted_at,created_at) on public.partner_invites to authenticated;
create policy partner_profiles_owner on public.partner_profiles for all to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy partner_connections_participant on public.partner_connections for select to authenticated
using(user_a=(select auth.uid()) or user_b=(select auth.uid()));
create policy partner_members_owner on public.partner_members for select to authenticated
using(user_id=(select auth.uid()));
create policy partner_invites_owner on public.partner_invites for select to authenticated
using(user_id=(select auth.uid()));

alter table public.daily_tasks
  add column shared boolean not null default false,
  add column public_note text not null default '' check(length(public_note)<=1000),
  add column shared_connection_id uuid references public.partner_connections(id),
  -- Earlier completed rows intentionally remain null: updated_at is not proof
  -- of when an activity was completed.
  add column completed_at timestamptz,
  add constraint daily_tasks_shared_binding check(shared=(shared_connection_id is not null));
create index daily_tasks_shared_pair_idx on public.daily_tasks(user_id,shared_connection_id,day) where shared;

create function public.check_task_sharing() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_connection uuid;
begin
  if new.shared then
    select m.connection_id into current_connection from public.partner_members m
      join public.partner_connections c on c.id=m.connection_id
      where m.user_id=new.user_id and c.revoked_at is null for share of c;
    -- Hold the pair row until the task write commits. If revocation won first,
    -- READ COMMITTED rechecks revoked_at after the lock wait and rejects this
    -- write. If sharing won first, revocation's later task cleanup sees it.
    -- A task-row/connection-row deadlock aborts one entire request for retry;
    -- neither operation can commit an orphaned sharing selection.
    if current_connection is null then raise insufficient_privilege; end if;
    -- The API supplies the connection it checked immediately before this write.
    -- If the pair changed in between, reject rather than sharing with a new
    -- person. A direct owner write without a binding still derives its own pair.
    if new.shared_connection_id is not null and new.shared_connection_id is distinct from current_connection then raise insufficient_privilege; end if;
    if tg_op='UPDATE' and old.shared then
      -- Editing a stale task after a different connection cannot grant a new
      -- person access. The owner must explicitly select that task again.
      if old.shared_connection_id is distinct from current_connection then raise insufficient_privilege; end if;
      new.shared_connection_id:=old.shared_connection_id;
    else
      new.shared_connection_id:=current_connection;
    end if;
  else new.shared_connection_id:=null;
  end if;
  if tg_op='INSERT' then
    new.completed_at:=case when new.status='completed' then now() else null end;
  elsif new.status='completed' and old.status<>'completed' then new.completed_at:=now();
  elsif new.status='completed' then new.completed_at:=old.completed_at;
  else new.completed_at:=null;
  end if;
  return new;
end;
$$;
create trigger daily_tasks_sharing before insert or update on public.daily_tasks
for each row execute function public.check_task_sharing();

-- Deleting an account cascades its connection. The remaining person's private
-- tasks survive and must not retain an orphaned public selection.
create function public.clear_deleted_partner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.daily_tasks set shared=false,shared_connection_id=null where shared_connection_id=old.id;
  return old;
end;
$$;
create trigger partner_connections_deleted before delete on public.partner_connections
for each row execute function public.clear_deleted_partner();

create function public.partner_state() returns jsonb
language plpgsql security definer set search_path='' stable as $$
declare actor uuid:=auth.uid(); connection public.partner_connections; peer uuid; result jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  select c.* into connection from public.partner_members m join public.partner_connections c on c.id=m.connection_id
    where m.user_id=actor and c.revoked_at is null;
  peer:=case when connection.user_a=actor then connection.user_b else connection.user_a end;
  result:=jsonb_build_object(
    'profile',(select jsonb_build_object('nickname',p.nickname) from public.partner_profiles p where p.user_id=actor),
    'connection',case when connection.id is null then null else jsonb_build_object('id',connection.id,
      'nickname',(select p.nickname from public.partner_profiles p where p.user_id=peer),'connected_at',connection.connected_at) end,
    'invite',case when connection.id is not null then null else
      (select jsonb_build_object('expires_at',i.expires_at) from public.partner_invites i
       where i.user_id=actor and i.accepted_at is null and i.expires_at>now()) end);
  return result;
end;
$$;

create function public.create_partner_invite(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); expiry timestamptz:=now()+interval '7 days';
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise check_violation; end if;
  -- All connection mutations lock participant auth rows in UUID order. Cross
  -- invitations cannot deadlock or accept two partners simultaneously.
  perform 1 from auth.users where id=actor for update;
  if exists(select 1 from public.partner_members where user_id=actor) then raise unique_violation; end if;
  if not exists(select 1 from public.partner_profiles where user_id=actor) then raise check_violation; end if;
  insert into public.partner_invites(user_id,token_hash,expires_at,accepted_at,created_at)
    values(actor,p_hash,expiry,null,now()) on conflict(user_id) do update
    set token_hash=excluded.token_hash,expires_at=excluded.expires_at,accepted_at=null,created_at=excluded.created_at;
  return jsonb_build_object('expires_at',expiry);
end;
$$;

create function public.preview_partner_invite(p_hash text) returns jsonb
language plpgsql security definer set search_path='' stable as $$
declare invite public.partner_invites; nickname text;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise no_data_found; end if;
  select i.* into invite from public.partner_invites i where i.token_hash=p_hash and i.accepted_at is null and i.expires_at>now();
  if not found or exists(select 1 from public.partner_members where user_id=invite.user_id) then raise no_data_found; end if;
  select p.nickname into nickname from public.partner_profiles p where p.user_id=invite.user_id;
  return jsonb_build_object('nickname',nickname,'expires_at',invite.expires_at);
end;
$$;

create function public.accept_partner_invite(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); invite public.partner_invites; owner_id uuid; connection public.partner_connections;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise no_data_found; end if;
  select i.user_id into owner_id from public.partner_invites i where i.token_hash=p_hash;
  if not found then raise no_data_found; end if;
  if owner_id=actor then raise check_violation; end if;
  perform 1 from auth.users where id in(actor,owner_id) order by id for update;
  select i.* into invite from public.partner_invites i where i.token_hash=p_hash for update;
  if not found or invite.accepted_at is not null or invite.expires_at<=now() then raise no_data_found; end if;
  if exists(select 1 from public.partner_members where user_id in(actor,owner_id)) then raise unique_violation; end if;
  if not exists(select 1 from public.partner_profiles where user_id=actor) then raise check_violation; end if;
  insert into public.partner_connections(user_a,user_b) values(least(actor,owner_id),greatest(actor,owner_id)) returning * into connection;
  insert into public.partner_members(user_id,connection_id) values(actor,connection.id),(owner_id,connection.id);
  update public.partner_invites set accepted_at=now() where user_id in(actor,owner_id);
  return jsonb_build_object('id',connection.id,'nickname',(select p.nickname from public.partner_profiles p where p.user_id=owner_id),
    'connected_at',connection.connected_at);
end;
$$;

create function public.cancel_partner_invite() returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise insufficient_privilege; end if;
  perform 1 from auth.users where id=actor for update;
  update public.partner_invites set expires_at=least(expires_at,now()) where user_id=actor and accepted_at is null;
end;
$$;

create function public.revoke_partner(p_connection_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); connection public.partner_connections;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_connection_id is null then raise check_violation; end if;
  select c.* into connection from public.partner_members m join public.partner_connections c on c.id=m.connection_id where m.user_id=actor;
  if connection.id is null then return; end if;
  if connection.id<>p_connection_id then raise insufficient_privilege; end if;
  perform 1 from auth.users where id in(connection.user_a,connection.user_b) order by id for update;
  -- Another request may have revoked/replaced the pair while the lock waited.
  if not exists(select 1 from public.partner_members where user_id=actor) then return; end if;
  if not exists(select 1 from public.partner_members where user_id=actor and connection_id=p_connection_id) then raise insufficient_privilege; end if;
  update public.partner_connections set revoked_at=now() where id=connection.id and revoked_at is null;
  delete from public.partner_members where connection_id=connection.id;
  -- No old public selection follows a person into a future connection. Retain
  -- the private task and the owner's public wording for possible reuse.
  update public.daily_tasks set shared=false,shared_connection_id=null where shared_connection_id=connection.id;
end;
$$;

create function public.partner_day(p_day date) returns jsonb
language plpgsql security definer set search_path='' stable as $$
declare actor uuid:=auth.uid(); connection public.partner_connections; peer uuid; activities jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_day is null or p_day<date '1900-01-01' or p_day>date '2100-12-31' then raise check_violation; end if;
  select c.* into connection from public.partner_members m join public.partner_connections c on c.id=m.connection_id
    where m.user_id=actor and c.revoked_at is null;
  if connection.id is null then raise exception using errcode='P0001',message='No connected partner'; end if;
  peer:=case when connection.user_a=actor then connection.user_b else connection.user_a end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'day',t.day,'title',t.title,'status',t.status,'public_note',t.public_note,'completed_at',t.completed_at,
    'measured_seconds',s.measured_seconds,'pages',s.pages,'total_sessions',s.total_sessions)
    order by t.day,t.created_at,t.id),'[]'::jsonb) into activities
  from public.daily_tasks t
  left join lateral (select sum(r.elapsed_seconds)::bigint as measured_seconds,
    sum(case when r.is_reading and r.start_page is not null and r.end_page is not null then greatest(0,r.end_page-r.start_page) else null end)::bigint as pages,
    count(*)::integer as total_sessions
    from public.reading_sessions r where r.user_id=peer and r.task_id=t.id and r.status='completed' and r.reading_day=p_day) s on true
  where t.user_id=peer and t.shared and t.shared_connection_id=connection.id
    and (t.day=p_day or (t.completed_at at time zone 'Asia/Seoul')::date=p_day or s.total_sessions>0);
  return jsonb_build_object('day',p_day,'nickname',(select p.nickname from public.partner_profiles p where p.user_id=peer),
    'connection_id',connection.id,'activities',activities);
end;
$$;

revoke all on function public.check_task_sharing(),public.clear_deleted_partner(),public.partner_state(),public.create_partner_invite(text),public.preview_partner_invite(text),
  public.accept_partner_invite(text),public.cancel_partner_invite(),public.revoke_partner(uuid),public.partner_day(date) from public,anon,authenticated;
grant execute on function public.partner_state(),public.create_partner_invite(text),public.accept_partner_invite(text),
  public.cancel_partner_invite(),public.revoke_partner(uuid),public.partner_day(date) to authenticated;
grant execute on function public.preview_partner_invite(text) to anon,authenticated;
