import { requireSession, json, failure, assertOrigin, readBody, HttpError, allRows } from '@/lib/api';
import { parseWork, object, uuid, workColumns } from '@/lib/domain';

export async function GET() {
  try {
    const { user, client } = await requireSession();
    const works = await allRows((from, to) => client.from('works').select(workColumns).eq('user_id', user.id).order('updated_at', { ascending: false }).order('id').range(from, to));
    return json({ works });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), body = object(await readBody(request));
    const id = uuid(body.id), input = parseWork(body);
    const { data, error } = await client.from('works').upsert({ ...input, id, user_id: user.id }, { onConflict: 'id' }).select(workColumns).single();
    if (error) throw new HttpError(400, '작품을 저장하지 못했어요. 입력 내용을 확인하고 다시 시도해주세요.');
    return json({ work: data }, 201);
  } catch (error) { return failure(error); }
}
