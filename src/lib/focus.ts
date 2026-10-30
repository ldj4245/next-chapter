import { InputError, object, uuid } from './domain.ts';
import { elapsedSeconds, sessionColumns, type ReadingSession } from './reading.ts';

export const FOCUS_MAX_SECONDS = 14400;
export const FOCUS_MEMO_MAX = 20000;
export type FocusSession = ReadingSession & {
  task_id: string | null; goal_id: string | null; task_title: string;
  target_seconds: number; memo: string; start_page: number | null; is_reading: boolean;
};
export type FocusData = { server_now: string; day: string; session: FocusSession | null; sessions: FocusSession[] };
export type FocusResponse = { server_now: string; session: FocusSession | null };
export type FocusAction = 'pause' | 'resume' | 'complete' | 'cancel' | 'memo';
export const focusSessionColumns = sessionColumns + ',task_id,goal_id,task_title,target_seconds,memo,start_page,is_reading';

export function parseFocusStart(value: unknown) {
  const input = object(value);
  const target = input.target_seconds;
  if (typeof target !== 'number' || !Number.isInteger(target) || (target !== 0 && (target < 60 || target > FOCUS_MAX_SECONDS))) {
    throw new InputError({ target_seconds: '자유 측정 또는 1~240분의 집중 시간을 선택해주세요.' });
  }
  return { id: uuid(input.id), task_id: uuid(input.task_id), target_seconds: target };
}
export function parseFocusAction(value: unknown): { action: FocusAction; memo: string | null } {
  const input = object(value), action = input.action;
  if (typeof action !== 'string' || !['pause', 'resume', 'complete', 'cancel', 'memo'].includes(action)) throw new InputError({ action: '집중 상태를 확인해주세요.' });
  if (action !== 'memo') return { action: action as FocusAction, memo: null };
  if (typeof input.memo !== 'string' || input.memo.length > FOCUS_MEMO_MAX) throw new InputError({ memo: '메모는 20,000자 이내로 작성해주세요.' });
  return { action, memo: input.memo };
}
export function focusClock(session: FocusSession, now: number): string {
  const elapsed = elapsedSeconds(session, now);
  const seconds = session.target_seconds ? Math.max(0, session.target_seconds - elapsed) : elapsed;
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  return (hours ? String(hours).padStart(2, '0') + ':' : '') + String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}
