import { allRows,assertOrigin,failure,HttpError,json,readBody,requireSession } from '@/lib/api';
import { object,uuid } from '@/lib/domain';
import { bookmarkColumns,parseResource,resourceColumns,resourceRevision,type ResourceBookmark } from '@/lib/resources';
import { resourceFailure } from '@/lib/resource-server';
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context) {
  try {
    const {user,client}=await requireSession(),id=uuid((await context.params).id);
    const result=await client.from('learning_resources').select(resourceColumns).eq('user_id',user.id).eq('id',id).maybeSingle();resourceFailure(result.error);
    if(!result.data)throw new HttpError(404,'자료를 찾을 수 없어요.');
    const bookmarks=await allRows<ResourceBookmark>((from,to)=>client.from('resource_bookmarks').select(bookmarkColumns).eq('user_id',user.id).eq('resource_id',id).order('seconds').order('id').range(from,to));
    return json({resource:result.data,bookmarks});
  }catch(error){return failure(error);}
}
export async function PATCH(request:Request,context:Context) {
  try {
    assertOrigin(request);const {client}=await requireSession(),id=uuid((await context.params).id),body=object(await readBody(request)),input=parseResource(body),revision=resourceRevision(body.revision);
    const result=await client.rpc('update_learning_resource',{p_id:id,p_revision:revision,p_url:input.url,p_title:input.title,p_kind:input.kind,p_status:input.status,p_tags:input.tags,p_memo:input.memo});
    resourceFailure(result.error);return json({resource:result.data});
  }catch(error){return failure(error);}
}
export async function DELETE(request:Request,context:Context) {
  try {
    assertOrigin(request);const {client}=await requireSession(),id=uuid((await context.params).id),body=object(await readBody(request)),revision=resourceRevision(body.revision);
    const result=await client.rpc('delete_learning_resource',{p_id:id,p_revision:revision});resourceFailure(result.error);return json({ok:true});
  }catch(error){return failure(error);}
}
