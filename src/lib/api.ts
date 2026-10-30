import 'server-only';
import { NextResponse } from 'next/server';
import { currentUser, serverClient, configured } from './supabase/server';
import { InputError } from './domain';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function requireSession() {
  if (!configured()) throw new HttpError(503, '서재 연결을 준비하고 있어요. 잠시 후 다시 접속해주세요.');
  const user = await currentUser();
  if (!user) throw new HttpError(401, '로그인이 필요해요.');
  return { user, client: await serverClient() };
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
}
export function failure(error: unknown) {
  if (error instanceof InputError) return json({ error: error.message, issues: error.issues }, 400);
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error('Library request failed', error instanceof Error ? error.message : 'database or network failure');
  return json({ error: '요청을 처리하지 못했어요. 작성한 내용은 유지되니 다시 시도해주세요.' }, 500);
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '허용되지 않은 요청이에요.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, '허용되지 않은 요청이에요.');
}
export async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, '입력 형식을 확인해주세요.');
  const raw = await request.text();
  if (raw.length > 100000) throw new HttpError(413, '입력 내용이 너무 커요.');
  try { return JSON.parse(raw) as unknown; } catch { throw new HttpError(400, '입력 내용을 확인해주세요.'); }
}
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>) {
  const rows: T[] = [];
  // Supabase caps each response; fetch every page for complete libraries/backups.
  for (let from = 0; ; from += 500) {
    const result = await page(from, from + 499);
    if (result.error) throw new Error(result.error.code ?? 'DATABASE_READ_FAILED');
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}
