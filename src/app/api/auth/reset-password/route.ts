import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { parseNewPassword } from '@/lib/auth-input';
import { InputError } from '@/lib/domain';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { client } = await requireSession();
    const { password } = parseNewPassword(await readBody(request));
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      if (error.code === 'weak_password') throw new InputError({ password: '추측하기 어려운 비밀번호로 다시 입력해주세요.' });
      if (error.code === 'same_password') throw new InputError({ password: '이전 비밀번호와 다른 비밀번호를 입력해주세요.' });
      if (error.status === 429) throw new HttpError(429, '요청이 많아요. 잠시 후 다시 저장해주세요.');
      throw new HttpError(502, '비밀번호를 변경하지 못했어요. 입력 내용은 유지되니 다시 저장해주세요.');
    }
    return json({ changed: true });
  } catch (error) { return failure(error); }
}
