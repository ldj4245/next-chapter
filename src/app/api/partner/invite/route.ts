import { randomBytes } from 'node:crypto';
import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { object } from '@/lib/domain';
import { parseInviteToken, parseNickname } from '@/lib/partner';
import { inviteHash, partnerFailure } from '@/lib/partner-server';
import { configured, serverClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    if (!configured()) throw new HttpError(503, '연결을 준비하고 있어요. 잠시 후 다시 접속해주세요.');
    const token = parseInviteToken(new URL(request.url).searchParams.get('token')), client = await serverClient();
    const result = await client.rpc('preview_partner_invite', { p_token: token });
    partnerFailure(result.error);
    return json(result.data);
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), body = object(await readBody(request));
    if (body.nickname !== undefined) {
      const result = await client.from('partner_profiles').upsert({ user_id: user.id, nickname: parseNickname(body.nickname) });
      partnerFailure(result.error);
    }
    const token = randomBytes(32).toString('hex'), result = await client.rpc('create_partner_invite', { p_hash: inviteHash(token) });
    partnerFailure(result.error);
    return json({ token, expires_at: result.data.expires_at }, 201);
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    const { client } = await requireSession(), result = await client.rpc('cancel_partner_invite');
    partnerFailure(result.error);
    return json({ cancelled: true });
  } catch (error) { return failure(error); }
}
