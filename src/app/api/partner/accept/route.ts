import { assertOrigin, failure, json, readBody, requireSession } from '@/lib/api';
import { object } from '@/lib/domain';
import { parseInviteToken, parseNickname } from '@/lib/partner';
import { partnerFailure } from '@/lib/partner-server';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), body = object(await readBody(request)), token = parseInviteToken(body.token);
    if (body.nickname !== undefined) {
      const profile = await client.from('partner_profiles').upsert({ user_id: user.id, nickname: parseNickname(body.nickname) });
      partnerFailure(profile.error);
    }
    const result = await client.rpc('accept_partner_invite', { p_token: token });
    partnerFailure(result.error);
    return json({ connection: result.data }, 201);
  } catch (error) { return failure(error); }
}
