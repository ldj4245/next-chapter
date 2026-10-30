import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { object, uuid } from '@/lib/domain';
import { checkTaskLinks, plannerFailure } from '@/lib/planner-server';
import { parseRoutine, routineColumns } from '@/lib/recurrence';

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const found = await client.from('planner_routines').select(routineColumns).eq('user_id', user.id).eq('id', id).maybeSingle();
    plannerFailure(found.error);
    if (!found.data) throw new HttpError(404, '반복 계획을 찾을 수 없어요.');
    const input = parseRoutine({ ...found.data, ...object(await readBody(request)) });
    await checkTaskLinks(client, user.id, { ...input, day: input.start_day, status: 'planned', reason: '', reason_detail: '' });
    const result = await client.from('planner_routines').update(input).eq('user_id', user.id).eq('id', id).select(routineColumns).maybeSingle();
    plannerFailure(result.error);
    if (!result.data) throw new HttpError(404, '반복 계획을 찾을 수 없어요.');
    return json({ routine: result.data });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const result = await client.from('planner_routines').delete().eq('user_id', user.id).eq('id', id).select('id');
    plannerFailure(result.error);
    if (!result.data?.length) throw new HttpError(404, '반복 계획을 찾을 수 없어요.');
    return json({ deleted: true });
  } catch (error) { return failure(error); }
}
