import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { object,uuid } from '@/lib/domain';
import { parseTask,taskColumns } from '@/lib/planner';
import { checkTaskLinks,plannerFailure } from '@/lib/planner-server';
import { parseTaskSharing } from '@/lib/partner';
import { partnerFailure,sharedTaskConnection } from '@/lib/partner-server';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user,client } = await requireSession(), body = object(await readBody(request)), id = uuid(body.id);
    const input = parseTask({status:'planned',...body});
    await checkTaskLinks(client,user.id,input);
    const sharing=parseTaskSharing({shared:false,public_note:'',...body}), shared_connection_id=await sharedTaskConnection(client,user.id,sharing.shared,body.connection_id);
    const result = await client.from('daily_tasks').upsert({id,user_id:user.id,...input,...sharing,shared_connection_id},{onConflict:'id',ignoreDuplicates:true}).select(taskColumns).maybeSingle();
    if(result.error&&((result.error.code==='42501'&&sharing.shared)||['40P01','40001'].includes(result.error.code)))partnerFailure(result.error);else plannerFailure(result.error);
    const existing = result.data ? result : await client.from('daily_tasks').select(taskColumns).eq('user_id',user.id).eq('id',id).maybeSingle();
    plannerFailure(existing.error);
    if (!existing.data) throw new HttpError(404,'할 일을 찾을 수 없어요.');
    return json({task:existing.data},201);
  } catch (error) { return failure(error); }
}
