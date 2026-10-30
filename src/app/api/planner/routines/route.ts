import { allRows, assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { object, uuid } from '@/lib/domain';
import { checkTaskLinks, plannerFailure } from '@/lib/planner-server';
import { parseRoutine, routineColumns, type Routine } from '@/lib/recurrence';

export async function GET() {
  try {
    const { user, client } = await requireSession();
    const routines = await allRows<Routine>((from, to) => client.from('planner_routines').select(routineColumns).eq('user_id', user.id).order('created_at').order('id').range(from, to));
    return json({ routines });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), body = object(await readBody(request)), id = uuid(body.id), input = parseRoutine(body);
    await checkTaskLinks(client, user.id, { ...input, day: input.start_day, status: 'planned', reason: '', reason_detail: '' });
    const result = await client.from('planner_routines').upsert({ id, user_id: user.id, ...input }, { onConflict: 'id', ignoreDuplicates: true }).select(routineColumns).maybeSingle();
    plannerFailure(result.error);
    const existing = result.data ? result : await client.from('planner_routines').select(routineColumns).eq('user_id', user.id).eq('id', id).maybeSingle();
    plannerFailure(existing.error);
    if (!existing.data) throw new HttpError(404, '반복 계획을 찾을 수 없어요.');
    return json({ routine: existing.data }, 201);
  } catch (error) { return failure(error); }
}
