-- A free-form reflection document; the four original answers remain intact.
create function public.valid_reflection_document(doc jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; ids text[] := '{}'; total integer := 0; block_id text;
begin
  if doc is null then return true; end if;
  if jsonb_typeof(doc) <> 'object' or doc->'version' is distinct from '1'::jsonb
     or jsonb_typeof(doc->'blocks') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'blocks') not between 1 and 200 then return false; end if;
  for item in select value from jsonb_array_elements(doc->'blocks') loop
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item->'id') is distinct from 'string'
       or (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(item->>'kind','') not in ('paragraph','heading1','heading2','bullet','numbered','check','quote')
       or jsonb_typeof(item->'text') is distinct from 'string'
       or jsonb_typeof(item->'checked') is distinct from 'boolean'
       or ((item->>'kind') <> 'check' and item->'checked' <> 'false'::jsonb) then return false; end if;
    block_id := lower(item->>'id');
    if block_id = any(ids) then return false; end if;
    ids := array_append(ids,block_id);
    total := total + length(item->>'text');
    if total > 24000 then return false; end if;
  end loop;
  return true;
end;
$$;
alter table public.daily_reviews add column document jsonb
  constraint daily_reviews_document_valid check (public.valid_reflection_document(document));
comment on column public.daily_reviews.document is 'Version 1 plain-text blocks; null uses legacy reflection fields. Existing ownership policies apply.';
