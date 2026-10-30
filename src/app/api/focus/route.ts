import { allRows, assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { focusSessionColumns, parseFocusStart } from '@/lib/focus';
import { parseDay } from '@/lib/planner';
import { readingDay } from '@/lib/reading';

export async function GET(request: Request) {
  try {
    const { user, client } = await requireSession();
    const day = parseDay(new URL(request.url).searchParams.get('day') ?? readingDay());
    const [active, sessions] = await Promise.all([
      client.from('reading_sessions').select(focusSessionColumns).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
      allRows((from, to) => client.from('reading_sessions').select(focusSessionColumns).eq('user_id', user.id).eq('status', 'completed').eq('reading_day', day).order('finished_at', { ascending: false }).order('id').range(from, to)),
    ]);
    if (active.error) throw new Error(active.error.code);
    return json({ server_now: new Date().toISOString(), day, session: active.data, sessions });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), input = parseFocusStart(await readBody(request));
    const task = await client.from('daily_tasks').select('id').eq('user_id', user.id).eq('id', input.task_id).maybeSingle();
    if (task.error) throw new Error(task.error.code);
    if (!task.data) throw new HttpError(404, '내 할 일을 찾을 수 없어요. 목록을 다시 확인해주세요.');
    const result = await client.rpc('start_focus', { p_id: input.id, p_task_id: input.task_id, p_target_seconds: input.target_seconds });
    if (result.error?.code === 'P0002') throw new HttpError(404, '할 일이나 연결된 기록을 찾을 수 없어요.');
    if (result.error?.code === '23514') throw new HttpError(409, '집중 기록의 상태를 다시 확인해주세요.');
    if (result.error?.code === '42501' || result.error?.code === '23505') throw new HttpError(409, '다른 기록에서 사용한 요청이에요. 다시 시작해주세요.');
    if (result.error) throw new Error(result.error.code);
    return json({ session: result.data, server_now: new Date().toISOString() }, 201);
  } catch (error) { return failure(error); }
}
