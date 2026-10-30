import 'server-only';
import { HttpError } from './api';
import { serverClient } from './supabase/server';
import type { GoalInput, TaskInput } from './planner';
type Client = Awaited<ReturnType<typeof serverClient>>;
export function plannerFailure(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === '23503' || error.code === 'P0002' || error.code === '42501') throw new HttpError(404,'연결할 항목이나 기록을 찾을 수 없어요.');
  if (error.code === '23505') throw new HttpError(409,'이미 저장된 항목이 있어요. 목록을 확인해주세요.');
  if (error.code === '23514') throw new HttpError(400,'입력 내용과 목표 연결을 확인해주세요.');
  throw new Error(error.code ?? 'PLANNER_DATABASE_FAILED');
}
export async function checkTaskLinks(client: Client, userId: string, input: TaskInput) {
  for (const [table,id] of [['planner_goals',input.goal_id],['works',input.work_id]] as const) {
    if (!id) continue;
    const found = await client.from(table).select('id').eq('id',id).eq('user_id',userId).maybeSingle();
    plannerFailure(found.error);
    if (!found.data) throw new HttpError(404,'연결할 목표나 작품을 찾을 수 없어요.');
  }
}
export async function checkGoalParent(client: Client, userId: string, input: GoalInput, id: string) {
  if (input.parent_id) {
    if (input.parent_id === id) throw new HttpError(400,'자기 자신을 상위 목표로 연결할 수 없어요.');
    const found = await client.from('planner_goals').select('id').eq('id',input.parent_id).eq('user_id',userId).eq('period','long').maybeSingle();
    plannerFailure(found.error);
    if (!found.data) throw new HttpError(404,'연결할 장기 목표를 찾을 수 없어요.');
  }
  if (input.period !== 'long') {
    const children = await client.from('planner_goals').select('id').eq('parent_id',id).eq('user_id',userId).limit(1);
    plannerFailure(children.error);
    if (children.data?.length) throw new HttpError(409,'연결된 단기 목표를 먼저 분리한 뒤 기간을 바꿔주세요.');
  }
}
