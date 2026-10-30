import { assertOrigin,failure,HttpError,json,readBody,requireSession } from '@/lib/api';
import { object,uuid } from '@/lib/domain';
import { parseDay,parseTask,parseTaskState,taskColumns,type TaskInput } from '@/lib/planner';
import { checkTaskLinks,plannerFailure } from '@/lib/planner-server';
import { parseTaskSharing } from '@/lib/partner';
import { partnerFailure,sharedTaskConnection } from '@/lib/partner-server';
import {parsePhotoSharing} from '@/lib/photos';
import {cleanupPhotoFiles,taskPhotoPaths,removePhotoFiles} from '@/lib/photo-server';
type Context = {params:Promise<{id:string}>};
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const {user,client} = await requireSession(), id=uuid((await context.params).id), body=object(await readBody(request));
    const found=await client.from('daily_tasks').select(taskColumns).eq('user_id',user.id).eq('id',id).maybeSingle();
    plannerFailure(found.error);
    if (!found.data) throw new HttpError(404,'할 일을 찾을 수 없어요.');
    if (body.action === 'defer') {
      const day=parseDay(body.day), newId=uuid(body.new_id);
      if (day<=found.data.day) throw new HttpError(400,'원래 계획보다 이후 날짜를 선택해주세요.');
      const state=parseTaskState({status:'not_done',reason:body.reason ?? found.data.reason,reason_detail:body.reason_detail ?? found.data.reason_detail});
      const result=await client.rpc('defer_daily_task',{p_id:id,p_new_id:newId,p_day:day,p_reason:state.reason,p_detail:state.reason_detail});
      plannerFailure(result.error);
      const original=await client.from('daily_tasks').select(taskColumns).eq('user_id',user.id).eq('id',id).single();
      plannerFailure(original.error);
      const carried=Object.fromEntries(taskColumns.split(',').map(column=>[column,result.data[column]]));
      return json({task:original.data,carried});
    }
    if (body.action !== 'state' && body.action !== 'edit' && body.action !== 'share' && body.action!=='photo-share') throw new HttpError(400,'할 일 변경 방식을 확인해주세요.');
    let input: Partial<TaskInput> & {shared?:boolean;public_note?:string;shared_connection_id?:string|null;photos_shared?:boolean;photo_connection_id?:string|null};
    if (body.action === 'state') input=parseTaskState(body);
    else if(body.action==='share') {
      const sharing=parseTaskSharing({...found.data,...body});
      input={...sharing,shared_connection_id:await sharedTaskConnection(client,user.id,sharing.shared,body.connection_id)};
    }
    else if(body.action==='photo-share') {
      const sharing=parsePhotoSharing(body),pair=await sharedTaskConnection(client,user.id,sharing.photos_shared,body.connection_id);
      if(sharing.photos_shared&&(!found.data.shared||found.data.shared_connection_id!==pair))throw new HttpError(409,'먼저 이 할 일을 함께 확인하도록 선택해주세요.');
      input={...sharing,photo_connection_id:pair};
    }
    else {
      const edited=parseTask({...found.data,...body});
      if (edited.day !== found.data.day) throw new HttpError(400,'날짜를 바꾸려면 다른 날 이어가기를 사용해주세요.');
      await checkTaskLinks(client,user.id,edited);
      input=edited;
      if(Object.hasOwn(body,'shared')||Object.hasOwn(body,'public_note')) {
        const sharing=parseTaskSharing({...found.data,...body});
        input={...input,...sharing,shared_connection_id:await sharedTaskConnection(client,user.id,sharing.shared,body.connection_id)};
      }
    }
    const result=await client.from('daily_tasks').update(input).eq('user_id',user.id).eq('id',id).select(taskColumns).maybeSingle();
    if(result.error&&((result.error.code==='42501'&&(input.shared||input.photos_shared))||['40P01','40001'].includes(result.error.code)))partnerFailure(result.error);else plannerFailure(result.error);
    if (!result.data) throw new HttpError(404,'할 일을 찾을 수 없어요.');
    return json({task:result.data});
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const {user,client}=await requireSession(), id=uuid((await context.params).id);
    const paths=await taskPhotoPaths(client,user.id,id);
    const result=await client.from('daily_tasks').delete().eq('user_id',user.id).eq('id',id).select('id');
    plannerFailure(result.error);
    if (!result.data?.length) throw new HttpError(404,'할 일을 찾을 수 없어요.');
    try{await removePhotoFiles(client,paths);await cleanupPhotoFiles(client,user.id);}catch{console.error('Task photo cleanup deferred; deletion outbox retained.');}
    return json({deleted:true});
  } catch (error) { return failure(error); }
}
