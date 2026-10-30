import { assertOrigin, failure, HttpError, json, readBody } from '@/lib/api';
import { parseRecoveryToken } from '@/lib/auth-input';
import { object } from '@/lib/domain';
import { configured, serverClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!configured()) throw new HttpError(503, '잠시 후 다시 시도해주세요.');
    const token_hash = parseRecoveryToken(object(await readBody(request)).token_hash);
    const client = await serverClient();
    const { data, error } = await client.auth.verifyOtp({ token_hash, type: 'recovery' });
    if (error || !data.session || !data.user) throw new HttpError(400, '재설정 링크가 만료됐거나 이미 사용됐어요. 새 링크를 받아주세요.');
    return json({ verified: true });
  } catch (error) { return failure(error); }
}
