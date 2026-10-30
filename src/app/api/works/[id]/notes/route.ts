import { requireSession, json, failure, assertOrigin, readBody, HttpError } from '@/lib/api';
import { parseNote, object, uuid, noteColumns } from '@/lib/domain';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), workId = uuid((await context.params).id), body = object(await readBody(request));
    const existing = await client.from('works').select('id').eq('id', workId).eq('user_id', user.id).maybeSingle();
    if (existing.error) throw new Error(existing.error.code);
    if (!existing.data) throw new HttpError(404, '작품을 찾을 수 없어요.');
    const id = uuid(body.id), input = parseNote(body);
    const { data, error } = await client.from('notes').upsert({ ...input, id, work_id: workId, user_id: user.id }, { onConflict: 'id' }).select(noteColumns).single();
    if (error) throw new HttpError(400, '기록을 저장하지 못했어요. 다시 시도해주세요.');
    return json({ note: data }, 201);
  } catch (error) { return failure(error); }
}
