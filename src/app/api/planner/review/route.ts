import { assertOrigin,failure,HttpError,json,readBody,requireSession } from '@/lib/api';
import { InputError,object } from '@/lib/domain';
import { parseDay,parseReview,reviewColumns } from '@/lib/planner';
import { plannerFailure } from '@/lib/planner-server';
export async function GET(request:Request){
  try{
    const {user,client}=await requireSession(),day=parseDay(new URL(request.url).searchParams.get('day'));
    const result=await client.from('daily_reviews').select(reviewColumns).eq('user_id',user.id).eq('day',day).maybeSingle();
    plannerFailure(result.error);return json({review:result.data});
  }catch(error){return failure(error);}
}
export async function PUT(request: Request) {
  try {
    assertOrigin(request);
    const {user,client}=await requireSession(), body=object(await readBody(request)), day=parseDay(body.day), input=parseReview(body);
    const revision=body.revision??0;
    if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)throw new InputError({revision:'회고의 저장 상태를 다시 확인해주세요.'});
    let document=input.document??null;
    if(!Object.hasOwn(body,'document')&&revision>0){
      const current=await client.from('daily_reviews').select('document').eq('user_id',user.id).eq('day',day).maybeSingle();plannerFailure(current.error);document=current.data?.document??null;
    }
    const result=await client.rpc('save_daily_review',{p_day:day,p_expected_revision:revision,p_helped:input.helped,p_hindered:input.hindered,p_gained:input.gained,p_next_step:input.next_step,p_document:document});
    if(result.error?.code==='P0001'&&result.error.message==='REVIEW_CONFLICT')throw new HttpError(409,'다른 곳에서 회고가 바뀌었어요. 입력한 초안은 유지되니 최신 내용과 합쳐주세요.');
    plannerFailure(result.error);
    return json({review:result.data});
  } catch (error) { return failure(error); }
}
