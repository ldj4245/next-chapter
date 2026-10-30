import { requireSession, json, failure, assertOrigin, readBody, HttpError, allRows } from '@/lib/api';
import { parseWork, object, uuid, workColumns, noteColumns } from '@/lib/domain';
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const work = await client.from('works').select(workColumns).eq('id', id).eq('user_id', user.id).maybeSingle();
    if (work.error) throw new Error(work.error.code);
    if (!work.data) throw new HttpError(404, '작품을 찾을 수 없어요.');
    const notes = await allRows((from, to) => client.from('notes').select(noteColumns).eq('work_id', id).eq('user_id', user.id).order('created_at', { ascending: false }).order('id').range(from, to));
    return json({ work: work.data, notes });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const existing = await client.from('works').select(workColumns).eq('id', id).eq('user_id', user.id).maybeSingle();
    if (existing.error) throw new Error(existing.error.code);
    if (!existing.data) throw new HttpError(404, '작품을 찾을 수 없어요.');
    const body=object(await readBody(request)),input = parseWork({ ...existing.data, ...body });
    if(Object.hasOwn(body,'expected_summary')&&(typeof body.expected_summary!=='string'||body.expected_summary.length>300||body.expected_summary.includes('\u0000')))throw new HttpError(400,'저장된 한줄평을 다시 확인해주세요.');
    const changed=Object.fromEntries(Object.entries(input).filter(([key])=>Object.hasOwn(body,key)));
    if(Object.hasOwn(body,'kind')&&input.kind==='movie')changed.progress=null;
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(body.status==='completed'&&existing.data.status!=='completed'&&!existing.data.finished_on&&!Object.hasOwn(body,'finished_on')&&(!existing.data.started_on||existing.data.started_on<=today))changed.finished_on=today;
    if(!Object.keys(changed).length)return json({work:existing.data});
    let update=client.from('works').update(changed).eq('id', id).eq('user_id', user.id);
    if(Object.hasOwn(body,'summary')&&typeof body.expected_summary==='string')update=update.eq('summary',body.expected_summary);
    const { data, error } = await update.select(workColumns).maybeSingle();
    if (error) throw new HttpError(400, '변경 내용을 저장하지 못했어요. 입력을 확인하고 다시 시도해주세요.');
    if (!data) throw new HttpError(Object.hasOwn(body,'expected_summary')?409:404,Object.hasOwn(body,'expected_summary')?'다른 곳에서 한줄평이 바뀌었어요. 수정 중인 정보는 유지되니 최신 내용을 확인해주세요.':'작품을 찾을 수 없어요.');
    return json({ work: data });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), id = uuid((await context.params).id);
    const { data, error } = await client.from('works').delete().eq('id', id).eq('user_id', user.id).select('id');
    if (error) throw new Error(error.code);
    if (!data?.length) throw new HttpError(404, '작품을 찾을 수 없어요.');
    return json({ deleted: true });
  } catch (error) { return failure(error); }
}
