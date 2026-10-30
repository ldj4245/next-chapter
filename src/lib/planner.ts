import { InputError, object, uuid, type Issues } from './domain.ts';
import { readingDay, readingWeek } from './reading.ts';
import { parseReflection, type ReflectionDocument } from './reflection.ts';
import type { FocusSession } from './focus.ts';
import { GOAL_METRIC_UNITS, type GoalMetricUnit } from './goal-metrics.ts';
import type {TaskPhoto} from './photos.ts';

export const TASK_STATES = { planned: '예정', partial: '일부 진행', completed: '완료', not_done: '하지 못함' } as const;
export const REASONS = { time: '시간 부족', energy: '피로·컨디션', overload: '계획 과다', difficulty: '예상보다 어려움', priority: '우선순위 변경', other: '다른 이유' } as const;
export const GOAL_PERIODS = { short: '단기 목표', long: '장기 목표' } as const;
export const GOAL_STATES = { active: '진행 중', completed: '완료', paused: '잠시 멈춤' } as const;
export type TaskState = keyof typeof TASK_STATES;
export type Reason = '' | keyof typeof REASONS;
export type GoalInput = { title: string; period: keyof typeof GOAL_PERIODS; status: keyof typeof GOAL_STATES; motivation: string; target_day: string | null; parent_id: string | null; metric_unit: GoalMetricUnit | null; metric_target: number | null; metric_start_day: string | null };
export type Goal = GoalInput & { id: string; created_at: string; updated_at: string };
export type TaskInput = { day: string; title: string; status: TaskState; important: boolean; minutes: number | null; goal_id: string | null; work_id: string | null; reason: Reason; reason_detail: string; note: string };
export type Task = TaskInput & { id: string; carried_from_id: string | null; routine_id?: string | null; shared?:boolean;public_note?:string;shared_connection_id?:string|null;photos_shared?:boolean;photo_connection_id?:string|null;completed_at?:string|null; created_at: string; updated_at: string };
export type ReviewInput = { helped: string; hindered: string; gained: string; next_step: string; document?: ReflectionDocument | null };
export type DayReview = ReviewInput & { day: string; revision?:number; created_at: string; updated_at: string };
export type WorkOption = { id: string; title: string };
export type PlanData = { today: string; day: string; week: string[]; tasks: Task[]; weekTasks: Pick<Task,'day'|'status'>[]; reviewedDays: string[]; review: DayReview | null; goals: Goal[]; works: WorkOption[]; carried: Pick<Task,'id'|'day'|'carried_from_id'>[]; available_minutes?:number|null;photos?:TaskPhoto[] };
export type GoalsData = { goals: Goal[]; tasks: Task[]; reviews: DayReview[]; sessions: FocusSession[] };
export const goalColumns = 'id,title,period,status,motivation,target_day,parent_id,metric_unit,metric_target,metric_start_day,created_at,updated_at';
export const taskColumns = 'id,day,title,status,important,minutes,goal_id,work_id,reason,reason_detail,note,carried_from_id,routine_id,shared,public_note,shared_connection_id,photos_shared,photo_connection_id,completed_at,created_at,updated_at';
export const reviewColumns = 'day,helped,hindered,gained,next_step,document,revision,created_at,updated_at';
export const emptyReview: ReviewInput = { helped: '', hindered: '', gained: '', next_step: '' };
export const plannerDay = readingDay;
export const plannerWeek = readingWeek;

export function parseDay(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') throw new InputError({ day: '1900~2100년 사이의 날짜를 선택해주세요.' });
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new InputError({ day: '올바른 날짜를 선택해주세요.' });
  return value;
}
export function shiftDay(day: string, offset: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0,10);
}
export function dayLabel(day: string, weekday = true): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', ...(weekday ? { weekday: 'long' as const } : {}) }).format(new Date(day + 'T00:00:00+09:00'));
}
function text(value: unknown, field: string, max: number, issues: Issues, required = false): string {
  if (value != null && typeof value !== 'string') issues[field] = '문자로 입력해주세요.';
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) issues[field] = '내용을 입력해주세요.';
  if (result.length > max) issues[field] = max + '자 이내로 입력해주세요.';
  return result;
}
function link(value: unknown, field: string, issues: Issues): string | null {
  if (value == null || value === '') return null;
  try { return uuid(value); } catch { issues[field] = '연결할 항목을 확인해주세요.'; return null; }
}
export function parseTaskState(value: unknown) {
  const input = object(value), issues: Issues = {};
  const status = input.status as TaskState;
  if (!Object.hasOwn(TASK_STATES,status ?? '')) issues.status = '실행 상태를 선택해주세요.';
  const reason = (input.reason ?? '') as Reason;
  if (reason !== '' && !Object.hasOwn(REASONS,reason)) issues.reason = '이유를 선택해주세요.';
  const reason_detail = text(input.reason_detail,'reason_detail',2000,issues);
  if (Object.keys(issues).length) throw new InputError(issues);
  return { status, reason: status === 'partial' || status === 'not_done' ? reason : '' as Reason, reason_detail: status === 'partial' || status === 'not_done' ? reason_detail : '' };
}
export function parseTask(value: unknown): TaskInput {
  const input = object(value), issues: Issues = {};
  const day = parseDay(input.day), state = parseTaskState(input);
  const title = text(input.title,'title',200,issues,true), note = text(input.note,'note',2000,issues);
  const important = input.important ?? false;
  if (typeof important !== 'boolean') issues.important = '중요 표시를 확인해주세요.';
  let minutes: number | null = null;
  if (input.minutes != null && input.minutes !== '') {
    minutes = typeof input.minutes === 'number' ? input.minutes : typeof input.minutes === 'string' ? Number(input.minutes) : NaN;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) issues.minutes = '예상 시간은 1~1440분의 정수로 입력해주세요.';
  }
  const goal_id = link(input.goal_id,'goal_id',issues), work_id = link(input.work_id,'work_id',issues);
  if (Object.keys(issues).length) throw new InputError(issues);
  return { day,title,note,important: important as boolean,minutes,goal_id,work_id,...state };
}
export function parseGoal(value: unknown): GoalInput {
  const input = object(value), issues: Issues = {};
  const title = text(input.title,'title',160,issues,true), motivation = text(input.motivation,'motivation',3000,issues);
  const period = input.period as GoalInput['period'], status = (input.status ?? 'active') as GoalInput['status'];
  if (!Object.hasOwn(GOAL_PERIODS,period ?? '')) issues.period = '목표 기간을 선택해주세요.';
  if (!Object.hasOwn(GOAL_STATES,status ?? '')) issues.status = '목표 상태를 선택해주세요.';
  const parent_id = link(input.parent_id,'parent_id',issues);
  if (period === 'long' && parent_id) issues.parent_id = '장기 목표에는 상위 목표를 연결할 수 없어요.';
  let target_day: string | null = null;
  if (input.target_day != null && input.target_day !== '') {
    try { target_day=parseDay(input.target_day); } catch { issues.target_day='올바른 목표 날짜를 선택해주세요.'; }
  }
  const metric_unit = input.metric_unit == null || input.metric_unit === '' ? null : input.metric_unit as GoalMetricUnit;
  if (metric_unit !== null && !Object.hasOwn(GOAL_METRIC_UNITS, metric_unit)) issues.metric_unit = '측정할 기준을 선택해주세요.';
  let metric_target: number | null = null, metric_start_day: string | null = null;
  if (input.metric_target != null && input.metric_target !== '') {
    metric_target = typeof input.metric_target === 'number' ? input.metric_target : typeof input.metric_target === 'string' ? Number(input.metric_target) : NaN;
    if (!Number.isInteger(metric_target) || metric_target < 1 || metric_target > 10000000) issues.metric_target = '목표량은 1~10,000,000 사이의 정수로 입력해주세요.';
  }
  if (input.metric_start_day != null && input.metric_start_day !== '') {
    try { metric_start_day = parseDay(input.metric_start_day); } catch { issues.metric_start_day = '올바른 시작 날짜를 선택해주세요.'; }
  }
  if (metric_unit === null && (metric_target !== null || metric_start_day !== null)) issues.metric_unit = '목표량이나 시작 날짜와 함께 측정 기준을 선택해주세요.';
  if (metric_start_day && target_day && metric_start_day > target_day) issues.metric_start_day = '시작 날짜는 목표 날짜보다 늦을 수 없어요.';
  if (Object.keys(issues).length) throw new InputError(issues);
  return { title,motivation,period,status,parent_id,target_day,metric_unit,metric_target,metric_start_day };
}
export function parseReview(value: unknown): ReviewInput {
  const input = object(value), issues: Issues = {};
  const result: ReviewInput = { helped: text(input.helped,'helped',5000,issues), hindered: text(input.hindered,'hindered',5000,issues), gained: text(input.gained,'gained',5000,issues), next_step: text(input.next_step,'next_step',5000,issues) };
  if (Object.keys(issues).length) throw new InputError(issues);
  if (Object.hasOwn(input, 'document')) result.document = input.document === null ? null : parseReflection(input.document);
  return result;
}
export function summarizeTasks(tasks: Pick<Task,'status'|'minutes'>[]) {
  return { total: tasks.length, completed: tasks.filter(t => t.status === 'completed').length, partial: tasks.filter(t => t.status === 'partial').length,
    not_done: tasks.filter(t => t.status === 'not_done').length, planned: tasks.filter(t => t.status === 'planned').length,
    minutes: tasks.reduce((sum,t) => sum + (t.minutes ?? 0),0) };
}
export function goalTaskIds(goals: Goal[], id: string): Set<string> {
  return new Set([id,...goals.filter(goal => goal.parent_id === id).map(goal => goal.id)]);
}
