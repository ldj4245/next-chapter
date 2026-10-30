import { assertOrigin,failure,json,readBody,requireSession } from '@/lib/api';
import { object } from '@/lib/domain';
import { resourceMetadata } from '@/lib/resource-metadata';
export const runtime='nodejs';
export async function POST(request:Request) {
  try { assertOrigin(request);await requireSession();const body=object(await readBody(request));return json(await resourceMetadata(body.url)); }
  catch(error){return failure(error);}
}
