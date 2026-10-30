import assert from 'node:assert/strict';
import test from 'node:test';
import { InputError } from '../src/lib/domain.ts';
import { parseRoutine, parseRoutineDay, routineMatches, routineWeekday } from '../src/lib/recurrence.ts';

test('반복 계획은 요일·기간·예상 시간·연결을 검증하고 불필요한 입력을 저장하지 않음', () => {
  const input = { title: ' 주말에 읽고 배우기 ', weekdays: [7, 6], start_day: '2026-10-17', note: ' 생각 적기 ' };
  const routine = parseRoutine(input);
  assert.deepEqual(routine, { title: '주말에 읽고 배우기', weekdays: [6, 7], start_day: '2026-10-17', end_day: null,
    active: true, minutes: null, important: false, goal_id: null, work_id: null, note: '생각 적기' });
  assert.equal(parseRoutine({ ...input, end_day: '2026-10-17', minutes: '30', important: true }).minutes, 30);
  for (const weekdays of [undefined, [], [0], [8], ['1'], [1, 1], [1.5], Array(8).fill(1), true]) {
    assert.throws(() => parseRoutine({ ...input, weekdays }), InputError);
  }
  for (const field of [{ start_day: '2026-02-29' }, { end_day: '2026-10-16' }, { end_day: '2101-01-01' }, { active: 'true' },
    { minutes: 0 }, { minutes: 1441 }, { minutes: 3.5 }, { important: 'true' }, { goal_id: 'no' }, { work_id: 'no' }, { note: [] }, { title: '' }]) {
    assert.throws(() => parseRoutine({ ...input, ...field }), InputError);
  }
  const clean = parseRoutine({ ...input, id: 'ignored', user_id: 'ignored', status: 'completed', routine_id: 'ignored', reason: 'time' });
  assert.deepEqual(clean, routine);
});

test('반복 날짜는 한국 달력 요일을 쓰고 시작·종료를 포함하며 과거를 생성하지 않음', () => {
  assert.equal(routineWeekday('2026-10-12'), 1);
  assert.equal(routineWeekday('2026-10-18'), 7);
  const routine = parseRoutine({ title: '주말 계획', weekdays: [6, 7], start_day: '2026-10-17', end_day: '2026-10-18' });
  assert.equal(routineMatches(routine, '2026-10-16'), false);
  assert.equal(routineMatches(routine, '2026-10-17'), true);
  assert.equal(routineMatches(routine, '2026-10-18'), true);
  assert.equal(routineMatches(routine, '2026-10-24'), false);
  assert.equal(routineMatches({ ...routine, active: false }, '2026-10-17'), false);
  assert.equal(parseRoutineDay('2026-10-13', '2026-10-13'), '2026-10-13');
  assert.equal(parseRoutineDay('2026-10-14', '2026-10-13'), '2026-10-14');
  assert.throws(() => parseRoutineDay('2026-10-12', '2026-10-13'), InputError);
  assert.throws(() => routineWeekday('2026-02-29'), InputError);
});
