import { InputError, object } from './domain.ts';
import { parseDay, plannerWeek, REASONS, type Task } from './planner.ts';
import type { FocusSession } from './focus.ts';
import type { ReflectionDocument } from './reflection.ts';

export type DayPreferences = { day: string; available_minutes: number | null };
export type WeekReflection = { day: string; document: ReflectionDocument; created_at: string; updated_at: string };
export function parseDayPreferences(value: unknown): DayPreferences {
  const input = object(value), day = parseDay(input.day);
  const minutes = input.available_minutes == null || input.available_minutes === '' ? null : Number(input.available_minutes);
  if (minutes !== null && (!['number','string'].includes(typeof input.available_minutes) || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) throw new InputError({ available_minutes: '사용할 시간은 0~1440분으로 입력해주세요.' });
  return { day, available_minutes: minutes };
}
export function weekStart(day: unknown): string { return plannerWeek(parseDay(day))[0]; }
export function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds)), minutes = Math.floor(total / 60);
  return minutes >= 60 ? Math.floor(minutes / 60) + '시간' + (minutes % 60 ? ' ' + minutes % 60 + '분' : '') : minutes ? minutes + '분' : total + '초';
}
export function activityTitle(session: FocusSession) { return session.task_title || session.work_title || '실행 기록'; }
export function executionSummary(tasks: Task[], sessions: FocusSession[]) {
  const unique = [...new Map(sessions.filter(session => session.status === 'completed').map(session => [session.id, session])).values()];
  const uniqueTasks=[...new Map(tasks.map(task=>[task.id,task])).values()];
  const reasons = new Map<string, number>();
  for (const task of uniqueTasks) if (['partial','not_done'].includes(task.status) && task.reason && Object.hasOwn(REASONS,task.reason)) reasons.set(task.reason, (reasons.get(task.reason) ?? 0) + 1);
  return { seconds: unique.reduce((sum, session) => sum + session.elapsed_seconds, 0), sessions: unique.length, reasons: [...reasons.entries()].sort((a,b) => b[1]-a[1]), completed: uniqueTasks.filter(task => task.status === 'completed').length, total: uniqueTasks.length };
}
