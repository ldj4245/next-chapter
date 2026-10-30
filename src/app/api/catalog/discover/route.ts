import { requireSession, failure, json, HttpError } from '@/lib/api';
import { discoverCatalog } from '@/lib/catalog';
import { KINDS, type Kind } from '@/lib/domain';
export async function GET(request: Request) {
  try { await requireSession();const kind=(new URL(request.url).searchParams.get('kind')??'movie') as Kind;if(!Object.hasOwn(KINDS,kind))throw new HttpError(400,'작품 종류를 확인해주세요.');return json(await discoverCatalog(kind)); }
  catch(error){return failure(error);}
}
