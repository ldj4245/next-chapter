import 'server-only';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './api';
import { InputError } from './domain';
import { serverClient } from './supabase/server';
import { PHOTO_MAIN_BYTES, PHOTO_MAX_PIXELS, PHOTO_THUMB_BYTES, PHOTO_UPLOAD_BYTES, photoURLs, validatePhotoUpload, type TaskPhoto } from './photos';

type Client = Awaited<ReturnType<typeof serverClient>>;
export type PhotoRow = {
  id: string; user_id: string; task_id: string; original_path: string; thumbnail_path: string;
  width: number | null; height: number | null; bytes: number | null; thumbnail_bytes: number | null;
  mime_type: string; state: 'pending' | 'ready'; created_at: string;
};
export const photoColumns = 'id,user_id,task_id,original_path,thumbnail_path,width,height,bytes,thumbnail_bytes,mime_type,state,created_at';
// This client is used only after the session-scoped image RPC has authorized a
// single derived path. Its credential never enters JSON, HTML, or public env.
function storageServer() {
  const key = process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY, url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) throw new HttpError(503, '사진 연결을 준비하고 있어요. 잠시 후 다시 확인해주세요.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export async function uploadPhotoBytes(row: PhotoRow, main: Buffer, thumbnail: Buffer): Promise<void> {
  const prefix = row.user_id + '/' + row.task_id + '/' + row.id;
  if (row.state !== 'pending' || row.original_path !== prefix + '/image.webp' || row.thumbnail_path !== prefix + '/thumb.webp') throw new HttpError(400, '사진 저장 정보를 확인해주세요.');
  const client = storageServer();
  for (const [path, body] of [[row.original_path, main], [row.thumbnail_path, thumbnail]] as const) {
    const result = await client.storage.from('task-photos').upload(path, body, { contentType: 'image/webp', upsert: true, cacheControl: '0' });
    if (result.error) throw new HttpError(503, '사진을 저장하지 못했어요. 선택한 사진을 다시 첨부할 수 있어요.');
  }
}
export async function authorizedPhotoBytes(id: string, size: 'full' | 'thumb'): Promise<Blob> {
  const client = storageServer();
  const found = await client.from('task_photos').select('original_path,thumbnail_path').eq('id', id).eq('state', 'ready').maybeSingle();
  if (found.error || !found.data) throw new HttpError(404, '사진을 찾을 수 없어요.');
  const path = size === 'thumb' ? found.data.thumbnail_path as string : found.data.original_path as string;
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(image|thumb)\.webp$/.test(path)) throw new HttpError(404, '사진을 찾을 수 없어요.');
  const result = await client.storage.from('task-photos').download(path);
  if (result.error || !result.data) throw new HttpError(404, '사진을 불러올 수 없어요.');
  return result.data;
}
export function photoFailure(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.code === 'P0002' || error.code === '42501') throw new HttpError(404, '사진이나 할 일을 찾을 수 없어요.');
  if (error.code === 'P0001' && error.message === 'PHOTO_LIMIT') throw new HttpError(409, '사진은 할 일마다 3장까지 첨부할 수 있어요.');
  if (error.code === 'P0001' && error.message === 'PHOTO_BUSY') throw new HttpError(409, '이 사진을 저장하고 있어요. 잠시 후 다시 확인해주세요.');
  if (error.code === 'P0001' && error.message === 'ACCOUNT_DELETING') throw new HttpError(409, '탈퇴 처리가 진행 중이에요. 내 계정에서 탈퇴를 마무리해주세요.');
  if (error.code === 'P0001' && error.message === 'ACCOUNT_PHOTO_BUSY') throw new HttpError(409, '사진 업로드 처리를 정리하고 있어요. 잠시 후 다시 확인해주세요.');
  if (error.code === '23514') throw new HttpError(400, '사진 저장 정보를 확인해주세요. 다시 첨부할 수 있어요.');
  if (error.code === '23505' || error.code === '40P01' || error.code === '40001') throw new HttpError(409, '사진을 함께 변경하고 있어요. 잠시 후 다시 시도해주세요.');
  throw new Error(error.code ?? 'PHOTO_DATABASE_FAILED');
}
export function publicPhoto(row: PhotoRow): TaskPhoto {
  if (row.state !== 'ready' || row.width === null || row.height === null || row.bytes === null) throw new Error('PHOTO_NOT_READY');
  return { id: row.id, task_id: row.task_id, width: row.width, height: row.height, bytes: row.bytes, created_at: row.created_at, ...photoURLs(row.id) };
}
export async function taskPhotoPaths(client: Client, userId: string, taskId: string): Promise<string[]> {
  const result = await client.from('task_photos').select('original_path,thumbnail_path').eq('user_id', userId).eq('task_id', taskId);
  photoFailure(result.error);
  return (result.data ?? []).flatMap(row => [row.original_path as string, row.thumbnail_path as string]);
}
export async function removePhotoFiles(client: Client, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const claims = await client.auth.getClaims(), actor = claims.data?.claims?.sub;
  if (claims.error || typeof actor !== 'string' || paths.some(path => !path.startsWith(actor + '/')
    || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(image|thumb)\.webp$/.test(path))) throw new HttpError(404, '사진을 찾을 수 없어요.');
  // Orphan SELECT is deliberately denied. The server removes only paths from
  // owner-filtered metadata/outbox after checking the current session prefix.
  const removed = await storageServer().storage.from('task-photos').remove(paths);
  if (removed.error) throw new Error('PHOTO_STORAGE_CLEANUP_FAILED');
  const cleared = await client.from('task_photo_deletions').delete().in('path', paths);
  photoFailure(cleared.error);
}
export async function cleanupPhotoFiles(client: Client, userId: string): Promise<void> {
  const pending = await client.from('task_photo_deletions').select('path').eq('user_id', userId).order('created_at').limit(100);
  photoFailure(pending.error);
  await removePhotoFiles(client, (pending.data ?? []).map(row => row.path as string));
}
export async function cleanupAbandonedPhotos(client: Client, userId: string, taskId: string): Promise<void> {
  const stale = await client.from('task_photos').select('id').eq('user_id', userId).eq('task_id', taskId).eq('state', 'pending')
    .lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
  photoFailure(stale.error);
  if (stale.data?.length) {
    const result = await client.from('task_photos').delete().eq('user_id', userId).eq('state', 'pending').in('id', stale.data.map(row => row.id));
    photoFailure(result.error);
  }
  await cleanupPhotoFiles(client, userId);
}
async function fitWebP(input: Buffer, edge: number, limit: number) {
  let size = edge;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const quality of [80, 65, 48]) {
      const result = await sharp(input, { limitInputPixels: PHOTO_MAX_PIXELS, failOn: 'error' }).rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true });
      if (result.data.byteLength <= limit) return result;
    }
    size = Math.floor(size * 0.75);
  }
  throw new InputError({ photo: '이 사진은 크기를 줄이기 어려워요. 다른 사진을 선택해주세요.' });
}
export async function preparePhoto(file: File) {
  if (file.size > PHOTO_UPLOAD_BYTES) throw new HttpError(413, '사진은 한 장에 3MB 이내로 선택해주세요.');
  validatePhotoUpload(file);
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const metadata = await sharp(input, { limitInputPixels: PHOTO_MAX_PIXELS, failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > PHOTO_MAX_PIXELS || (metadata.pages ?? 1) !== 1
      || !['jpeg', 'png', 'webp', 'avif', 'heif'].includes(metadata.format ?? '')) throw new Error('INVALID_IMAGE');
    // AVIF is represented as HEIF by libvips; HEIC input remains unsupported.
    if (metadata.format === 'heif' && metadata.compression !== 'av1') throw new Error('INVALID_IMAGE');
    const main = await fitWebP(input, 1600, PHOTO_MAIN_BYTES), thumb = await fitWebP(input, 360, PHOTO_THUMB_BYTES);
    // Sharp removes EXIF, GPS, comments, and original filenames by default.
    return { main: main.data, thumbnail: thumb.data, width: main.info.width, height: main.info.height };
  } catch (error) {
    if (error instanceof InputError || error instanceof HttpError) throw error;
    throw new InputError({ photo: '사진 파일을 읽을 수 없어요. JPG, PNG, WebP, AVIF 사진을 선택해주세요.' });
  }
}
