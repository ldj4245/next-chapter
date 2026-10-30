import 'server-only';
import { createHash } from 'node:crypto';
import { HttpError } from './api';
import { serverClient } from './supabase/server';
import { parseInviteToken, type PartnerState } from './partner';
import { uuid } from './domain';

type Client = Awaited<ReturnType<typeof serverClient>>;

export function inviteHash(value: unknown): string {
  return createHash('sha256').update(parseInviteToken(value)).digest('hex');
}

export function partnerFailure(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.code === 'P0002') throw new HttpError(410, '초대 링크가 만료되었거나 이미 사용됐어요. 새 링크를 요청해주세요.');
  if (error.code === '23505') throw new HttpError(409, '이미 연결된 상대가 있어요. 현재 연결을 먼저 해제해주세요.');
  if (error.code === '23514') throw new HttpError(400, '이름이나 초대 링크를 확인해주세요. 본인의 초대는 수락할 수 없어요.');
  if (error.code === '42501') throw new HttpError(409, '연결 상태가 바뀌었어요. 화면을 새로 확인해주세요.');
  if (error.code === '40P01' || error.code === '40001') throw new HttpError(409, '연결 상태를 함께 변경하고 있어요. 작성한 내용은 유지되니 잠시 후 다시 시도해주세요.');
  if (error.code === 'P0001') throw new HttpError(404, '연결된 상대가 없어요.');
  throw new Error(error.code ?? 'PARTNER_DATABASE_FAILED');
}

export async function partnerState(client: Client): Promise<PartnerState> {
  const result = await client.rpc('partner_state');
  partnerFailure(result.error);
  return result.data as PartnerState;
}

// The expected ID is a concurrency guard for the partner shown in the editor,
// never an authorization scope. Derive the actual binding from the owner's live
// membership; the database trigger repeats it if the pair changes before writing.
export async function sharedTaskConnection(client: Client, userId: string, shared: boolean, expected?: unknown): Promise<string | null> {
  const expectedId = expected === undefined || expected === null ? null : uuid(expected);
  if (shared && !expectedId) throw new HttpError(409, '현재 연결된 상대를 확인한 뒤 함께 확인할 일을 선택해주세요.');
  if (!shared && !expectedId) return null;
  const member = await client.from('partner_members').select('connection_id').eq('user_id', userId).maybeSingle();
  partnerFailure(member.error);
  if (!member.data) throw new HttpError(409, expectedId ? '연결 상태가 바뀌었어요. 현재 상대를 확인한 뒤 다시 선택해주세요.' : '상대를 연결한 뒤 함께 확인할 일을 선택해주세요.');
  if (expectedId && expectedId !== member.data.connection_id) throw new HttpError(409, '연결 상태가 바뀌었어요. 현재 상대를 확인한 뒤 다시 선택해주세요.');
  return shared ? member.data.connection_id as string : null;
}
