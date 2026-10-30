import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { parseRevisit, parseRevisitOffset, revisitColumns, type RevisitEntry, type RevisitRecord } from '@/lib/memory';
import { memoryFailure, publicRevisit,revisitRecord } from '@/lib/memory-server';

export async function GET(request: Request) {
  try {
    const { user, client } = await requireSession(), url = new URL(request.url), entryId = url.searchParams.get('entry');
    let record: RevisitRecord | null = null, next_offset: number | null = null, selectedEntry: RevisitEntry | null = null;
    if (entryId) {
      const result = await client.from('record_revisits').select(revisitColumns).eq('id', uuid(entryId)).eq('user_id', user.id).maybeSingle();
      memoryFailure(result.error);
      if (!result.data) throw new HttpError(404, '저장한 다시 읽기 기록을 찾을 수 없어요.');
      selectedEntry = result.data as RevisitEntry;
      record = revisitRecord(selectedEntry);
    } else {
      const offset = parseRevisitOffset(url.searchParams.get('offset'));
      const result = await client.rpc('next_memory_source', { p_offset: offset });
      memoryFailure(result.error);
      record = result.data as RevisitRecord | null;
      if (record && offset < 1000000) {
        const next = await client.rpc('next_memory_source', { p_offset: offset + 1 });
        memoryFailure(next.error);
        if (next.data) next_offset = offset + 1;
      }
    }
    let entries: RevisitEntry[] = [];
    if (record) {
      let query = client.from('record_revisits').select(revisitColumns).eq('user_id', user.id).eq('source_kind', record.kind);
      query = record.kind === 'review' ? query.eq('source_day', record.source_day!) : query.eq('source_id', record.source_id!);
      const result = await query.order('created_at', { ascending: false }).order('id').limit(100);
      memoryFailure(result.error);
      entries = result.data as RevisitEntry[] ?? [];
      if (selectedEntry && !entries.some(entry => entry.id === selectedEntry.id)) entries.push(selectedEntry);
    }
    return json({ record, next_offset, entries });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { client } = await requireSession(), input = parseRevisit(await readBody(request));
    const result = await client.rpc('create_record_revisit', { p_id: input.id, p_source_kind: input.source_kind, p_source_id: input.source_id, p_source_day: input.source_day, p_thought: input.thought });
    memoryFailure(result.error);
    return json({ entry: publicRevisit(result.data) }, 201);
  } catch (error) { return failure(error); }
}
