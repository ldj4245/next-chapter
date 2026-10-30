import { assertOrigin, failure, json, readBody, requireSession } from '@/lib/api';
import { object } from '@/lib/domain';
import { weekStart } from '@/lib/day-flow';
import { parseReview } from '@/lib/planner';
import { parseReflection } from '@/lib/reflection';
import { plannerFailure } from '@/lib/planner-server';
export async function GET(request:Request) {
  try {
    const {user,client} = await requireSession(), day = weekStart(new URL(request.url).searchParams.get('day'));
    const result = await client.from('planner_week_reviews').select('day,document,created_at,updated_at').eq('user_id',user.id).eq('day',day).maybeSingle();
    plannerFailure(result.error); return json({review:result.data});
  } catch(error) { return failure(error); }
}
export async function PUT(request:Request) {
  try {
    assertOrigin(request);
    const {user,client} = await requireSession(), body=object(await readBody(request)), day=weekStart(body.day);
    const input = parseReview(body), document=parseReflection(input.document);
    const result = await client.from('planner_week_reviews').upsert({user_id:user.id,day,document,updated_at:new Date().toISOString()},{onConflict:'user_id,day'}).select('day,document,created_at,updated_at').single();
    plannerFailure(result.error); return json({review:{...result.data,helped:'',hindered:'',gained:'',next_step:''}});
  } catch(error) { return failure(error); }
}
