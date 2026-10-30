import { assertOrigin,failure,HttpError,json,readBody,requireSession } from '@/lib/api';
import { object,uuid } from '@/lib/domain';
import { goalColumns,parseGoal } from '@/lib/planner';
import { checkGoalParent,plannerFailure } from '@/lib/planner-server';
type Context={params:Promise<{id:string}>};
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const {user,client}=await requireSession(), id=uuid((await context.params).id);
    const found=await client.from('planner_goals').select(goalColumns).eq('user_id',user.id).eq('id',id).maybeSingle();
    plannerFailure(found.error);
    if (!found.data) throw new HttpError(404,'목표를 찾을 수 없어요.');
    const input=parseGoal({...found.data,...object(await readBody(request))});
    await checkGoalParent(client,user.id,input,id);
    const result=await client.from('planner_goals').update(input).eq('user_id',user.id).eq('id',id).select(goalColumns).maybeSingle();
    plannerFailure(result.error);
    if (!result.data) throw new HttpError(404,'목표를 찾을 수 없어요.');
    return json({goal:result.data});
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const {user,client}=await requireSession(), id=uuid((await context.params).id);
    const result=await client.from('planner_goals').delete().eq('user_id',user.id).eq('id',id).select('id');
    plannerFailure(result.error);
    if (!result.data?.length) throw new HttpError(404,'목표를 찾을 수 없어요.');
    return json({deleted:true});
  } catch (error) { return failure(error); }
}
