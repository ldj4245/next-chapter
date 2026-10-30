import assert from 'node:assert/strict';
import test from 'node:test';
import { InputError } from '../src/lib/domain.ts';
import { parseGoal, type Goal, type Task } from '../src/lib/planner.ts';
import { goalAmount, goalLineage, goalProgress } from '../src/lib/goal-metrics.ts';
import type { FocusSession } from '../src/lib/focus.ts';

const goal = (overrides: Partial<Goal> = {}): Goal => ({ ...parseGoal({ title: '꾸준히 배우기', period: 'long', metric_unit: 'minutes', metric_target: 60, metric_start_day: '2026-10-12', target_day: '2026-10-18' }), id: 'parent', created_at: '', updated_at: '', ...overrides });
const task = (overrides: Partial<Task> = {}): Task => ({ id: 'task', day: '2026-10-12', title: '이어 공부하기', status: 'completed', minutes: 1440, goal_id: 'child', work_id: null, important: false, reason: '', reason_detail: '', note: '', carried_from_id: null, created_at: '', updated_at: '', ...overrides });
const session = (overrides: Partial<FocusSession> = {}): FocusSession => ({ id: 'session', task_id: 'task', goal_id: 'child', task_title: '이어 공부하기', target_seconds: 300, memo: '', start_page: 20, end_page: 35, status: 'completed', elapsed_seconds: 600, reading_day: '2026-10-12', work_id: null, work_title: '공부', cover_url: '', started_at: '', finished_at: '', running_since: null, note_id: null, is_reading: false, ...overrides });
const family = [goal(), goal({ id: 'child', period: 'short', parent_id: 'parent' }), goal({ id: 'other' })];

test('측정 기준과 목표량은 선택 사항이며 알 수 없는 분모를 0%로 만들지 않음', () => {
  const plain = parseGoal({ title: '내 속도로 배우기', period: 'short' });
  assert.equal(plain.metric_unit, null); assert.equal(plain.metric_target, null); assert.equal(plain.metric_start_day, null);
  assert.deepEqual(goalProgress(goal({ metric_unit: null, metric_target: null }), family, [task()], [session()]), { unit: null, current: 0, target: null, percent: null });
  const measured = goal({ metric_target: null });
  assert.deepEqual(goalProgress(measured, family, [], [session()]), { unit: 'minutes', current: 10, target: null, percent: null });
  assert.equal(goalProgress(goal({ metric_target: 0 }), family, [], [session()]).percent, null);
  assert.equal(parseGoal({ ...plain, metric_unit: 'tasks', metric_target: '3' }).metric_target, 3);
  for (const metric_target of [0, -1, 1.5, 10000001, true, 'no', Infinity]) assert.throws(() => parseGoal({ ...plain, metric_unit: 'tasks', metric_target }), InputError);
  for (const input of [{ metric_unit: 'streak' }, { metric_target: 3 }, { metric_start_day: '2026-10-12' }, { metric_unit: 'minutes', metric_start_day: '2026-10-19', target_day: '2026-10-18' }, { metric_unit: 'pages', metric_start_day: '2026-02-29' }]) assert.throws(() => parseGoal({ ...plain, ...input }), InputError);
});

test('목표의 실제 집중 시간은 기간 양 끝과 자식 목표를 포함하고 추정 시간·중복·진행 중 기록은 제외', () => {
  const sessions = [session(), session(), session({ id: 'last', elapsed_seconds: 61, reading_day: '2026-10-18' }), session({ id: 'before', reading_day: '2026-10-11' }), session({ id: 'after', reading_day: '2026-10-19' }), session({ id: 'other', goal_id: 'other' }), session({ id: 'active', status: 'active', reading_day: null }), session({ id: 'unlinked', goal_id: null })];
  const result = goalProgress(goal(), family, [task()], sessions);
  assert.equal(result.current, 661 / 60);
  assert.equal(result.percent, 661 / 3600 * 100);
  assert.equal(goalProgress(goal(), family, [task()], []).current, 0, '1,440-minute estimates must never become actual focus time');
  assert.equal(goalAmount('minutes', result.current), '11분 1초');
  assert.equal(goalAmount('minutes', 0), '0분');
  assert.equal(goalAmount('minutes', 1 / 60), '1초');
});

test('과거 시간은 시작 당시의 목표에 남고 현재 할 일의 목표를 바꿔도 재배정하지 않음', () => {
  const relinked = task({ goal_id: 'other' });
  const saved = session({ goal_id: 'child' });
  assert.equal(goalProgress(goal(), family, [relinked], [saved]).current, 10);
  assert.equal(goalProgress(goal({ id: 'other' }), family, [relinked], [saved]).current, 0);
  assert.equal(goalProgress(goal(), family, [task()], [session({ goal_id: null })]).current, 0, 'Unlinked old sessions must not be guessed from a later task link');
});

test('할 일은 날짜별 완료한 실행만 세고 미루기·반복의 서로 다른 실행은 별개로 셈', () => {
  const tasks = [task(), task(), task({ id: 'carried', day: '2026-10-18', carried_from_id: 'task' }), task({ id: 'partial', status: 'partial' }), task({ id: 'planned', status: 'planned' }), task({ id: 'missed', status: 'not_done' }), task({ id: 'before', day: '2026-10-11' }), task({ id: 'after', day: '2026-10-19' }), task({ id: 'outside', goal_id: 'other' })];
  assert.deepEqual(goalProgress(goal({ metric_unit: 'tasks', metric_target: 3 }), family, tasks, [session()]), { unit: 'tasks', current: 2, target: 3, percent: 2 / 3 * 100 });
  assert.equal(goalProgress(goal({ metric_unit: 'tasks', metric_target: 1 }), family, tasks, []).percent, 100);
  assert.equal(goalAmount('tasks', 2), '2개');
});

test('읽은 쪽수는 저장한 양 끝의 차이만 세며 역방향 이동과 모르는 시작 쪽수를 추측하지 않음', () => {
  const sessions = [session(), session(), session({ id: 'backward', start_page: 100, end_page: 30 }), session({ id: 'unknown-start', start_page: null, end_page: 200 }), session({ id: 'unknown-end', start_page: 10, end_page: null }), session({ id: 'zero', start_page: 0, end_page: 5 }), session({ id: 'active', status: 'active', reading_day: null, end_page: 100 })];
  assert.deepEqual(goalProgress(goal({ metric_unit: 'pages', metric_target: 30 }), family, [], sessions), { unit: 'pages', current: 20, target: 30, percent: 20 / 30 * 100 });
  assert.equal(goalAmount('pages', 20), '20쪽');
});

test('목표 계층의 중복이나 잘못된 순환 때문에 실행 기록을 여러 번 세지 않음', () => {
  const goals = [{ id: 'parent', parent_id: 'grandchild' }, { id: 'child', parent_id: 'parent' }, { id: 'grandchild', parent_id: 'child' }, { id: 'child', parent_id: 'parent' }];
  assert.deepEqual([...goalLineage(goals, 'parent')], ['parent', 'child', 'grandchild']);
  assert.equal(goalProgress(goal({ metric_start_day: null, target_day: null }), family, [], [session({ reading_day: '2026-01-01' }), session({ id: 'future', reading_day: '2027-01-01' })]).current, 20);
});
