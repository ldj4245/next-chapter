import { failure, json } from '@/lib/api';
import type { AccountData } from '@/lib/account';
import { requireAccountSession } from '@/lib/account-server';

export async function GET() {
  try {
    const { user, client } = await requireAccountSession();
    const [profile, deletion] = await Promise.all([
      client.from('partner_profiles').select('nickname').eq('user_id', user.id).maybeSingle(),
      client.from('account_deletion_requests').select('user_id').eq('user_id', user.id).maybeSingle(),
    ]);
    if (profile.error) throw new Error(profile.error.code ?? 'ACCOUNT_PROFILE_READ_FAILED');
    if (deletion.error) throw new Error(deletion.error.code ?? 'ACCOUNT_DELETION_READ_FAILED');
    const account: AccountData = { email: user.email, nickname: profile.data?.nickname ?? '', deletion_pending: Boolean(deletion.data) };
    return json(account);
  } catch (error) { return failure(error); }
}
