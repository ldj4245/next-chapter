import 'server-only';
import { HttpError } from './api';
import { requireAccountSession } from './account-server';
import { serverClient } from './supabase/server';

export function adminFailure(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.code === '42501') throw new HttpError(403, '관리자 계정으로만 확인할 수 있어요.');
  if (error.code === 'P0002') throw new HttpError(404, '계정이나 기록을 찾을 수 없어요.');
  if (error.code === '23514' || error.code === '22007' || error.code === '22008') throw new HttpError(400, '조회 조건을 확인해주세요.');
  throw new HttpError(503, '관리 정보를 불러오지 못했어요. 잠시 후 다시 확인해주세요.');
}
export async function hasAdminAccess(client?: Awaited<ReturnType<typeof serverClient>>): Promise<boolean> {
  const session = client ?? await serverClient();
  const result = await session.rpc('admin_access');
  return !result.error && result.data === true;
}
export async function requireAdminSession() {
  const session = await requireAccountSession();
  if (!await hasAdminAccess(session.client)) throw new HttpError(403, '관리자 계정으로만 확인할 수 있어요.');
  return session;
}
export async function adminRPC<T>(client: Awaited<ReturnType<typeof serverClient>>, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await client.rpc(name, args);
  adminFailure(result.error);
  return result.data as T;
}
