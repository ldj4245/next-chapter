'use client';

import { RequestError } from '@/components/api-client';
import type { TaskPhoto } from './photos';
import type { Task } from './planner';

export const PHOTO_INPUT_LIMIT = 20 * 1024 * 1024;
export const PHOTO_UPLOAD_LIMIT = 1024 * 1024;
const accepted = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export function validatePhotoFile(file: File) {
  if (!accepted.has(file.type.toLowerCase())) {
    if (/heic|heif/i.test(file.type + file.name)) throw new Error('이 사진 형식은 아직 지원하지 않아요. 휴대폰에서 JPEG로 저장한 사진을 선택해주세요.');
    throw new Error('JPEG, PNG, WebP, AVIF 사진을 선택해주세요. 움직이는 GIF와 SVG는 첨부할 수 없어요.');
  }
  if (!file.size) throw new Error('비어 있는 사진이에요. 다른 사진을 선택해주세요.');
  if (file.size > PHOTO_INPUT_LIMIT) throw new Error('20MB 이하의 사진을 선택해주세요.');
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 준비하지 못했어요. 다른 사진을 선택해주세요.')), 'image/webp', quality));
}

async function decodePhoto(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* Some mobile browsers decode AVIF through an image element instead. */ }
  }
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; URL.revokeObjectURL(url); } };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('이 사진을 읽을 수 없어요. JPEG나 PNG로 저장한 뒤 다시 선택해주세요.');
  }
}

/** Redraw pixels before upload so neither the original file nor its location metadata leaves the device. */
export async function compressPhoto(file: File): Promise<File> {
  validatePhotoFile(file);
  const decoded = await decodePhoto(file);
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 40000000) throw new Error('사진의 크기가 너무 커요. 크기를 줄인 사진을 선택해주세요.');
    const scale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement('canvas');
    let width = Math.max(1, Math.round(decoded.width * scale)), height = Math.max(1, Math.round(decoded.height * scale));
    let blob: Blob | null = null;
    for (let pass = 0; pass < 3; pass++) {
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('이 브라우저에서 사진을 준비할 수 없어요. 브라우저를 업데이트한 뒤 다시 시도해주세요.');
      context.drawImage(decoded.image, 0, 0, width, height);
      for (const quality of [.84, .72, .58]) {
        blob = await canvasBlob(canvas, quality);
        if (blob.size <= PHOTO_UPLOAD_LIMIT) break;
      }
      if (blob && blob.size <= PHOTO_UPLOAD_LIMIT) break;
      width = Math.max(1, Math.round(width * .75)); height = Math.max(1, Math.round(height * .75));
    }
    if (!blob || blob.size > PHOTO_UPLOAD_LIMIT) throw new Error('사진 용량을 충분히 줄이지 못했어요. 크기가 작은 사진을 선택해주세요.');
    if (blob.type !== 'image/webp' && blob.type !== 'image/png') throw new Error('이 브라우저의 사진 형식을 지원하지 않아요. 브라우저를 업데이트한 뒤 다시 시도해주세요.');
    return new File([blob], 'photo.' + (blob.type === 'image/webp' ? 'webp' : 'png'), { type: blob.type });
  } finally { decoded.close(); }
}

export async function photoRequest<T>(path: string, method = 'GET', body?: FormData, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method, body, signal, credentials: 'same-origin', cache: 'no-store' }); }
  catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new RequestError('연결을 확인하고 다시 시도해주세요. 선택한 사진은 유지돼요.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(data.error ?? '사진을 처리하지 못했어요. 다시 시도해주세요.', data.issues ?? {}, response.status);
  return data as T;
}

export async function uploadPhoto(taskId: string, id: string, file: File, signal?: AbortSignal): Promise<{ photo: TaskPhoto; task: Task }> {
  const data = new FormData(); data.set('id', id); data.set('file', file);
  return photoRequest<{ photo: TaskPhoto; task: Task }>('/api/planner/tasks/' + taskId + '/photos', 'POST', data, signal);
}
