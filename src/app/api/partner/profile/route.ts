import { assertOrigin, failure, json, readBody, requireSession } from '@/lib/api';
import { object } from '@/lib/domain';
import { parseNickname } from '@/lib/partner';
import { partnerFailure } from '@/lib/partner-server';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), body = object(await readBody(request)), nickname = parseNickname(body.nickname);
    const result = await client.from('partner_profiles').upsert({ user_id: user.id, nickname }).select('nickname').single();
    partnerFailure(result.error);
    return json({ profile: result.data });
  } catch (error) { return failure(error); }
}
