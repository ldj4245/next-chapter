import { allRows, failure, json, requireSession } from '@/lib/api';
import { goalColumns, taskColumns, reviewColumns, parseDay, plannerDay, plannerWeek } from '@/lib/planner';
import { plannerFailure } from '@/lib/planner-server';
import {photoColumns,publicPhoto,type PhotoRow} from '@/lib/photo-server';
export async function GET(request: Request) {
  try {
    const { user,client } = await requireSession();
    const today = plannerDay(), day = parseDay(new URL(request.url).searchParams.get('day') ?? today), week = plannerWeek(day);
    const [tasks,goals,works,review,weekTasks,reviewedDays,preferences,photos] = await Promise.all([
      allRows((from,to) => client.from('daily_tasks').select(taskColumns).eq('user_id',user.id).eq('day',day).order('important',{ascending:false}).order('created_at').order('id').range(from,to)),
      allRows((from,to) => client.from('planner_goals').select(goalColumns).eq('user_id',user.id).order('created_at',{ascending:false}).order('id').range(from,to)),
      allRows((from,to) => client.from('works').select('id,title').eq('user_id',user.id).order('title').order('id').range(from,to)),
      client.from('daily_reviews').select(reviewColumns).eq('user_id',user.id).eq('day',day).maybeSingle(),
      allRows((from,to) => client.from('daily_tasks').select('day,status').eq('user_id',user.id).gte('day',week[0]).lte('day',week[6]).order('day').order('id').range(from,to)),
      client.from('daily_reviews').select('day').eq('user_id',user.id).gte('day',week[0]).lte('day',week[6]),
      client.from('planner_day_preferences').select('available_minutes').eq('user_id',user.id).eq('day',day).maybeSingle(),
      allRows((from,to)=>client.from('task_photos').select(photoColumns+',daily_tasks!inner(day)').eq('user_id',user.id).eq('state','ready').eq('daily_tasks.day',day).order('created_at').order('id').range(from,to)),
    ]);
    plannerFailure(review.error); plannerFailure(reviewedDays.error);plannerFailure(preferences.error);
    const chunks = Array.from({length:Math.ceil(tasks.length/100)},(_,index) => tasks.slice(index*100,index*100+100).map(task => task.id));
    const carried = (await Promise.all(chunks.map(ids => allRows((from,to) => client.from('daily_tasks').select('id,day,carried_from_id').eq('user_id',user.id).in('carried_from_id',ids).order('id').range(from,to))))).flat();
    return json({ today,day,week,tasks,goals,works,review:review.data,weekTasks,reviewedDays:(reviewedDays.data ?? []).map(row=>row.day),carried,available_minutes:preferences.data?.available_minutes??null,photos:(photos as unknown as PhotoRow[]).map(publicPhoto) });
  } catch (error) { return failure(error); }
}
