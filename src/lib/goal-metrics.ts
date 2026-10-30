import type { FocusSession } from './focus.ts';
import type { DayReview, Goal, Task } from './planner.ts';

export const GOAL_METRIC_UNITS = { minutes: '집중 시간', tasks: '완료한 할 일', pages: '읽은 쪽수' } as const;
export type GoalMetricUnit = keyof typeof GOAL_METRIC_UNITS;
export type GoalProgress = { unit: GoalMetricUnit | null; current: number; target: number | null; percent: number | null };
export type WeekData = { week: string[]; tasks: Task[]; sessions: FocusSession[]; reviews: DayReview[]; goals: Goal[] };

/** A goal includes its descendants once, even if malformed input contains a cycle. */
export function goalLineage(goals: Pick<Goal, 'id' | 'parent_id'>[], id: string): Set<string> {
  const ids = new Set([id]);
  for (const current of ids) {
    for (const goal of goals) if (goal.parent_id === current) ids.add(goal.id);
  }
  return ids;
}

function withinGoal(day: string | null, goal: Goal): boolean {
  return day !== null && (!goal.metric_start_day || day >= goal.metric_start_day) && (!goal.target_day || day <= goal.target_day);
}

/** Only finished, saved sessions count. Estimates and a running timer never count. */
export function goalProgress(goal: Goal, goals: Goal[], tasks: Task[], sessions: FocusSession[]): GoalProgress {
  const unit = goal.metric_unit ?? null;
  const target = typeof goal.metric_target === 'number' && Number.isFinite(goal.metric_target) && goal.metric_target > 0 ? goal.metric_target : null;
  if (!unit) return { unit: null, current: 0, target: null, percent: null };
  const ids = goalLineage(goals, goal.id);
  let current = 0, seconds = 0;
  const counted = new Set<string>();
  if (unit === 'tasks') {
    for (const task of tasks) {
      if (counted.has(task.id) || task.status !== 'completed' || !task.goal_id || !ids.has(task.goal_id) || !withinGoal(task.day, goal)) continue;
      counted.add(task.id);
      current += 1;
    }
  } else {
    for (const session of sessions) {
      // goal_id is captured when starting: later relinking a task must not move its history.
      if (counted.has(session.id) || session.status !== 'completed' || !session.goal_id || !ids.has(session.goal_id) || !withinGoal(session.reading_day, goal)) continue;
      counted.add(session.id);
      if (unit === 'minutes') seconds += Math.max(0, session.elapsed_seconds);
      else if (typeof session.start_page === 'number' && typeof session.end_page === 'number') current += Math.max(0, session.end_page - session.start_page);
    }
    if (unit === 'minutes') current = seconds / 60;
  }
  return { unit, current, target, percent: target === null ? null : Math.min(100, current / target * 100) };
}

export function goalAmount(unit: GoalMetricUnit, amount: number): string {
  if (unit !== 'minutes') return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(amount) + (unit === 'tasks' ? '개' : '쪽');
  const seconds = Math.max(0, Math.round(amount * 60));
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
  return minutes > 0 ? `${minutes.toLocaleString('ko-KR')}분${remainder ? ` ${remainder}초` : ''}` : remainder > 0 ? `${remainder}초` : '0분';
}
