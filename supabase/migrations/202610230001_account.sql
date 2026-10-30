-- Self-service deletion starts with an owner-only marker. Photo reservations
-- and deletion preparation use the same per-owner transaction lock so no new
-- upload can start once cleanup has begun.
create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;
revoke all on public.account_deletion_requests from anon,authenticated;
grant select on public.account_deletion_requests to authenticated;
create policy account_deletion_owner on public.account_deletion_requests for select to authenticated
  using(user_id=(select auth.uid()));

-- A task can be deleted while its server upload is still transferring bytes.
-- Keep the upload lease independent of the task/photo FK cascade. Successful
-- finalization releases it; interrupted uploads age out after ten minutes,
-- well beyond the upload function's 60-second maximum execution time.
create table public.account_photo_uploads (
  photo_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index account_photo_uploads_owner_idx on public.account_photo_uploads(user_id,created_at);
alter table public.account_photo_uploads enable row level security;
alter table public.account_photo_uploads force row level security;
revoke all on public.account_photo_uploads from anon,authenticated;
insert into public.account_photo_uploads(photo_id,user_id,created_at)
  select id,user_id,created_at from public.task_photos where state='pending';

alter function public.reserve_task_photo(uuid,uuid) rename to reserve_task_photo_before_account;
revoke all on function public.reserve_task_photo_before_account(uuid,uuid) from public,anon,authenticated;
create function public.reserve_task_photo(p_task_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); photo jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-photo:'||actor::text,0));
  if exists(select 1 from public.account_deletion_requests where user_id=actor) then
    raise exception using errcode='P0001',message='ACCOUNT_DELETING';
  end if;
  photo:=public.reserve_task_photo_before_account(p_task_id,p_id);
  if photo->>'state'='pending' then
    insert into public.account_photo_uploads(photo_id,user_id) values(p_id,actor)
      on conflict(photo_id) do nothing;
  end if;
  return photo;
end;
$$;

alter function public.finalize_task_photo(uuid,integer,integer,integer,integer) rename to finalize_task_photo_before_account;
revoke all on function public.finalize_task_photo_before_account(uuid,integer,integer,integer,integer) from public,anon,authenticated;
create function public.finalize_task_photo(p_id uuid,p_width integer,p_height integer,p_bytes integer,p_thumbnail_bytes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); photo jsonb;
begin
  if actor is null then raise insufficient_privilege; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-photo:'||actor::text,0));
  if exists(select 1 from public.account_deletion_requests where user_id=actor) then
    raise exception using errcode='P0001',message='ACCOUNT_DELETING';
  end if;
  photo:=public.finalize_task_photo_before_account(p_id,p_width,p_height,p_bytes,p_thumbnail_bytes);
  delete from public.account_photo_uploads where photo_id=p_id and user_id=actor;
  return photo;
end;
$$;

create function public.prepare_own_account_deletion() returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); connection_id uuid;
begin
  if actor is null then raise insufficient_privilege; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-photo:'||actor::text,0));
  if not exists(select 1 from auth.users where id=actor) then raise insufficient_privilege; end if;
  -- A crashed request may leave a reservation. Deleting it queues its derived
  -- paths, which are included in the inventory even if no bytes ever arrived.
  delete from public.account_photo_uploads where user_id=actor and created_at<now()-interval '10 minutes';
  delete from public.task_photos where user_id=actor and state='pending' and created_at<now()-interval '10 minutes';
  if exists(select 1 from public.account_photo_uploads where user_id=actor)
    or exists(select 1 from public.task_photos where user_id=actor and state='pending') then
    raise exception using errcode='P0001',message='ACCOUNT_PHOTO_BUSY';
  end if;
  insert into public.account_deletion_requests(user_id) values(actor) on conflict(user_id) do nothing;
  select m.connection_id into connection_id from public.partner_members m where m.user_id=actor;
  if connection_id is not null then perform public.revoke_partner(connection_id); end if;
  return true;
end;
$$;

-- One JSON value avoids a REST row limit silently truncating the cleanup list.
-- Inventory paths never reach a browser response; the API also checks every
-- exact owner prefix before calling privileged Storage removal.
create function public.own_account_photo_paths() returns jsonb
language plpgsql security definer set search_path='' stable as $$
declare actor uuid:=auth.uid(); paths jsonb;
begin
  if actor is null or not exists(select 1 from public.account_deletion_requests where user_id=actor) then raise insufficient_privilege; end if;
  select coalesce(jsonb_agg(p.path order by p.path),'[]'::jsonb) into paths from (
    select o.name as path from storage.objects o where o.bucket_id='task-photos' and split_part(o.name,'/',1)=actor::text
    union select d.path from public.task_photo_deletions d where d.user_id=actor
    union select p.original_path from public.task_photos p where p.user_id=actor
    union select p.thumbnail_path from public.task_photos p where p.user_id=actor
  ) p;
  return paths;
end;
$$;
-- Storage is not exposed through public REST schemas. Return only a boolean
-- under the caller's deletion marker rather than exposing private metadata.
create function public.own_account_has_photo_objects() returns boolean
language plpgsql security definer set search_path='' stable as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not exists(select 1 from public.account_deletion_requests where user_id=actor) then raise insufficient_privilege; end if;
  return exists(select 1 from storage.objects o where o.bucket_id='task-photos' and split_part(o.name,'/',1)=actor::text);
end;
$$;
revoke all on function public.reserve_task_photo(uuid,uuid),public.finalize_task_photo(uuid,integer,integer,integer,integer),
  public.prepare_own_account_deletion(),public.own_account_photo_paths(),public.own_account_has_photo_objects() from public,anon,authenticated;
grant execute on function public.reserve_task_photo(uuid,uuid),public.finalize_task_photo(uuid,integer,integer,integer,integer),
  public.prepare_own_account_deletion(),public.own_account_photo_paths(),public.own_account_has_photo_objects() to authenticated;
