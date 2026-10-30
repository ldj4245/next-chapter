import { failure, json, requireSession } from '@/lib/api';
import { parseRecordSearch, recordSearchResponse } from '@/lib/record-search';

export async function GET(request: Request) {
  try {
    const { client } = await requireSession();
    const input = parseRecordSearch(new URL(request.url).searchParams);
    if (!input.q) return json({ results: [], hasMore: false, nextOffset: null });
    const { data, error } = await client.rpc('search_private_records', { p_query: input.q, p_kind: input.kind, p_offset: input.offset });
    if (error) throw new Error('SEARCH_READ_FAILED');
    return json(recordSearchResponse(data, input.offset));
  } catch (error) { return failure(error); }
}
