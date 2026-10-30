import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { object, uuid, InputError } from '@/lib/domain';
import { parseReadingDetails } from '@/lib/reading';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id), body = object(await readBody(request));
    if (!['pause', 'resume', 'complete', 'details', 'cancel'].includes(String(body.action))) throw new InputError({ action: '독서 상태를 확인해주세요.' });
    const details = body.action === 'details' || body.action === 'complete' ? parseReadingDetails(body) : { progress: null, content: null, thought: null };
    const existing = await client.from('reading_sessions').select('is_reading,task_title').eq('user_id', user.id).eq('id', id).maybeSingle();
    if (existing.error) throw new Error(existing.error.code);
    if (!existing.data) throw new HttpError(404, '독서 기록을 찾을 수 없어요.');
    if (!existing.data.is_reading || (existing.data.task_title && body.action !== 'details')) throw new HttpError(409, '할 일에서 시작한 타이머는 나의 하루에서 확인해주세요.');
    const result = await client.rpc('change_reading', { p_id: id, p_action: body.action, p_progress: details.progress, p_content: details.content, p_thought: details.thought });
    if (result.error?.code === 'P0002') throw new HttpError(404, '독서 기록이나 연결된 책을 찾을 수 없어요.');
    if (result.error?.code === '23514') throw new HttpError(409, '다른 기기에서 독서 상태가 바뀌었어요. 새로고침 후 다시 확인해주세요.');
    if (result.error) throw new Error(result.error.code);
    return json({ session: body.action === 'cancel' ? null : result.data, server_now: new Date().toISOString() });
  } catch (error) { return failure(error); }
}
