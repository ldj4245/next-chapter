import { requireSession, failure, json, assertOrigin, readBody, HttpError } from '@/lib/api';
import { catalogItem } from '@/lib/catalog';
import { object, parseWork, uuid, workColumns, KINDS, type Kind } from '@/lib/domain';
import { SOURCES, type Source } from '@/lib/catalog-types';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const {user,client}=await requireSession(),body=object(await readBody(request)),source=body.source as Source,kind=body.kind as Kind;
    if(!Object.hasOwn(SOURCES,source??'')||!Object.hasOwn(KINDS,kind??'')||typeof body.source_id!=='string'||body.source_id.length>120)throw new HttpError(400,'가져올 작품을 확인해주세요.');
    const find=()=>client.from('works').select(workColumns).eq('user_id',user.id).eq('source',source).eq('source_id',body.source_id).maybeSingle();
    const existing=await find();if(existing.error)throw new Error(existing.error.code);if(existing.data)return json({work:existing.data,existing:true});
    const item=await catalogItem(source,body.source_id,kind);
    const input=parseWork({...item,status:'planned',summary:'',rating:null,tags:[],moods:[],progress:null,started_on:null,finished_on:null});
    const saved=await client.from('works').insert({...input,id:body.id?uuid(body.id):crypto.randomUUID(),user_id:user.id}).select(workColumns).single();
    if(saved.error?.code==='23505'){const retry=await find();if(retry.data)return json({work:retry.data,existing:true});}
    if(saved.error)throw new Error(saved.error.code);
    return json({work:saved.data,existing:false},201);
  }catch(error){return failure(error);}
}
