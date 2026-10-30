import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { parseFocusAction } from '@/lib/focus';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { client } = await requireSession(), id = uuid((await context.params).id), input = parseFocusAction(await readBody(request));
    const result = await client.rpc('change_focus', { p_id: id, p_action: input.action, p_memo: input.memo });
    if (result.error?.code === 'P0002') throw new HttpError(404, '집중 기록을 찾을 수 없어요.');
    if (result.error?.code === '23514') throw new HttpError(409, '다른 기기에서 상태가 바뀌었어요. 기록을 다시 확인해주세요.');
    if (result.error) throw new Error(result.error.code);
    return json({ session: input.action === 'cancel' ? null : result.data, server_now: new Date().toISOString() });
  } catch (error) { return failure(error); }
}
