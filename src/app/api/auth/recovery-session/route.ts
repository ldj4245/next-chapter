import { assertOrigin, failure, HttpError, json, readBody } from '@/lib/api';
import { parseRecoverySession } from '@/lib/auth-input';
import { configured, serverClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!configured()) throw new HttpError(503, '잠시 후 다시 시도해주세요.');
    const session = parseRecoverySession(await readBody(request));
    const client = await serverClient();
    const { data, error } = await client.auth.setSession(session);
    if (error || !data.session) throw new HttpError(400, '재설정 링크가 만료됐어요. 새 링크를 받아주세요.');
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user) throw new HttpError(400, '재설정 링크를 확인하지 못했어요. 새 링크를 받아주세요.');
    return json({ verified: true });
  } catch (error) { return failure(error); }
}
