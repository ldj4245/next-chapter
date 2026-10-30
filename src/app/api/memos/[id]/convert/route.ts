import { assertOrigin, failure, json, readBody, requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { parseMemoConversion, type Memo } from '@/lib/memory';
import { conversionResponse, memoryFailure } from '@/lib/memory-server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id), input = parseMemoConversion(await readBody(request));
    const result = await client.rpc('convert_quick_memo', { p_id: id, p_kind: input.kind, p_day: input.day, p_work_id: input.work_id, p_revision: input.revision });
    memoryFailure(result.error);
    return json(await conversionResponse(client, user.id, result.data as Memo));
  } catch (error) { return failure(error); }
}
