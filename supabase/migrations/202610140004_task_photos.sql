-- Image bytes live in a private bucket. Pending reservations make the three
-- photo limit atomic, and are never visible to the connected partner.
alter table public.daily_tasks
  add column photos_shared boolean not null default false,
  add column photo_connection_id uuid references public.partner_connections(id),
  add constraint daily_tasks_photo_binding check(photos_shared=(photo_connection_id is not null)),
  add constraint daily_tasks_photo_task_shared check(not photos_shared or (shared and photo_connection_id=shared_connection_id));

create table public.task_photos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  original_path text not null unique,
  thumbnail_path text not null unique,
  width integer,
  height integer,
  bytes integer,
  thumbnail_bytes integer,
  mime_type text not null default 'image/webp' check(mime_type='image/webp'),
  state text not null default 'pending' check(state in('pending','ready')),
  created_at timestamptz not null default now(),
  foreign key(task_id,user_id) references public.daily_tasks(id,user_id) on delete cascade,
  check(original_path=user_id::text||'/'||task_id::text||'/'||id::text||'/image.webp'),
  check(thumbnail_path=user_id::text||'/'||task_id::text||'/'||id::text||'/thumb.webp'),
  check(state='pending' or (width is not null and height is not null and bytes is not null and thumbnail_bytes is not null
    and width between 1 and 1600 and height between 1 and 1600
    and bytes between 1 and 1000000 and thumbnail_bytes between 1 and 100000))
);
create index task_photos_task_idx on public.task_photos(user_id,task_id,created_at,id);
alter table public.task_photos enable row level security;
alter table public.task_photos force row level security;
revoke all on public.task_photos from anon,authenticated;
grant select,delete on public.task_photos to authenticated;
create policy task_photos_owner on public.task_photos for all to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Durable deletion outbox: the task/photo metadata is removed first, so a
-- storage outage cannot destroy a photo attached to an undeleted task. Cleanup
-- retries on later owner requests without making orphan objects readable.
create table public.task_photo_deletions (
  path text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  check(split_part(path,'/',1)=user_id::text)
);
alter table public.task_photo_deletions enable row level security;
alter table public.task_photo_deletions force row level security;
revoke all on public.task_photo_deletions from anon,authenticated;
grant select,delete on public.task_photo_deletions to authenticated;
create policy task_photo_deletions_owner on public.task_photo_deletions for all to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function public.queue_deleted_task_photo() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.task_photo_deletions(path,user_id) values(old.original_path,old.user_id),(old.thumbnail_path,old.user_id)
    on conflict(path) do nothing;
  return old;
end;
$$;
create trigger task_photo_deleted after delete on public.task_photos
  for each row execute function public.queue_deleted_task_photo();
revoke all on function public.queue_deleted_task_photo() from public,anon,authenticated;

create or replace function public.check_task_sharing() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_connection uuid;
begin
  if new.shared then
    select m.connection_id into current_connection from public.partner_members m
      join public.partner_connections c on c.id=m.connection_id
      where m.user_id=new.user_id and c.revoked_at is null for share of c;
    if current_connection is null then raise insufficient_privilege; end if;
    if new.shared_connection_id is not null and new.shared_connection_id is distinct from current_connection then raise insufficient_privilege; end if;
    if tg_op='UPDATE' and old.shared then
      if old.shared_connection_id is distinct from current_connection then raise insufficient_privilege; end if;
      new.shared_connection_id:=old.shared_connection_id;
    else new.shared_connection_id:=current_connection;
    end if;
  else
    new.shared_connection_id:=null;
    new.photos_shared:=false;
    new.photo_connection_id:=null;
  end if;
  if new.photos_shared then
    if not new.shared or current_connection is null then raise insufficient_privilege; end if;
    if new.photo_connection_id is not null and new.photo_connection_id is distinct from current_connection then raise insufficient_privilege; end if;
    if tg_op='UPDATE' and old.photos_shared then
      if old.photo_connection_id is distinct from current_connection then raise insufficient_privilege; end if;
      new.photo_connection_id:=old.photo_connection_id;
    else new.photo_connection_id:=current_connection;
    end if;
  else new.photo_connection_id:=null;
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

create function public.reserve_task_photo(p_task_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); photo public.task_photos; prefix text;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_id is null or p_task_id is null then raise check_violation; end if;
  perform 1 from public.daily_tasks where id=p_task_id and user_id=actor for update;
  if not found then raise no_data_found; end if;
  select * into photo from public.task_photos where id=p_id;
  if found then
    if photo.user_id<>actor or photo.task_id<>p_task_id then raise no_data_found; end if;
    if photo.state='pending' then raise exception using errcode='P0001',message='PHOTO_BUSY'; end if;
    return to_jsonb(photo);
  end if;
  if (select count(*) from public.task_photos where task_id=p_task_id and user_id=actor)>=3 then
    raise exception using errcode='P0001',message='PHOTO_LIMIT';
  end if;
  prefix:=actor::text||'/'||p_task_id::text||'/'||p_id::text;
  insert into public.task_photos(id,user_id,task_id,original_path,thumbnail_path)
    values(p_id,actor,p_task_id,prefix||'/image.webp',prefix||'/thumb.webp') returning * into photo;
  return to_jsonb(photo);
end;
$$;

create function public.finalize_task_photo(p_id uuid,p_width integer,p_height integer,p_bytes integer,p_thumbnail_bytes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); photo public.task_photos;
begin
  if actor is null then raise insufficient_privilege; end if;
  select * into photo from public.task_photos where id=p_id and user_id=actor for update;
  if not found then raise no_data_found; end if;
  if photo.state='ready' then return to_jsonb(photo); end if;
  if p_width is null or p_height is null or p_bytes is null or p_thumbnail_bytes is null
    or p_width not between 1 and 1600 or p_height not between 1 and 1600
    or p_bytes not between 1 and 1000000 or p_thumbnail_bytes not between 1 and 100000 then raise check_violation; end if;
  -- The database verifies that both private storage objects have arrived before
  -- publishing the metadata. Paths are derived by the reservation, not callers.
  if not exists(select 1 from storage.objects where bucket_id='task-photos' and name=photo.original_path
    and (metadata->>'size')::bigint=p_bytes and metadata->>'mimetype'='image/webp')
    or not exists(select 1 from storage.objects where bucket_id='task-photos' and name=photo.thumbnail_path
    and (metadata->>'size')::bigint=p_thumbnail_bytes and metadata->>'mimetype'='image/webp') then raise check_violation; end if;
  update public.task_photos set width=p_width,height=p_height,bytes=p_bytes,thumbnail_bytes=p_thumbnail_bytes,state='ready'
    where id=p_id returning * into photo;
  -- Every newly finished upload starts private, even if the owner previously
  -- shared older photos on this task. Replaying an already-ready ID returns
  -- above without clearing an owner's later explicit sharing selection.
  update public.daily_tasks set photos_shared=false,photo_connection_id=null
    where id=photo.task_id and user_id=actor and photos_shared;
  return to_jsonb(photo);
end;
$$;

create function public.can_read_task_photo_path(p_path text) returns boolean
language sql security definer set search_path='' stable as $$
  select auth.uid() is not null and exists(
    select 1 from public.task_photos p join public.daily_tasks t on t.id=p.task_id and t.user_id=p.user_id
    where (p.original_path=p_path or p.thumbnail_path=p_path) and (
      p.user_id=auth.uid() or (p.state='ready' and t.shared and t.photos_shared
      and t.photo_connection_id=t.shared_connection_id and exists(
        select 1 from public.partner_members m join public.partner_connections c on c.id=m.connection_id
        where m.user_id=auth.uid() and m.connection_id=t.photo_connection_id and c.revoked_at is null
          and (c.user_a=t.user_id or c.user_b=t.user_id)))))
$$;
create function public.can_read_task_photo(p_id uuid) returns boolean
language sql security definer set search_path='' stable as $$
  select auth.uid() is not null and exists(select 1 from public.task_photos p
    where p.id=p_id and p.state='ready' and public.can_read_task_photo_path(p.original_path))
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('task-photos','task-photos',false,1000000,array['image/webp']);
create policy task_photo_storage_read on storage.objects for select to authenticated
  -- A partner must use the authenticated binary proxy. Granting Storage SELECT
  -- would also let them mint bearer signed URLs that outlive pair revocation.
  using(bucket_id='task-photos' and exists(select 1 from public.task_photos p
    where p.user_id=(select auth.uid()) and (p.original_path=name or p.thumbnail_path=name)));
-- The server alone uploads Sharp-normalized bytes. Browser upload permission
-- would let a caller bypass EXIF removal with a directly minted reservation.
-- Restrictive guards also protect this bucket from any unrelated broad policy.
create policy task_photo_storage_insert_guard on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'task-photos');
create policy task_photo_storage_update_guard on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'task-photos') with check(bucket_id<>'task-photos');
create policy task_photo_storage_read_guard on storage.objects as restrictive for select to authenticated
  using(bucket_id<>'task-photos' or exists(select 1 from public.task_photos p
    where p.user_id=(select auth.uid()) and (p.original_path=name or p.thumbnail_path=name)));
-- Deletion remains possible after task deletion so compensating cleanup can
-- remove storage objects whose metadata was cascaded away in the meantime.
create policy task_photo_storage_delete on storage.objects for delete to authenticated
  using(bucket_id='task-photos' and split_part(name,'/',1)=(select auth.uid())::text);
create policy task_photo_storage_delete_guard on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'task-photos' or split_part(name,'/',1)=(select auth.uid())::text);

create or replace function public.partner_day(p_day date) returns jsonb
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
    'measured_seconds',s.measured_seconds,'pages',s.pages,'total_sessions',s.total_sessions,
    'photos',case when t.photos_shared and t.photo_connection_id=connection.id then
      (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'task_id',p.task_id,'width',p.width,'height',p.height,
        'bytes',p.bytes,'created_at',p.created_at,'url','/api/photos/'||p.id::text||'/image?size=full',
        'thumbnail_url','/api/photos/'||p.id::text||'/image?size=thumb') order by p.created_at,p.id),'[]'::jsonb)
       from public.task_photos p where p.task_id=t.id and p.user_id=t.user_id and p.state='ready') else '[]'::jsonb end)
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
revoke all on function public.reserve_task_photo(uuid,uuid),public.finalize_task_photo(uuid,integer,integer,integer,integer),
  public.can_read_task_photo_path(text),public.can_read_task_photo(uuid) from public,anon,authenticated;
grant execute on function public.reserve_task_photo(uuid,uuid),public.finalize_task_photo(uuid,integer,integer,integer,integer),
  public.can_read_task_photo_path(text),public.can_read_task_photo(uuid) to authenticated;
