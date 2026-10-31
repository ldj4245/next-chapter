import { ARCHIVE_AAD, MAX_ARCHIVE_BYTES, parseArchiveEnvelope, type ArchiveDocument, type ArchiveEnvelope } from './archive.ts';

export function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function unbase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export function base64url(bytes: Uint8Array): string { return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function archiveDigest(envelope: ArchiveEnvelope): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parseArchiveEnvelope(envelope))));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function encryptArchive(document: ArchiveDocument) {
  if (!globalThis.crypto?.subtle) throw new Error('이 브라우저에서 암호화를 사용할 수 없어요. 최신 브라우저에서 다시 열어주세요.');
  const rawKey = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  let bytes: Uint8Array<ArrayBuffer> = new TextEncoder().encode(JSON.stringify(document));
  const compression = typeof CompressionStream !== 'undefined' ? 'gzip' : 'none';
  if (compression === 'gzip') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(ARCHIVE_AAD + compression) }, key, bytes);
  const envelope: ArchiveEnvelope = { format: 'next-chapter-encrypted', version: 1, cipher: 'AES-256-GCM', compression, iv: base64url(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_ARCHIVE_BYTES) throw new Error('무료 보관 크기를 넘었어요. 기간이나 기록 종류를 줄여주세요.');
  return { envelope, key: base64url(rawKey), digest: await archiveDigest(envelope) };
}
export async function decryptArchive(value: unknown, recoveryKey: string): Promise<ArchiveDocument> {
  const envelope = parseArchiveEnvelope(value);
  if (!/^[A-Za-z0-9_-]{43}$/.test(recoveryKey)) throw new Error('복구키를 확인해주세요.');
  const key = await crypto.subtle.importKey('raw', unbase64(recoveryKey), 'AES-GCM', false, ['decrypt']);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(envelope.iv), additionalData: new TextEncoder().encode(ARCHIVE_AAD + envelope.compression) }, key, unbase64(envelope.ciphertext));
  let bytes = new Uint8Array(raw);
  if (envelope.compression === 'gzip') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as ArchiveDocument;
  if (document.format !== 'next-chapter-records' || document.version !== 1 || !Array.isArray(document.entries)) throw new Error('지원하지 않는 보관 형식이에요.');
  return document;
}
