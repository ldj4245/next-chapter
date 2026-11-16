import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { InputError, object } from '@/lib/domain';
import { weekStart } from '@/lib/day-flow';
import { parseReview } from '@/lib/planner';
import { parseReflection } from '@/lib/reflection';
import { plannerFailure } from '@/lib/planner-server';
export async function GET(request:Request) {
  try {
    const {user,client} = await requireSession(), day = weekStart(new URL(request.url).searchParams.get('day'));
    const result = await client.from('planner_week_reviews').select('day,document,revision,created_at,updated_at').eq('user_id',user.id).eq('day',day).maybeSingle();
    plannerFailure(result.error);
    const review = result.data ? { ...result.data, helped: '', hindered: '', gained: '', next_step: '' } : null;
    return json({ review });
  } catch(error) { return failure(error); }
}
export async function PUT(request:Request) {
  try {
    assertOrigin(request);
    const {client} = await requireSession(), body=object(await readBody(request)), day=weekStart(body.day);
    const revision = body.revision ?? 0;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
      throw new InputError({ revision: '주간 회고의 저장 상태를 다시 확인해주세요.' });
    }
    const input = parseReview(body), document=parseReflection(input.document);
    const result = await client.rpc('save_week_review', { p_day: day, p_expected_revision: revision, p_document: document });
    if (result.error?.code === 'P0001' && result.error.message === 'REVIEW_CONFLICT') {
      throw new HttpError(409, '다른 곳에서 주간 회고가 바뀌었어요. 입력한 초안은 유지되니 최신 내용과 합쳐주세요.');
    }
    plannerFailure(result.error);
    return json({review:{...(result.data as Record<string,unknown>),helped:'',hindered:'',gained:'',next_step:''}});
  } catch(error) { return failure(error); }
}
