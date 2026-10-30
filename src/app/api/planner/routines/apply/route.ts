import { assertOrigin, failure, json, readBody, requireSession } from '@/lib/api';
import { object } from '@/lib/domain';
import { plannerFailure } from '@/lib/planner-server';
import { parseRoutineDay } from '@/lib/recurrence';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { client } = await requireSession(), day = parseRoutineDay(object(await readBody(request)).day);
    const result = await client.rpc('apply_planner_routines', { p_day: day });
    plannerFailure(result.error);
    return json({ tasks: result.data ?? [] });
  } catch (error) { return failure(error); }
}
