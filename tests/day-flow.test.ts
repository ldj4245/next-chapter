import assert from 'node:assert/strict';
import test from 'node:test';
import { InputError } from '../src/lib/domain.ts';
import { activityTitle, durationLabel, executionSummary, parseDayPreferences, weekStart } from '../src/lib/day-flow.ts';
import { parseTask, plannerDay, type Task } from '../src/lib/planner.ts';
import type { FocusSession } from '../src/lib/focus.ts';

const task = (overrides: Partial<Task> = {}): Task => ({ ...parseTask({ day: '2026-10-13', title: '오늘 공부', status: 'completed' }), id: 'task', carried_from_id: null, created_at: '', updated_at: '', ...overrides });
const session = (overrides: Partial<FocusSession> = {}): FocusSession => ({ id: 'session', task_id: 'task', goal_id: null, task_title: '오늘 공부', target_seconds: 0, memo: '', start_page: null, end_page: null, status: 'completed', elapsed_seconds: 125, reading_day: '2026-10-13', work_id: null, work_title: '원래 작품', cover_url: '', started_at: '', finished_at: '', running_since: null, note_id: null, is_reading: false, ...overrides });

test('하루 여유 시간의 0과 미설정은 다르며 날짜와 정수 범위를 검증', () => {
  for (const available_minutes of [null, undefined, '']) assert.deepEqual(parseDayPreferences({ day: '2026-10-13', available_minutes }), { day: '2026-10-13', available_minutes: null });
  for (const [available_minutes, expected] of [[0, 0], ['0', 0], [1440, 1440], ['90', 90]] as const) assert.deepEqual(parseDayPreferences({ day: '2026-10-13', available_minutes }), { day: '2026-10-13', available_minutes: expected });
  for (const available_minutes of [false, true, [], {}, -1, 1441, 1.5, '1.5', 'NaN', Infinity, NaN]) assert.throws(() => parseDayPreferences({ day: '2026-10-13', available_minutes }), InputError);
  assert.equal(parseDayPreferences({ day: '2028-02-29', available_minutes: 0 }).day, '2028-02-29');
  for (const day of [null, '2026-02-29', '2026-10-32', '2026-1-1', '1899-12-31', '2101-01-01']) assert.throws(() => parseDayPreferences({ day, available_minutes: 30 }), InputError);
});

test('주간 회고의 월요일은 한국 자정과 일요일 경계 및 해가 바뀌는 주에도 동일', () => {
  const sunday = plannerDay('2026-10-11T14:59:59Z'), monday = plannerDay('2026-10-11T15:00:00Z');
  assert.equal(sunday, '2026-10-11'); assert.equal(weekStart(sunday), '2026-10-05');
  assert.equal(monday, '2026-10-12'); assert.equal(weekStart(monday), '2026-10-12');
  assert.equal(weekStart('2027-01-03'), '2026-12-28');
  assert.equal(weekStart('2027-01-04'), '2027-01-04');
  assert.equal(weekStart('1900-01-01'), '1900-01-01');
  for (const day of [undefined, '2026-02-29', '2026-10-12T00:00:00Z', true]) assert.throws(() => weekStart(day), InputError);
});

test('실행 요약은 저장 완료한 세션을 한 번 세며 진행 중 시간과 예상 시간은 제외', () => {
  const summary = executionSummary([task({ minutes: 1440 }), task({ id: 'partial', status: 'partial', reason: 'difficulty' })], [session(), session(), session({ id: 'second', elapsed_seconds: 60 }), session({ id: 'active', status: 'active', elapsed_seconds: 3600, reading_day: null })]);
  assert.deepEqual(summary, { seconds: 185, sessions: 2, completed: 1, total: 2, reasons: [['difficulty', 1]] });
  assert.deepEqual(executionSummary([], []), { seconds: 0, sessions: 0, completed: 0, total: 0, reasons: [] });
});

test('반복·이어간 할 일은 서로 다른 실행으로 세고 같은 ID 중복 및 알 수 없는 이유는 빼서 요약', () => {
  const duplicate = task({ id: 'first' }), repeated = task({ id: 'repeat', carried_from_id: 'first' });
  const hard = task({ id: 'hard', status: 'partial', reason: 'difficulty' }), missed = task({ id: 'missed', status: 'not_done', reason: 'difficulty' });
  const unknown = task({ id: 'unknown', status: 'not_done', reason: 'not-a-reason' as Task['reason'] });
  const doneWithOldReason = task({ id: 'done', status: 'completed', reason: 'time' });
  assert.deepEqual(executionSummary([duplicate, duplicate, repeated, hard, hard, missed, unknown, doneWithOldReason], []), { seconds: 0, sessions: 0, completed: 3, total: 6, reasons: [['difficulty', 2]] });
});

test('실행 제목은 시작 당시의 할 일을 우선하고 시간 표시는 음수와 시간 경계를 처리', () => {
  assert.equal(activityTitle(session()), '오늘 공부');
  assert.equal(activityTitle(session({ task_title: '' })), '원래 작품');
  assert.equal(activityTitle(session({ task_title: '', work_title: '' })), '실행 기록');
  for (const [seconds, label] of [[-1, '0초'], [0, '0초'], [59, '59초'], [60, '1분'], [125, '2분'], [3600, '1시간'], [5460, '1시간 31분']] as const) assert.equal(durationLabel(seconds), label);
});
