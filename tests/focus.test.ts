import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusClock, parseFocusAction, parseFocusStart, type FocusSession } from '../src/lib/focus.ts';

const id = '11111111-1111-4111-8111-111111111111', task_id = '22222222-2222-4222-8222-222222222222';
test('집중 시작은 자유 측정 또는 서버가 허용한 집중 시간만 받고 연결은 UUID로 제한', () => {
  for (const target_seconds of [0, 60, 1500, 14400]) assert.deepEqual(parseFocusStart({ id, task_id, target_seconds, user_id: id }), { id, task_id, target_seconds });
  for (const target_seconds of [undefined, null, '300', true, 1, 59, 60.1, -1, 14401, Infinity]) assert.throws(() => parseFocusStart({ id, task_id, target_seconds }));
  for (const bad of [null, '', 'owner', 1]) assert.throws(() => parseFocusStart({ id, task_id: bad, target_seconds: 0 }));
});
test('집중 메모는 공백·줄바꿈을 유지하고 동작 요청은 메모를 덮어쓰지 않음', () => {
  const memo = '  처음 든 생각\n다음 문장  ';
  assert.deepEqual(parseFocusAction({ action: 'memo', memo }), { action: 'memo', memo });
  assert.deepEqual(parseFocusAction({ action: 'memo', memo: '' }), { action: 'memo', memo: '' });
  for (const action of ['pause', 'resume', 'complete', 'cancel']) assert.deepEqual(parseFocusAction({ action, memo: 'ignored' }), { action, memo: null });
  for (const bad of [undefined, null, 1, true, 'x'.repeat(20001)]) assert.throws(() => parseFocusAction({ action: 'memo', memo: bad }));
  for (const action of ['', 'details', 'delete', null, {}]) assert.throws(() => parseFocusAction({ action }));
});
test('자유 측정·집중 타이머는 서버 시각을 복원하고 24시간 제한을 공유', () => {
  const session = { target_seconds: 1500, elapsed_seconds: 20, running_since: '2026-10-13T12:00:00Z' } as FocusSession;
  const now = Date.parse('2026-10-13T12:02:00Z');
  assert.equal(focusClock(session, now), '22:40');
  assert.equal(focusClock({ ...session, target_seconds: 0 }, now), '02:20');
  assert.equal(focusClock({ ...session, target_seconds: 0, elapsed_seconds: 3600, running_since: null }, now), '01:00:00');
  assert.equal(focusClock({ ...session, target_seconds: 60 }, now), '00:00');
  assert.equal(focusClock({ ...session, target_seconds: 0 }, Date.parse('2026-10-15T12:00:00Z')), '24:00:00');
  assert.equal(focusClock({ ...session, target_seconds: 0, running_since: null }, now), '00:20');
});
