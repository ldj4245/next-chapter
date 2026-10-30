import { assertOrigin, readBody, failure, json, HttpError } from '@/lib/api';
import { configured, serverClient } from '@/lib/supabase/server';
import { object } from '@/lib/domain';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!configured()) throw new HttpError(503, '서재 연결을 준비하고 있어요. 잠시 후 다시 접속해주세요.');
    const body = object(await readBody(request));
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 320 || body.password.length > 1024) throw new HttpError(400, '이메일과 비밀번호를 확인해주세요.');
    const client = await serverClient();
    const { error } = await client.auth.signInWithPassword({ email: body.email.trim(), password: body.password });
    if (error) throw new HttpError(401, '이메일 또는 비밀번호가 맞지 않아요.');
    return json({ signedIn: true });
  } catch (error) { return failure(error); }
}
