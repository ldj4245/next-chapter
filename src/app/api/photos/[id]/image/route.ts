import { failure, HttpError, requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { authorizedPhotoBytes, photoFailure } from '@/lib/photo-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { client } = await requireSession(), id = uuid((await context.params).id);
    const size = new URL(request.url).searchParams.get('size') ?? 'full';
    if (size !== 'full' && size !== 'thumb') throw new HttpError(400, '사진 크기를 확인해주세요.');
    const found = await client.rpc('can_read_task_photo', { p_id: id });
    photoFailure(found.error);
    if (found.data !== true) throw new HttpError(404, '사진을 찾을 수 없어요.');
    const bytes = await authorizedPhotoBytes(id, size);
    // A disconnect/unshare while the bytes were being read still prevents the
    // application response from exposing them after that change committed.
    const rechecked = await client.rpc('can_read_task_photo', { p_id: id });
    photoFailure(rechecked.error);
    if (rechecked.data !== true) throw new HttpError(404, '사진을 찾을 수 없어요.');
    return new Response(bytes, { headers: {
      'Content-Type': 'image/webp', 'Content-Length': String(bytes.size),
      'Content-Disposition': 'inline; filename="photo.webp"', 'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer',
    } });
  } catch (error) { return failure(error); }
}
