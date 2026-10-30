import 'server-only';
import { HttpError } from './api';
import type { Memo, MemoConversion, MemoTarget, RevisitEntry, RevisitRecord } from './memory';
import { memoColumns,revisitColumns } from './memory';
import type { serverClient } from './supabase/server';

export type MemoryClient = Awaited<ReturnType<typeof serverClient>>;
export function publicMemo(value:unknown):Memo{return Object.fromEntries(memoColumns.split(',').map(key=>[key,(value as Record<string,unknown>)[key]])) as Memo;}
export function publicRevisit(value:unknown):RevisitEntry{return Object.fromEntries(revisitColumns.split(',').map(key=>[key,(value as Record<string,unknown>)[key]])) as RevisitEntry;}
export function memoryFailure(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === 'P0002' || error.code === '23503' || error.code === '42501') throw new HttpError(404, '기록이나 정리할 위치를 찾을 수 없어요.');
  if (error.code === '40001' || error.code === '23505' || (error.code === 'P0001' && ['MEMO_ID_CONTENT_CONFLICT', 'MEMO_REVISION_CONFLICT', 'REVISIT_ID_CONTENT_CONFLICT'].includes(error.message ?? ''))) throw new HttpError(409, '다른 곳에서 바뀐 기록이에요. 다시 불러온 뒤 확인해주세요.');
  if (error.code === '55000') throw new HttpError(409, '이미 정리한 메모예요. 정리한 기록에서 이어서 작성해주세요.');
  if (error.code === '22001') throw new HttpError(400, '회고에 더할 공간이 부족해요. 메모는 그대로 보관했어요.');
  if (error.code === '23514' || error.code === '22023') throw new HttpError(400, '입력 내용과 연결할 기록을 확인해주세요.');
  throw new Error(error.code ?? 'MEMORY_DATABASE_FAILED');
}
export async function memoTarget(client: MemoryClient, userId: string, memo: Memo): Promise<MemoTarget> {
  if (!memo.converted_kind) throw new Error('MEMO_NOT_CONVERTED');
  if (memo.converted_kind === 'review') return { kind: 'review', day: memo.converted_day!, href: `/?day=${memo.converted_day}#reflection-${memo.converted_day}` };
  if (memo.converted_kind === 'task') return { kind: 'task', id: memo.converted_id!, day: memo.converted_day!, href: `/?day=${memo.converted_day}#task-${memo.converted_id}` };
  const result = await client.from('notes').select('work_id').eq('id', memo.converted_id!).eq('user_id', userId).maybeSingle();
  memoryFailure(result.error);
  return { kind: 'note', id: memo.converted_id!, href: result.data ? `/library/${result.data.work_id}#note-${memo.converted_id}` : `/notes?organized=1#memo-${memo.id}` };
}
export async function conversionResponse(client: MemoryClient, userId: string, memo: Memo): Promise<MemoConversion> {
  const target = await memoTarget(client, userId, memo);
  return { memo: { ...publicMemo(memo), converted_href: target.href }, target };
}
export async function memoDestinations(client: MemoryClient, userId: string, memos: Memo[]): Promise<Memo[]> {
  const ids = memos.filter(memo => memo.converted_kind === 'note').map(memo => memo.converted_id!);
  const works = new Map<string, string>();
  for (let from = 0; from < ids.length; from += 500) {
    const result = await client.from('notes').select('id,work_id').eq('user_id', userId).in('id', ids.slice(from, from + 500));
    memoryFailure(result.error);
    for (const note of result.data ?? []) works.set(note.id, note.work_id);
  }
  return memos.map(memo => ({ ...memo, converted_href: memo.converted_kind === 'review' ? `/?day=${memo.converted_day}#reflection-${memo.converted_day}`
    : memo.converted_kind === 'task' ? `/?day=${memo.converted_day}#task-${memo.converted_id}`
      : memo.converted_kind === 'note' ? (works.has(memo.converted_id!) ? `/library/${works.get(memo.converted_id!)}#note-${memo.converted_id}` : `/notes?organized=1#memo-${memo.id}`) : null }));
}
export function revisitRecord(entry: RevisitEntry): RevisitRecord {
  return { kind: entry.source_kind, source_id: entry.source_id, source_day: entry.source_day, title: entry.source_title, text: entry.source_text, date: entry.source_date,
    href: entry.source_kind === 'review' ? `/?day=${entry.source_day}#reflection-${entry.source_day}` : `/library/${entry.source_work_id}#note-${entry.source_id}` };
}
