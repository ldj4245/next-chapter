import { assertOrigin,failure,HttpError,json,requireSession } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { resourceFailure } from '@/lib/resource-server';
export async function DELETE(request:Request,context:{params:Promise<{id:string;bookmarkId:string}>}) {
  try {
    assertOrigin(request);const {user,client}=await requireSession(),params=await context.params,id=uuid(params.id),bookmarkId=uuid(params.bookmarkId);
    const result=await client.from('resource_bookmarks').delete().eq('user_id',user.id).eq('resource_id',id).eq('id',bookmarkId).select('id').maybeSingle();resourceFailure(result.error);
    if(!result.data)throw new HttpError(404,'영상 구간을 찾을 수 없어요.');return json({ok:true});
  }catch(error){return failure(error);}
}
