import { InputError } from './domain.ts';

export const PHOTO_LIMIT = 3;
export const PHOTO_UPLOAD_BYTES = 3 * 1024 * 1024;
export const PHOTO_MAX_PIXELS = 40_000_000;
export const PHOTO_MAIN_BYTES = 1_000_000;
export const PHOTO_THUMB_BYTES = 100_000;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export type TaskPhoto = {
  id: string; task_id: string; width: number; height: number; bytes: number;
  created_at: string; url: string; thumbnail_url: string;
};
export function validatePhotoUpload(value: { size: number; type: string }): void {
  if (!Number.isInteger(value.size) || value.size < 1) throw new InputError({ photo: '빈 사진은 첨부할 수 없어요.' });
  if (value.size > PHOTO_UPLOAD_BYTES) throw new InputError({ photo: '사진은 한 장에 3MB 이내로 선택해주세요.' });
  if (!(PHOTO_TYPES as readonly string[]).includes(value.type)) throw new InputError({ photo: 'JPG, PNG, WebP, AVIF 사진을 선택해주세요.' });
}
export function photoURLs(id: string) {
  const base = '/api/photos/' + encodeURIComponent(id) + '/image';
  return { url: base + '?size=full', thumbnail_url: base + '?size=thumb' };
}
export function parsePhotoSharing(value: unknown): { photos_shared: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof (value as Record<string, unknown>).photos_shared !== 'boolean') {
    throw new InputError({ photos_shared: '사진 공개 여부를 확인해주세요.' });
  }
  return { photos_shared: (value as { photos_shared: boolean }).photos_shared };
}
