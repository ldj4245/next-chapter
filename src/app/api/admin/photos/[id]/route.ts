import { failure, HttpError } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { adminRPC, requireAdminSession } from '@/lib/admin-server';
import { authorizedPhotoBytes } from '@/lib/photo-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { client } = await requireAdminSession(), id = uuid((await context.params).id);
    const size = new URL(request.url).searchParams.get('size') ?? 'full';
    if (size !== 'full' && size !== 'thumb') throw new HttpError(400, '사진 크기를 확인해주세요.');
    if (!await adminRPC(client, 'admin_photo', { p_id: id, p_log: true })) throw new HttpError(404, '사진을 찾을 수 없어요.');
    const bytes = await authorizedPhotoBytes(id, size);
    if (!await adminRPC(client, 'admin_photo', { p_id: id, p_log: false })) throw new HttpError(404, '사진을 찾을 수 없어요.');
    return new Response(bytes, { headers: {
      'Content-Type': 'image/webp', 'Content-Length': String(bytes.size), 'Content-Disposition': 'inline; filename="photo.webp"',
      'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer',
    } });
  } catch (error) { return failure(error); }
}
