import { assertOrigin, failure, HttpError, json, requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { memoryFailure } from '@/lib/memory-server';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const result = await client.from('record_revisits').delete().eq('id', id).eq('user_id', user.id).select('id').maybeSingle();
    memoryFailure(result.error);
    if (!result.data) throw new HttpError(404, '저장한 다시 읽기 기록을 찾을 수 없어요.');
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
