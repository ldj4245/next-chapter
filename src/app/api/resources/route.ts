import { allRows,assertOrigin,failure,json,readBody,requireSession } from '@/lib/api';
import { object,uuid } from '@/lib/domain';
import { parseResource,resourceColumns,type LearningResource } from '@/lib/resources';
import { resourceFailure } from '@/lib/resource-server';
export async function GET() {
  try {
    const {user,client}=await requireSession();
    const resources=await allRows<LearningResource>((from,to)=>client.from('learning_resources').select(resourceColumns).eq('user_id',user.id).order('updated_at',{ascending:false}).order('id').range(from,to));
    return json({resources});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {
    assertOrigin(request);const {client}=await requireSession(),body=object(await readBody(request)),id=uuid(body.id),input=parseResource(body);
    const result=await client.rpc('create_learning_resource',{p_id:id,p_url:input.url,p_title:input.title,p_kind:input.kind,p_status:input.status,p_tags:input.tags,p_memo:input.memo});
    resourceFailure(result.error);return json(result.data,201);
  }catch(error){return failure(error);}
}
