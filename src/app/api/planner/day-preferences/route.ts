import { assertOrigin, failure, json, readBody, requireSession } from '@/lib/api';
import { parseDayPreferences } from '@/lib/day-flow';
import { plannerFailure } from '@/lib/planner-server';
export async function PUT(request: Request) {
  try {
    assertOrigin(request);
    const {user,client} = await requireSession(), input = parseDayPreferences(await readBody(request));
    const result = await client.from('planner_day_preferences').upsert({user_id:user.id,...input},{onConflict:'user_id,day'}).select('day,available_minutes').single();
    plannerFailure(result.error); return json({preferences:result.data});
  } catch(error) { return failure(error); }
}
