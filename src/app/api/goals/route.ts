import { allRows,assertOrigin,failure,HttpError,json,readBody,requireSession } from '@/lib/api';
import { object,uuid } from '@/lib/domain';
import { goalColumns,parseGoal,reviewColumns,taskColumns } from '@/lib/planner';
import { checkGoalParent,plannerFailure } from '@/lib/planner-server';
import { focusSessionColumns } from '@/lib/focus';
export async function GET() {
  try {
    const {user,client}=await requireSession();
    const [goals,tasks,reviews,sessions]=await Promise.all([
      allRows((from,to)=>client.from('planner_goals').select(goalColumns).eq('user_id',user.id).order('created_at',{ascending:false}).order('id').range(from,to)),
      allRows((from,to)=>client.from('daily_tasks').select(taskColumns).eq('user_id',user.id).not('goal_id','is',null).order('day',{ascending:false}).order('created_at',{ascending:false}).order('id').range(from,to)),
      allRows((from,to)=>client.from('daily_reviews').select(reviewColumns).eq('user_id',user.id).order('day',{ascending:false}).range(from,to)),
      allRows((from,to)=>client.from('reading_sessions').select(focusSessionColumns).eq('user_id',user.id).eq('status','completed').not('goal_id','is',null).order('reading_day',{ascending:false}).order('id').range(from,to)),
    ]);
    return json({goals,tasks,reviews,sessions});
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const {user,client}=await requireSession(), body=object(await readBody(request)), id=uuid(body.id), input=parseGoal(body);
    await checkGoalParent(client,user.id,input,id);
    const result=await client.from('planner_goals').upsert({id,user_id:user.id,...input},{onConflict:'id',ignoreDuplicates:true}).select(goalColumns).maybeSingle();
    plannerFailure(result.error);
    const existing=result.data ? result : await client.from('planner_goals').select(goalColumns).eq('user_id',user.id).eq('id',id).maybeSingle();
    plannerFailure(existing.error);
    if (!existing.data) throw new HttpError(404,'목표를 찾을 수 없어요.');
    return json({goal:existing.data},201);
  } catch (error) { return failure(error); }
}
