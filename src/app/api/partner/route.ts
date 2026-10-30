import { assertOrigin, failure, json, readBody, requireSession } from '@/lib/api';
import { object, uuid } from '@/lib/domain';
import { partnerFailure, partnerState } from '@/lib/partner-server';

export async function GET() {
  try { const { client } = await requireSession(); return json(await partnerState(client)); }
  catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    const { client } = await requireSession(), body = object(await readBody(request)), id = uuid(body.connection_id);
    const result = await client.rpc('revoke_partner', { p_connection_id: id });
    partnerFailure(result.error);
    return json({ disconnected: true });
  } catch (error) { return failure(error); }
}
