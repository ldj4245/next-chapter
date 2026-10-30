import { assertOrigin, failure, HttpError, json, requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { cleanupPhotoFiles, photoFailure } from '@/lib/photo-server';
import { taskColumns } from '@/lib/planner';
type Context = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const result = await client.from('task_photos').delete().eq('user_id', user.id).eq('id', id).select('id,task_id');
    photoFailure(result.error);
    if (!result.data?.length) throw new HttpError(404, '사진을 찾을 수 없어요.');
    try { await cleanupPhotoFiles(client, user.id); } catch { console.error('Photo storage cleanup deferred'); }
    const task = await client.from('daily_tasks').select(taskColumns).eq('user_id', user.id).eq('id', result.data[0].task_id).maybeSingle();
    photoFailure(task.error);
    return json({ deleted: true, task: task.data });
  } catch (error) { return failure(error); }
}
