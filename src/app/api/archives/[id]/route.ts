import { assertOrigin, failure, HttpError, json, readBody } from '@/lib/api';
import { requireAccountSession } from '@/lib/account-server';
import { object, uuid } from '@/lib/domain';
import { ownArchive, submitArchive, verifyArchive } from '@/lib/archive-server';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { user, client } = await requireAccountSession(), id = uuid((await context.params).id);
    return json({ archive: await ownArchive(client, user.id, id) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const { user, client } = await requireAccountSession(), id = uuid((await context.params).id), input = object(await readBody(request));
    // Authorize with the owner-scoped client before any privileged write or
    // external request, including a status-only request.
    await ownArchive(client, user.id, id);
    if (input.action === 'check') return json({ archive: await verifyArchive(client, user.id, id) });
    if (input.action !== 'submit' || input.consent !== true || input.consent_version !== 1) throw new HttpError(400, '복구 파일과 외부 보관 안내를 확인해주세요.');
    return json({ archive: await submitArchive(user.id, id) });
  } catch (error) { return failure(error); }
}
