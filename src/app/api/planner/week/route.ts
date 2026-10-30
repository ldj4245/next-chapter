import { allRows, failure, json, requireSession } from '@/lib/api';
import { focusSessionColumns } from '@/lib/focus';
import { goalColumns, parseDay, plannerDay, plannerWeek, reviewColumns, taskColumns } from '@/lib/planner';

export async function GET(request: Request) {
  try {
    const { user, client } = await requireSession();
    const day = parseDay(new URL(request.url).searchParams.get('day') ?? plannerDay()), week = plannerWeek(day);
    const [tasks, sessions, reviews, goals] = await Promise.all([
      allRows((from, to) => client.from('daily_tasks').select(taskColumns).eq('user_id', user.id).gte('day', week[0]).lte('day', week[6]).order('day').order('created_at').order('id').range(from, to)),
      allRows((from, to) => client.from('reading_sessions').select(focusSessionColumns).eq('user_id', user.id).eq('status', 'completed').gte('reading_day', week[0]).lte('reading_day', week[6]).order('reading_day').order('started_at').order('id').range(from, to)),
      allRows((from, to) => client.from('daily_reviews').select(reviewColumns).eq('user_id', user.id).gte('day', week[0]).lte('day', week[6]).order('day').range(from, to)),
      allRows((from, to) => client.from('planner_goals').select(goalColumns).eq('user_id', user.id).order('created_at').order('id').range(from, to)),
    ]);
    return json({ week, tasks, sessions, reviews, goals });
  } catch (error) { return failure(error); }
}
