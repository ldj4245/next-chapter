import { assertOrigin, failure, HttpError, json, readBody } from '@/lib/api';
import { parsePasswordChange } from '@/lib/account';
import { requireAccountSession, verifyAccountPassword } from '@/lib/account-server';
import { InputError } from '@/lib/domain';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireAccountSession();
    const { current_password, password } = parsePasswordChange(await readBody(request));
    const deletion = await client.from('account_deletion_requests').select('user_id').eq('user_id', user.id).maybeSingle();
    if (deletion.error) throw new Error(deletion.error.code ?? 'ACCOUNT_DELETION_READ_FAILED');
    if (deletion.data) throw new HttpError(409, '탈퇴 처리가 진행 중이에요. 내 계정에서 탈퇴를 마무리해주세요.');
    await verifyAccountPassword(user.id, user.email, current_password);
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      if (error.code === 'weak_password') throw new InputError({ password: '추측하기 어려운 비밀번호로 다시 입력해주세요.' });
      if (error.code === 'same_password') throw new InputError({ password: '이전 비밀번호와 다른 비밀번호를 입력해주세요.' });
      if (error.status === 429) throw new HttpError(429, '요청이 많아요. 잠시 후 다시 저장해주세요.');
      if (error.status === 401 || error.status === 403) throw new HttpError(401, '다시 로그인한 뒤 비밀번호를 변경해주세요.');
      throw new HttpError(502, '비밀번호를 변경하지 못했어요. 입력 내용은 유지되니 다시 저장해주세요.');
    }
    return json({ changed: true });
  } catch (error) { return failure(error); }
}
