import { requireSession, json, failure, assertOrigin, readBody, HttpError } from '@/lib/api';
import { parseNote, uuid, noteColumns } from '@/lib/domain';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id), input = parseNote(await readBody(request));
    const { data, error } = await client.from('notes').update(input).eq('id', id).eq('user_id', user.id).select(noteColumns).maybeSingle();
    if (error) throw new HttpError(400, '기록을 저장하지 못했어요. 다시 시도해주세요.');
    if (!data) throw new HttpError(404, '기록을 찾을 수 없어요.');
    return json({ note: data });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const { data, error } = await client.from('notes').delete().eq('id', id).eq('user_id', user.id).select('id');
    if (error) throw new Error(error.code);
    if (!data?.length) throw new HttpError(404, '기록을 찾을 수 없어요.');
    return json({ deleted: true });
  } catch (error) { return failure(error); }
}
