import { InputError, object, uuid } from './domain.ts';
import { parseDay } from './planner.ts';

export const MEMO_KINDS = { task: '할 일', review: '회고', note: '작품 기록' } as const;
export type MemoKind = keyof typeof MEMO_KINDS;
export type Memo = {
  id: string; content: string; revision: number; created_at: string; updated_at: string;
  converted_kind: MemoKind | null; converted_id: string | null; converted_day: string | null; converted_at: string | null;
  converted_href?: string | null;
};
export type MemoTarget = { kind: MemoKind; id?: string; day?: string; href: string };
export type MemoConversion = { memo: Memo; target: MemoTarget };
export type RevisitKind = 'review' | 'note';
export type RevisitRecord = { kind: RevisitKind; source_id: string | null; source_day: string | null; title: string; text: string; href: string; date: string };
export type RevisitEntry = {
  id: string; source_kind: RevisitKind; source_id: string | null; source_day: string | null;
  source_work_id: string | null; source_date: string; source_title: string; source_text: string;
  thought: string; created_at: string; updated_at: string;
};
export type RevisitResponse = { record: RevisitRecord | null; next_offset: number | null; entries: RevisitEntry[] };
export const memoColumns = 'id,content,revision,created_at,updated_at,converted_kind,converted_id,converted_day,converted_at';
export const revisitColumns = 'id,source_kind,source_id,source_day,source_work_id,source_date,source_title,source_text,thought,created_at,updated_at';

function preservedText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new InputError({ [field]: '내용을 입력해주세요.' });
  if (value.length > max) throw new InputError({ [field]: `${max.toLocaleString('ko-KR')}자 이내로 입력해주세요.` });
  return value;
}
export function parseMemo(value: unknown): { content: string } {
  return { content: preservedText(object(value).content, 'content', 2000) };
}
export function parseRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new InputError({ revision: '저장된 메모를 다시 불러와주세요.' });
  return value as number;
}
export function parseMemoConversion(value: unknown): { kind: MemoKind; day: string; work_id: string | null; revision: number } {
  const input = object(value), kind = input.kind as MemoKind;
  if (!Object.hasOwn(MEMO_KINDS, kind ?? '')) throw new InputError({ kind: '정리할 위치를 선택해주세요.' });
  const day = parseDay(input.day), revision = parseRevision(input.revision);
  const work_id = kind === 'note' ? uuid(input.work_id) : null;
  return { kind, day, work_id, revision };
}
export function parseRevisit(value: unknown): { id: string; source_kind: RevisitKind; source_id: string | null; source_day: string | null; thought: string } {
  const input = object(value), id = uuid(input.id), thought = preservedText(input.thought, 'thought', 4000);
  if (input.source_kind === 'review') return { id, source_kind: 'review', source_id: null, source_day: parseDay(input.source_day), thought };
  if (input.source_kind === 'note') return { id, source_kind: 'note', source_id: uuid(input.source_id), source_day: null, thought };
  throw new InputError({ source_kind: '다시 읽을 기록을 선택해주세요.' });
}
export function parseRevisitOffset(value: string | null): number {
  if (value === null) return 0;
  if (!/^\d{1,7}$/.test(value)) throw new InputError({ offset: '다시 읽기 순서를 확인해주세요.' });
  const offset = Number(value);
  if (offset > 1000000) throw new InputError({ offset: '다시 읽기 순서를 확인해주세요.' });
  return offset;
}
