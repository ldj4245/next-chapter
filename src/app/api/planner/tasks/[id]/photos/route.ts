import { randomUUID } from 'node:crypto';
import { assertOrigin, failure, HttpError, json, requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { cleanupAbandonedPhotos, cleanupPhotoFiles, photoColumns, photoFailure, preparePhoto, publicPhoto, removePhotoFiles, uploadPhotoBytes, type PhotoRow } from '@/lib/photo-server';
import { PHOTO_UPLOAD_BYTES } from '@/lib/photos';
import { taskColumns } from '@/lib/planner';
type Context = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';
export const maxDuration = 60;
async function currentTask(client: Awaited<ReturnType<typeof requireSession>>['client'], userId: string, taskId: string) {
  const result = await client.from('daily_tasks').select(taskColumns).eq('user_id', userId).eq('id', taskId).maybeSingle();
  photoFailure(result.error);
  return result.data;
}

async function photoForm(request: Request): Promise<FormData> {
  if (!request.body) throw new HttpError(400, '사진을 선택해주세요.');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > PHOTO_UPLOAD_BYTES + 64 * 1024) {
        await reader.cancel();
        throw new HttpError(413, '사진은 한 장에 3MB 이내로 선택해주세요.');
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  try {
    return await new Response(new Uint8Array(buffer), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
  } catch { throw new HttpError(400, '사진 첨부 형식을 확인해주세요.'); }
}

export async function GET(_request: Request, context: Context) {
  try {
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const task = await client.from('daily_tasks').select('id').eq('user_id', user.id).eq('id', id).maybeSingle();
    photoFailure(task.error);
    if (!task.data) throw new HttpError(404, '할 일을 찾을 수 없어요.');
    try { await cleanupPhotoFiles(client, user.id); } catch { console.error('Photo storage cleanup deferred'); }
    const result = await client.from('task_photos').select(photoColumns).eq('user_id', user.id).eq('task_id', id).eq('state', 'ready').order('created_at').order('id');
    photoFailure(result.error);
    return json({ photos: (result.data ?? []).map(row => publicPhoto(row as PhotoRow)) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  let reserved: PhotoRow | null = null;
  let session: Awaited<ReturnType<typeof requireSession>> | null = null;
  try {
    assertOrigin(request);
    session = await requireSession();
    const { user, client } = session, taskId = uuid((await context.params).id);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new HttpError(415, '사진 첨부 형식을 확인해주세요.');
    const length = request.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > PHOTO_UPLOAD_BYTES + 64 * 1024)) throw new HttpError(413, '사진은 한 장에 3MB 이내로 선택해주세요.');
    const form = await photoForm(request), files = form.getAll('file');
    if (files.length !== 1 || !(files[0] instanceof File)) throw new HttpError(400, '사진을 한 장씩 선택해주세요.');
    const id = form.get('id') === null ? randomUUID() : uuid(form.get('id'));
    const task = await client.from('daily_tasks').select('id').eq('user_id', user.id).eq('id', taskId).maybeSingle();
    photoFailure(task.error);
    if (!task.data) throw new HttpError(404, '할 일을 찾을 수 없어요.');
    await cleanupAbandonedPhotos(client, user.id, taskId);
    // Validate and decode before consuming a slot. Existing same-ID completed
    // requests can return their persisted photo without uploading it again.
    const prior = await client.from('task_photos').select(photoColumns).eq('id', id).eq('user_id', user.id).eq('task_id', taskId).maybeSingle();
    photoFailure(prior.error);
    if (prior.data?.state === 'ready') return json({ photo: publicPhoto(prior.data as PhotoRow), task: await currentTask(client, user.id, taskId) });
    const prepared = await preparePhoto(files[0]);
    const reservation = await client.rpc('reserve_task_photo', { p_task_id: taskId, p_id: id });
    photoFailure(reservation.error);
    reserved = reservation.data as PhotoRow;
    if (reserved.state === 'ready') return json({ photo: publicPhoto(reserved), task: await currentTask(client, user.id, taskId) });
    await uploadPhotoBytes(reserved, prepared.main, prepared.thumbnail);
    const finished = await client.rpc('finalize_task_photo', {
      p_id: reserved.id, p_width: prepared.width, p_height: prepared.height,
      p_bytes: prepared.main.byteLength, p_thumbnail_bytes: prepared.thumbnail.byteLength,
    });
    photoFailure(finished.error);
    return json({ photo: publicPhoto(finished.data as PhotoRow), task: await currentTask(client, user.id, taskId) }, 201);
  } catch (error) {
    if (reserved && session) {
      // Never delete a concurrent successful retry. Only pending metadata is
      // abandoned; its trigger queues any partially uploaded object for cleanup.
      const dropped = await session.client.from('task_photos').delete().eq('user_id', session.user.id).eq('id', reserved.id).eq('state', 'pending');
      if (dropped.error) console.error('Photo reservation cleanup deferred');
      const remaining = await session.client.from('task_photos').select('state').eq('user_id', session.user.id).eq('id', reserved.id).maybeSingle();
      // A task/photo can be deleted while the storage transfer is in flight.
      // Once it settles, remove the known owner paths even if the earlier
      // deletion already cleared its outbox. Keep a successful ready retry.
      if (!remaining.error && !remaining.data) {
        try { await removePhotoFiles(session.client, [reserved.original_path, reserved.thumbnail_path]); }
        catch { console.error('Photo partial upload cleanup deferred'); }
      }
      try { await cleanupPhotoFiles(session.client, session.user.id); } catch { console.error('Photo storage cleanup deferred'); }
    }
    return failure(error);
  }
}
