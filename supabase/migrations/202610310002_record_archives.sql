create table public.record_archives (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  sections text[] not null check (cardinality(sections) between 1 and 4 and sections <@ array['days','library','notes','learning']::text[]),
  counts jsonb not null check (jsonb_typeof(counts)='object'),
  envelope jsonb not null check (jsonb_typeof(envelope)='object' and octet_length(envelope::text)<=102000),
  byte_length integer not null check (byte_length between 1 and 100000),
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  data_id text not null unique check (data_id ~ '^[A-Za-z0-9_-]{43}$'),
  signed_item text not null check (length(signed_item) between 100 and 150000),
  state text not null default 'prepared' check (state in ('prepared','submitted','confirmed')),
  receipt jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  lease_until timestamptz,
  attempts integer not null default 0,
  check ((state='prepared' and confirmed_at is null) or submitted_at is not null),
  check (state<>'confirmed' or confirmed_at is not null)
);
create index record_archives_owner_created on public.record_archives(user_id,created_at desc);
alter table public.record_archives enable row level security;
revoke all on public.record_archives from public,anon,authenticated;
grant select(id,user_id,period_start,period_end,sections,counts,byte_length,digest,data_id,state,created_at,submitted_at,confirmed_at,envelope,receipt) on public.record_archives to authenticated;
grant all on public.record_archives to service_role;
create policy record_archives_owner on public.record_archives for select to authenticated using (user_id=auth.uid());

-- Only the authenticated server may reserve signed bytes or advance network
-- state. Public clients can neither invent receipts nor exhaust another owner.
create function public.reserve_record_archive(p_user uuid,p_id uuid,p_from date,p_to date,p_sections text[],p_counts jsonb,p_envelope jsonb,p_bytes integer,p_digest text,p_data_id text,p_signed text)
returns public.record_archives language plpgsql security definer set search_path='' as $$
declare existing public.record_archives;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,681));
  if not exists(select 1 from auth.users where id=p_user) or exists(select 1 from public.account_deletion_requests where user_id=p_user) then raise exception 'ARCHIVE_ACCOUNT_UNAVAILABLE'; end if;
  select * into existing from public.record_archives where id=p_id;
  if found then
    if existing.user_id<>p_user or existing.digest<>p_digest or existing.period_start<>p_from or existing.period_end<>p_to or existing.sections<>p_sections or existing.counts<>p_counts then raise exception 'ARCHIVE_CONFLICT'; end if;
    return existing;
  end if;
  if (select count(*) from public.record_archives where user_id=p_user and created_at>now()-interval '24 hours')>=3 then raise exception 'ARCHIVE_DAILY_LIMIT'; end if;
  insert into public.record_archives(id,user_id,period_start,period_end,sections,counts,envelope,byte_length,digest,data_id,signed_item)
    values(p_id,p_user,p_from,p_to,p_sections,p_counts,p_envelope,p_bytes,p_digest,p_data_id,p_signed) returning * into existing;
  return existing;
end;
$$;
create function public.claim_record_archive(p_user uuid,p_id uuid) returns public.record_archives
language plpgsql security definer set search_path='' as $$
declare existing public.record_archives;
begin
  select * into existing from public.record_archives where id=p_id and user_id=p_user for update;
  if not found then raise exception 'ARCHIVE_NOT_FOUND'; end if;
  if exists(select 1 from public.account_deletion_requests where user_id=p_user) then raise exception 'ARCHIVE_ACCOUNT_UNAVAILABLE'; end if;
  if existing.state<>'prepared' then return existing; end if;
  if existing.lease_until>now() then raise exception 'ARCHIVE_BUSY'; end if;
  if existing.attempts>=10 then raise exception 'ARCHIVE_ATTEMPT_LIMIT'; end if;
  update public.record_archives set lease_until=now()+interval '90 seconds',attempts=attempts+1 where id=p_id returning * into existing;
  return existing;
end;
$$;
revoke all on function public.reserve_record_archive(uuid,uuid,date,date,text[],jsonb,jsonb,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.claim_record_archive(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_record_archive(uuid,uuid,date,date,text[],jsonb,jsonb,integer,text,text,text) to service_role;
grant execute on function public.claim_record_archive(uuid,uuid) to service_role;
