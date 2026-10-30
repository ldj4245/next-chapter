import { InputError, object, type Issues } from './domain.ts';
import type { TaskState } from './planner.ts';
import type {TaskPhoto} from './photos.ts';

export type PartnerProfile = { nickname: string };
export type PartnerConnection = { id: string; nickname: string; connected_at: string };
export type PartnerState = { profile: PartnerProfile | null; connection: PartnerConnection | null; invite: { expires_at: string } | null };
export type PartnerInvite = { token: string; expires_at: string };
export type PartnerInvitePreview = { nickname: string; expires_at: string };
export type PartnerActivity = { id: string; day: string; title: string; status: TaskState; public_note: string; completed_at: string | null; measured_seconds: number | null; pages: number | null; total_sessions: number; photos?:TaskPhoto[] };
export type PartnerDay = { day: string; nickname: string; connection_id: string; activities: PartnerActivity[] };
export type TaskSharing = { shared: boolean; public_note: string };

export function parseNickname(value: unknown): string {
  const nickname = typeof value === 'string' ? value.trim() : '';
  if (Array.from(nickname).length < 2 || Array.from(nickname).length > 24 || /[\x00-\x1f\x7f-\x9f<>]/u.test(nickname)) {
    throw new InputError({ nickname: '이름은 2~24자로 입력해주세요. 줄바꿈이나 꺾쇠는 사용할 수 없어요.' });
  }
  return nickname;
}

export function parseInviteToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new InputError({ token: '초대 링크를 확인해주세요.' });
  return value;
}

export function parseTaskSharing(value: unknown): TaskSharing {
  const input = object(value), issues: Issues = {};
  if (typeof input.shared !== 'boolean') issues.shared = '공개 여부를 확인해주세요.';
  const public_note = typeof input.public_note === 'string' ? input.public_note.trim() : '';
  if (input.public_note != null && typeof input.public_note !== 'string') issues.public_note = '공개 문장을 문자로 입력해주세요.';
  if (public_note.length > 1000) issues.public_note = '공개 문장은 1,000자 이내로 작성해주세요.';
  if (Object.keys(issues).length) throw new InputError(issues);
  return { shared: input.shared as boolean, public_note };
}
