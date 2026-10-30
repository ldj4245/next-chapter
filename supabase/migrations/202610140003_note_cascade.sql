-- Auth-account deletion cascades notes under supabase_auth_admin, which has no
-- permission to update public.works. Keep the existing exact note/work owner
-- predicate, but run this trigger with its migration owner's permissions.
-- It is a trigger-only function and cannot be called as an ordinary RPC.
alter function public.touch_note_work() security definer;
revoke all on function public.touch_note_work() from public,anon,authenticated;
