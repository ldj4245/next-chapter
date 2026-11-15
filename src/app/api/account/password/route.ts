import { assertOrigin, failure, HttpError, json, readBody } from '@/lib/api';
import { parsePasswordChange } from '@/lib/account';
import { requireAccountSession, updateAccountPassword, verifyAccountPassword } from '@/lib/account-server';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireAccountSession();
    const { current_password, password } = parsePasswordChange(await readBody(request));
    const deletion = await client.from('account_deletion_requests').select('user_id').eq('user_id', user.id).maybeSingle();
    if (deletion.error) throw new Error(deletion.error.code ?? 'ACCOUNT_DELETION_READ_FAILED');
    if (deletion.data) throw new HttpError(409, '탈퇴 처리가 진행 중이에요. 내 계정에서 탈퇴를 마무리해주세요.');
    await verifyAccountPassword(user.id, user.email, current_password);
    await updateAccountPassword(client, password);
    return json({ changed: true });
  } catch (error) { return failure(error); }
}
