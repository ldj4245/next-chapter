import { assertOrigin,failure,HttpError,json,readBody,requireSession } from '@/lib/api';
import { uuid,workColumns } from '@/lib/domain';
import { parseWorkSummary } from '@/lib/work-summary';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  try{
    assertOrigin(request);const {client}=await requireSession(),id=uuid((await context.params).id),input=parseWorkSummary(await readBody(request));
    const result=await client.rpc('save_work_summary',{p_id:id,p_summary:input.summary,p_expected_summary:input.expected_summary});
    if(result.error?.code==='P0001'&&result.error.message==='SUMMARY_CONFLICT')throw new HttpError(409,'다른 곳에서 한줄평이 바뀌었어요. 작성한 글은 그대로 남아 있어요.');
    if(['P0002','42501'].includes(result.error?.code??''))throw new HttpError(404,'작품을 찾을 수 없어요.');
    if(result.error?.code==='23514')throw new HttpError(400,'한줄평은 300자 이내로 남겨주세요.');
    if(result.error)throw new Error(result.error.code);
    const row=result.data as Record<string,unknown>;
    return json({work:Object.fromEntries(workColumns.split(',').map(key=>[key,row[key]]))});
  }catch(error){return failure(error);}
}
