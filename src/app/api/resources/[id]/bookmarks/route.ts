import { assertOrigin,failure,HttpError,json,readBody,requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { bookmarkURL,parseBookmark } from '@/lib/resources';
import { resourceFailure } from '@/lib/resource-server';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    assertOrigin(request);const {user,client}=await requireSession(),resourceId=uuid((await context.params).id),input=parseBookmark(await readBody(request));
    const found=await client.from('learning_resources').select('url,kind').eq('user_id',user.id).eq('id',resourceId).maybeSingle();resourceFailure(found.error);
    if(!found.data)throw new HttpError(404,'자료를 찾을 수 없어요.');
    if(found.data.kind!=='video'||!bookmarkURL(found.data.url,input.seconds))throw new HttpError(400,'영상 구간은 YouTube·Vimeo 주소에서 저장할 수 있어요.');
    const result=await client.rpc('create_resource_bookmark',{p_id:input.id,p_resource_id:resourceId,p_seconds:input.seconds,p_label:input.label});resourceFailure(result.error);
    return json({bookmark:result.data},201);
  }catch(error){return failure(error);}
}
