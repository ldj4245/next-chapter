import { requireSession, failure, json, HttpError } from '@/lib/api';
import { searchCatalog } from '@/lib/catalog';
import { KINDS, type Kind } from '@/lib/domain';
export async function GET(request: Request) {
  try {
    await requireSession();
    const params=new URL(request.url).searchParams, query=(params.get('q')??'').trim(), kind=params.get('kind') as Kind;
    if(!Object.hasOwn(KINDS,kind??'')||query.length<2||query.length>100)throw new HttpError(400,'종류를 선택하고 검색어를 2~100자로 입력해주세요.');
    return json(await searchCatalog(query,kind));
  } catch(error){return failure(error);}
}
