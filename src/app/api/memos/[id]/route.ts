import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { object, uuid } from '@/lib/domain';
import { parseMemo, parseRevision } from '@/lib/memory';
import { memoryFailure,publicMemo } from '@/lib/memory-server';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { client } = await requireSession(), id = uuid((await context.params).id), body = object(await readBody(request)), input = parseMemo(body), revision = parseRevision(body.revision);
    const result = await client.rpc('update_quick_memo', { p_id: id, p_content: input.content, p_revision: revision });
    memoryFailure(result.error);
    return json({ memo: publicMemo(result.data) });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const result = await client.from('quick_memos').delete().eq('id', id).eq('user_id', user.id).select('id').maybeSingle();
    memoryFailure(result.error);
    if (!result.data) throw new HttpError(404, '메모를 찾을 수 없어요.');
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
