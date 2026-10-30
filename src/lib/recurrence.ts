import { InputError, object, type Issues } from './domain.ts';
import { parseDay, parseTask, plannerDay } from './planner.ts';

export const WEEKDAYS = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' } as const;
export type RoutineInput = {
  title: string; weekdays: number[]; start_day: string; end_day: string | null;
  active: boolean; minutes: number | null; important: boolean;
  goal_id: string | null; work_id: string | null; note: string;
};
export type Routine = RoutineInput & { id: string; created_at: string; updated_at: string };
export const routineColumns = 'id,title,weekdays,start_day,end_day,active,minutes,important,goal_id,work_id,note,created_at,updated_at';

export function parseRoutine(value: unknown): RoutineInput {
  const input = object(value), issues: Issues = {};
  let start_day = '';
  try { start_day = parseDay(input.start_day); } catch { issues.start_day = '올바른 시작 날짜를 선택해주세요.'; }
  let end_day: string | null = null;
  if (input.end_day != null && input.end_day !== '') {
    try { end_day = parseDay(input.end_day); } catch { issues.end_day = '올바른 종료 날짜를 선택해주세요.'; }
  }
  if (end_day && start_day && end_day < start_day) issues.end_day = '종료 날짜는 시작 날짜와 같거나 이후여야 해요.';
  const weekdays = Array.isArray(input.weekdays) ? input.weekdays : [];
  if (!weekdays.length || weekdays.length > 7 || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(weekdays).size !== weekdays.length) {
    issues.weekdays = '반복할 요일을 하나 이상 선택해주세요.';
  }
  const active = input.active ?? true;
  if (typeof active !== 'boolean') issues.active = '반복 여부를 확인해주세요.';
  if (Object.keys(issues).length) throw new InputError(issues);
  const task = parseTask({ ...input, day: start_day, status: 'planned', reason: '', reason_detail: '' });
  return { title: task.title, weekdays: [...weekdays].sort((a, b) => a - b), start_day, end_day, active: active as boolean,
    minutes: task.minutes, important: task.important, goal_id: task.goal_id, work_id: task.work_id, note: task.note };
}

// A stored Korean calendar day is already a local date; do not convert it from UTC.
export function routineWeekday(day: string): number {
  const valid = parseDay(day), weekday = new Date(valid + 'T00:00:00Z').getUTCDay();
  return weekday === 0 ? 7 : weekday;
}
export function routineMatches(routine: RoutineInput, day: string): boolean {
  const valid = parseDay(day);
  return routine.active && valid >= routine.start_day && (!routine.end_day || valid <= routine.end_day) && routine.weekdays.includes(routineWeekday(valid));
}
export function parseRoutineDay(value: unknown, today = plannerDay()): string {
  const day = parseDay(value);
  if (day < today) throw new InputError({ day: '지난 날짜의 계획에는 반복 할 일을 새로 추가할 수 없어요.' });
  return day;
}
