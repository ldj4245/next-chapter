import { assertOrigin,failure,HttpError,json,readBody,requireSession } from '@/lib/api';
import { parseBatchPlanning } from '@/lib/batch-planning';
import { plannerFailure } from '@/lib/planner-server';
export async function POST(request:Request){
  try{
    assertOrigin(request);const {client}=await requireSession(),input=parseBatchPlanning(await readBody(request));
    const result=await client.rpc('defer_daily_tasks',{p_ids:input.ids,p_day:input.day,p_source_day:input.source_day});
    if(result.error?.message==='BATCH_TARGET_CHANGED')throw new HttpError(409,'이미 다른 날짜로 이어간 할 일이 있어요. 새로 확인한 뒤 다시 선택해주세요.');
    if(result.error?.message==='BATCH_TASK_CHANGED')throw new HttpError(409,'선택한 할 일의 상태가 바뀌었어요. 새로 확인한 뒤 다시 선택해주세요.');
    plannerFailure(result.error);return json({items:result.data});
  }catch(error){return failure(error);}
}
