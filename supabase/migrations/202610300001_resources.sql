-- Owner-only external learning links. No article bodies, images or credentials.
create function public.valid_resource_tags(p_tags text[]) returns boolean
language sql immutable security invoker set search_path='' as $$
  select p_tags is not null and cardinality(p_tags)<=12 and not exists(select 1 from unnest(p_tags) t where t is null or length(t)<1 or length(t)>30);
$$;
create table public.learning_resources (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null check(length(url)<=2048 and url ~ '^https?://[^[:space:]]+$'),
  title text not null check(length(title)<=200 and length(btrim(title))>0),
  kind text not null check(kind in ('article','video','other')),
  status text not null default 'saved' check(status in ('saved','active','completed')),
  tags text[] not null default '{}' check(public.valid_resource_tags(tags)),
  memo text not null default '' check(length(memo)<=10000),
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,id),unique(user_id,url)
);
create index learning_resources_owner_updated_idx on public.learning_resources(user_id,updated_at desc,id);
create table public.resource_bookmarks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null,
  seconds integer not null check(seconds between 0 and 359999),
  label text not null check(length(label)<=160 and length(btrim(label))>0),
  created_at timestamptz not null default now(),
  foreign key(user_id,resource_id) references public.learning_resources(user_id,id) on delete cascade
);
create index resource_bookmarks_owner_resource_idx on public.resource_bookmarks(user_id,resource_id,seconds,id);
alter table public.learning_resources enable row level security;
alter table public.learning_resources force row level security;
alter table public.resource_bookmarks enable row level security;
alter table public.resource_bookmarks force row level security;
revoke all on public.learning_resources,public.resource_bookmarks from anon,authenticated;
grant select,delete on public.learning_resources,public.resource_bookmarks to authenticated;
create policy learning_resources_owner_read on public.learning_resources for select to authenticated using(user_id=(select auth.uid()));
create policy learning_resources_owner_delete on public.learning_resources for delete to authenticated using(user_id=(select auth.uid()));
create policy resource_bookmarks_owner_read on public.resource_bookmarks for select to authenticated using(user_id=(select auth.uid()));
create policy resource_bookmarks_owner_delete on public.resource_bookmarks for delete to authenticated using(user_id=(select auth.uid()));

create function public.create_learning_resource(p_id uuid,p_url text,p_title text,p_kind text,p_status text,p_tags text[],p_memo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.learning_resources;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_id is null or p_url is null then raise check_violation; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resource:'||actor::text||':'||p_url,0));
  select * into item from public.learning_resources where id=p_id and user_id=actor;
  if found then
    if row(item.url,item.title,item.kind,item.status,item.tags,item.memo) is distinct from row(p_url,p_title,p_kind,p_status,p_tags,p_memo) then raise exception using errcode='P0001',message='RESOURCE_ID_CONFLICT'; end if;
    return jsonb_build_object('resource',to_jsonb(item)-'user_id','duplicate',false);
  end if;
  select * into item from public.learning_resources where user_id=actor and url=p_url;
  if found then return jsonb_build_object('resource',to_jsonb(item)-'user_id','duplicate',true); end if;
  insert into public.learning_resources(id,user_id,url,title,kind,status,tags,memo) values(p_id,actor,p_url,p_title,p_kind,p_status,p_tags,p_memo)
    on conflict(id) do nothing returning * into item;
  if item.id is null then raise no_data_found; end if;
  return jsonb_build_object('resource',to_jsonb(item)-'user_id','duplicate',false);
end;
$$;
create function public.update_learning_resource(p_id uuid,p_revision bigint,p_url text,p_title text,p_kind text,p_status text,p_tags text[],p_memo text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.learning_resources;
begin
  if actor is null then raise insufficient_privilege; end if;
  select * into item from public.learning_resources where id=p_id and user_id=actor for update;
  if not found then raise no_data_found; end if;
  if row(item.url,item.title,item.kind,item.status,item.tags,item.memo) is not distinct from row(p_url,p_title,p_kind,p_status,p_tags,p_memo) then return to_jsonb(item)-'user_id'; end if;
  if p_revision is distinct from item.revision then raise exception using errcode='P0001',message='RESOURCE_REVISION_CONFLICT'; end if;
  if (p_url is distinct from item.url or p_kind<>'video') and exists(select 1 from public.resource_bookmarks where user_id=actor and resource_id=p_id) then raise exception using errcode='P0001',message='RESOURCE_HAS_BOOKMARKS'; end if;
  update public.learning_resources set url=p_url,title=p_title,kind=p_kind,status=p_status,tags=p_tags,memo=p_memo,revision=revision+1,updated_at=now()
    where id=p_id and user_id=actor returning * into item;
  return to_jsonb(item)-'user_id';
end;
$$;
create function public.delete_learning_resource(p_id uuid,p_revision bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.learning_resources;
begin
  if actor is null then raise insufficient_privilege; end if;
  select * into item from public.learning_resources where id=p_id and user_id=actor for update;
  if not found then raise no_data_found; end if;
  if p_revision is distinct from item.revision then raise exception using errcode='P0001',message='RESOURCE_REVISION_CONFLICT'; end if;
  delete from public.learning_resources where id=p_id and user_id=actor;
  return true;
end;
$$;
create function public.create_resource_bookmark(p_id uuid,p_resource_id uuid,p_seconds integer,p_label text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.learning_resources; mark public.resource_bookmarks;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_id is null then raise check_violation; end if;
  select * into item from public.learning_resources where id=p_resource_id and user_id=actor for share;
  if not found then raise no_data_found; end if;
  if item.kind<>'video' then raise check_violation; end if;
  insert into public.resource_bookmarks(id,user_id,resource_id,seconds,label) values(p_id,actor,p_resource_id,p_seconds,p_label)
    on conflict(id) do nothing;
  select * into mark from public.resource_bookmarks where id=p_id and user_id=actor;
  if not found then raise no_data_found; end if;
  if row(mark.resource_id,mark.seconds,mark.label) is distinct from row(p_resource_id,p_seconds,p_label) then raise exception using errcode='P0001',message='BOOKMARK_ID_CONFLICT'; end if;
  return to_jsonb(mark)-'user_id';
end;
$$;
revoke all on function public.valid_resource_tags(text[]),public.create_learning_resource(uuid,text,text,text,text,text[],text),
  public.update_learning_resource(uuid,bigint,text,text,text,text,text[],text),public.delete_learning_resource(uuid,bigint),
  public.create_resource_bookmark(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.valid_resource_tags(text[]),public.create_learning_resource(uuid,text,text,text,text,text[],text),
  public.update_learning_resource(uuid,bigint,text,text,text,text,text[],text),public.delete_learning_resource(uuid,bigint),
  public.create_resource_bookmark(uuid,uuid,integer,text) to authenticated;
