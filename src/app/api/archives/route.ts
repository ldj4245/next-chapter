import { assertOrigin, failure, HttpError, json } from '@/lib/api';
import { requireAccountSession } from '@/lib/account-server';
import { parseArchiveCreate } from '@/lib/archive';
import { createArchive, ownArchives } from '@/lib/archive-server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET() {
  try {
    const { user, client } = await requireAccountSession();
    return json({ archives: await ownArchives(client, user.id) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user } = await requireAccountSession();
    if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, '입력 형식을 확인해주세요.');
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, '보관 파일을 확인해주세요.');
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 110000) { await reader.cancel(); throw new HttpError(413, '무료 보관 크기를 넘었어요. 기간이나 기록 종류를 줄여주세요.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, '보관 파일을 확인해주세요.'); }
    const archive = await createArchive(user.id, parseArchiveCreate(input));
    return json({ archive }, 201);
  } catch (error) { return failure(error); }
}
