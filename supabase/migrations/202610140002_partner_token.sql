-- Verification must require the original bearer token even when invoked
-- directly through PostgREST. A stored hash is not itself a redeemable token.
drop function public.preview_partner_invite(text);
drop function public.accept_partner_invite(text);

create function public.preview_partner_invite(p_token text) returns jsonb
language plpgsql security definer set search_path='' stable as $$
declare invite public.partner_invites; nickname text; computed_hash text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise no_data_found; end if;
  computed_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select i.* into invite from public.partner_invites i where i.token_hash=computed_hash and i.accepted_at is null and i.expires_at>now();
  if not found or exists(select 1 from public.partner_members where user_id=invite.user_id) then raise no_data_found; end if;
  select p.nickname into nickname from public.partner_profiles p where p.user_id=invite.user_id;
  return jsonb_build_object('nickname',nickname,'expires_at',invite.expires_at);
end;
$$;

create function public.accept_partner_invite(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); invite public.partner_invites; owner_id uuid; connection public.partner_connections; computed_hash text;
begin
  if actor is null then raise insufficient_privilege; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise no_data_found; end if;
  computed_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select i.user_id into owner_id from public.partner_invites i where i.token_hash=computed_hash;
  if not found then raise no_data_found; end if;
  if owner_id=actor then raise check_violation; end if;
  perform 1 from auth.users where id in(actor,owner_id) order by id for update;
  select i.* into invite from public.partner_invites i where i.token_hash=computed_hash for update;
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

revoke all on function public.preview_partner_invite(text),public.accept_partner_invite(text) from public,anon,authenticated;
grant execute on function public.preview_partner_invite(text) to anon,authenticated;
grant execute on function public.accept_partner_invite(text) to authenticated;
