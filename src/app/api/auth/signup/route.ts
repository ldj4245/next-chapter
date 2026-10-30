import { assertOrigin, readBody, failure, json, HttpError } from '@/lib/api';
import { configured, currentUser, serverClient } from '@/lib/supabase/server';
import { parseSignup } from '@/lib/auth-input';
import { InputError } from '@/lib/domain';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!configured()) throw new HttpError(503, '서재 연결을 준비하고 있어요. 잠시 후 다시 접속해주세요.');
    const credentials = parseSignup(await readBody(request));
    if (await currentUser()) throw new HttpError(409, '이미 로그인되어 있어요. 새 계정을 만들려면 먼저 로그아웃해주세요.');
    const client = await serverClient();
    const { data, error } = await client.auth.signUp(credentials);
    if (error) {
      if (error.status === 429) throw new HttpError(429, '가입 요청이 많아요. 잠시 후 다시 시도해주세요.');
      if (['user_already_exists', 'email_exists'].includes(error.code ?? '')) {
        throw new HttpError(409, '이미 가입된 이메일이에요. 로그인해주세요.');
      }
      if (error.code === 'weak_password') throw new InputError({ password: '추측하기 어려운 비밀번호로 다시 입력해주세요.' });
      if (error.code === 'email_address_invalid') throw new InputError({ email: '올바른 이메일 주소를 입력해주세요.' });
      if (error.code === 'signup_disabled') throw new HttpError(503, '회원가입을 준비하고 있어요. 잠시 후 다시 접속해주세요.');
      throw new HttpError(502, '회원가입을 완료하지 못했어요. 입력 내용을 확인하고 다시 시도해주세요.');
    }
    if (!data.user) throw new HttpError(502, '회원가입을 완료하지 못했어요. 다시 시도해주세요.');
    return json({ signedIn: Boolean(data.session), confirmationRequired: !data.session }, 201);
  } catch (error) { return failure(error); }
}
