import { allRows, assertOrigin, failure, json, readBody, requireSession } from '@/lib/api';
import { object, uuid } from '@/lib/domain';
import { memoColumns, parseMemo, type Memo } from '@/lib/memory';
import { memoDestinations, memoryFailure,publicMemo } from '@/lib/memory-server';

export async function GET() {
  try {
    const { user, client } = await requireSession();
    const memos = await allRows<Memo>((from, to) => client.from('quick_memos').select(memoColumns).eq('user_id', user.id).order('created_at', { ascending: false }).order('id').range(from, to));
    return json({ memos: await memoDestinations(client, user.id, memos) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { client } = await requireSession(), body = object(await readBody(request)), id = uuid(body.id), input = parseMemo(body);
    const result = await client.rpc('create_quick_memo', { p_id: id, p_content: input.content });
    memoryFailure(result.error);
    return json({ memo: publicMemo(result.data) }, 201);
  } catch (error) { return failure(error); }
}
