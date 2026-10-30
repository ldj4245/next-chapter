import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentSaver, type SaveReport } from '../src/lib/document-save.ts';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

test('자동 저장은 마지막 입력 뒤에 한 번 실행되며 변경하지 않은 문서는 저장하지 않음', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const writes: { title: string }[] = [], reports: SaveReport[] = [];
  const saver = new DocumentSaver({ title: '' }, async value => { writes.push(value); }, report => reports.push(report), 800);
  context.after(() => saver.dispose());
  saver.update({ title: '' });
  context.mock.timers.tick(1000);
  assert.equal(writes.length, 0);
  saver.update({ title: '독서' });
  context.mock.timers.tick(799);
  assert.equal(writes.length, 0);
  saver.update({ title: '독서 20분' });
  context.mock.timers.tick(799);
  assert.equal(writes.length, 0);
  assert.deepEqual(reports.at(-1), { status: 'pending', error: '', dirty: true });
  context.mock.timers.tick(1);
  await saver.flush();
  assert.deepEqual(writes, [{ title: '독서 20분' }]);
  assert.deepEqual(reports.at(-1), { status: 'saved', error: '', dirty: false });
  await saver.flush();
  assert.equal(writes.length, 1);
});

test('저장 중의 여러 입력은 최신 내용으로 모이며 요청을 겹치거나 오래된 결과로 덮어쓰지 않음', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const requests: { snapshot: { title: string }; gate: ReturnType<typeof deferred> }[] = [], reports: SaveReport[] = [];
  let active = 0, peak = 0;
  const saver = new DocumentSaver({ title: '' }, async snapshot => {
    const gate = deferred();
    requests.push({ snapshot, gate });
    peak = Math.max(peak, ++active);
    try { await gate.promise; } finally { active--; }
  }, report => reports.push(report), 800);
  context.after(() => saver.dispose());
  saver.update({ title: '첫 입력' });
  const saved = saver.flush();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].snapshot, { title: '첫 입력' });
  saver.update({ title: '중간 입력' });
  saver.update({ title: '최신 입력' });
  context.mock.timers.tick(5000);
  assert.equal(requests.length, 1);
  assert.equal(reports.at(-1)?.dirty, true);
  assert.equal(saver.flush(), saved);
  requests[0].gate.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].snapshot, { title: '최신 입력' });
  assert.deepEqual(requests[0].snapshot, { title: '첫 입력' });
  assert.equal(reports.at(-1)?.dirty, true);
  requests[1].gate.resolve();
  assert.equal(await saved, true);
  assert.equal(peak, 1);
  assert.deepEqual(reports.at(-1), { status: 'saved', error: '', dirty: false });
});

test('요청 실패 뒤 최신 초안과 오류를 보존하고 명시적으로 재시도할 때 최신 내용을 저장', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred(), writes: { title: string }[] = [], reports: SaveReport[] = [];
  const saver = new DocumentSaver({ title: '' }, async snapshot => {
    writes.push(snapshot);
    if (writes.length === 1) await first.promise;
  }, report => reports.push(report), 800);
  context.after(() => saver.dispose());
  saver.update({ title: '이전 내용' });
  const initialSave = saver.flush();
  saver.update({ title: '계속 쓴 최신 내용' });
  first.reject(new Error('네트워크 연결을 확인해주세요.'));
  assert.equal(await initialSave, false);
  assert.deepEqual(reports.at(-1), { status: 'error', error: '네트워크 연결을 확인해주세요.', dirty: true });
  context.mock.timers.tick(5000);
  saver.update({ title: '계속 쓴 최신 내용' });
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 1);
  assert.deepEqual(reports.at(-1), { status: 'error', error: '네트워크 연결을 확인해주세요.', dirty: true });
  assert.equal(await saver.flush(), true);
  assert.deepEqual(writes, [{ title: '이전 내용' }, { title: '계속 쓴 최신 내용' }]);
  assert.deepEqual(reports.at(-1), { status: 'saved', error: '', dirty: false });
});

test('비활성화는 예약된 저장과 진행 중 요청 뒤의 후속 저장을 멈추고 초안을 남김', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred(), writes: { title: string }[] = [], reports: SaveReport[] = [];
  const saver = new DocumentSaver({ title: '' }, async snapshot => {
    writes.push(snapshot);
    if (writes.length === 1) await gate.promise;
  }, report => reports.push(report), 800);
  context.after(() => saver.dispose());
  saver.update({ title: '예약 내용' });
  saver.update({ title: '예약 내용' }, false);
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 0);
  assert.equal(await saver.flush(), false);
  saver.update({ title: '예약 내용' }, true);
  const saved = saver.flush();
  assert.equal(writes.length, 1);
  saver.update({ title: '아직 저장하지 않을 최신 내용' }, false);
  gate.resolve();
  assert.equal(await saved, false);
  assert.equal(writes.length, 1);
  assert.deepEqual(reports.at(-1), { status: 'pending', error: '', dirty: true });
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 1);
  saver.update({ title: '아직 저장하지 않을 최신 내용' }, true);
  context.mock.timers.tick(800);
  assert.equal(await saver.flush(), true);
  assert.deepEqual(writes.at(-1), { title: '아직 저장하지 않을 최신 내용' });
});

test('외부 저장 결과를 인정하면 예약 요청을 취소하고 그 결과를 다음 편집의 기준으로 사용', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const writes: { title: string }[] = [], reports: SaveReport[] = [];
  const saver = new DocumentSaver({ title: '' }, async value => { writes.push(value); }, report => reports.push(report), 800);
  context.after(() => saver.dispose());
  saver.update({ title: '예약 초안' });
  saver.acknowledge({ title: '서버에서 저장된 내용' });
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 0);
  assert.equal(await saver.flush(), true);
  assert.deepEqual(reports.at(-1), { status: 'saved', error: '', dirty: false });
  saver.update({ title: '서버에서 저장된 내용' });
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 0);
  saver.update({ title: '다음 편집' });
  context.mock.timers.tick(800);
  await saver.flush();
  assert.deepEqual(writes, [{ title: '다음 편집' }]);
});

test('편집기 제거 뒤에는 타이머나 진행 중 요청이 추가 저장 또는 상태 보고를 하지 않음', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const writes: string[] = [], reports: SaveReport[] = [];
  const pending = new DocumentSaver('', async value => { writes.push(value); }, report => reports.push(report), 800);
  pending.update('예약된 내용');
  pending.dispose();
  const countAfterDispose = reports.length;
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 0);
  assert.equal(await pending.flush(), false);
  pending.update('제거 후 입력');
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 0);
  assert.equal(reports.length, countAfterDispose);

  const gate = deferred();
  const running = new DocumentSaver('', async value => { writes.push(value); await gate.promise; }, report => reports.push(report), 800);
  running.update('전송 중 내용');
  const saved = running.flush();
  running.update('전송 중에 더 쓴 내용');
  running.dispose();
  const runningCountAfterDispose = reports.length;
  gate.resolve();
  assert.equal(await saved, false);
  context.mock.timers.tick(5000);
  assert.deepEqual(writes, ['전송 중 내용']);
  assert.equal(reports.length, runningCountAfterDispose);
});

test('저장 중 원래 값으로 되돌려도 미저장 상태를 유지하고 되돌린 값을 마지막으로 저장', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred(), writes: string[] = [], reports: SaveReport[] = [];
  const saver = new DocumentSaver('원래 내용', async snapshot => {
    writes.push(snapshot);
    if (writes.length === 1) await first.promise;
  }, report => reports.push(report), 800);
  context.after(() => saver.dispose());
  saver.update('변경한 내용');
  const saved = saver.flush();
  saver.update('원래 내용');
  assert.deepEqual(reports.at(-1), { status: 'saving', error: '', dirty: true });
  first.resolve();
  assert.equal(await saved, true);
  assert.deepEqual(writes, ['변경한 내용', '원래 내용']);
  assert.deepEqual(reports.at(-1), { status: 'saved', error: '', dirty: false });
});

test('저장 응답이 실패한 뒤 원래 값으로 되돌렸어도 불확실한 서버 상태를 재저장으로 확정', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred(), writes: string[] = [], reports: SaveReport[] = [];
  const saver = new DocumentSaver('원래 내용', async snapshot => {
    writes.push(snapshot);
    if (writes.length === 1) await first.promise;
  }, report => reports.push(report), 800);
  context.after(() => saver.dispose());
  saver.update('변경한 내용');
  const saved = saver.flush();
  saver.update('원래 내용');
  first.reject(new Error('응답을 받지 못했어요.'));
  assert.equal(await saved, false);
  assert.deepEqual(reports.at(-1), { status: 'error', error: '응답을 받지 못했어요.', dirty: true });
  saver.update('원래 내용');
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 1);
  assert.equal(reports.at(-1)?.dirty, true);
  assert.equal(await saver.flush(), true);
  assert.deepEqual(writes, ['변경한 내용', '원래 내용']);
  assert.deepEqual(reports.at(-1), { status: 'saved', error: '', dirty: false });
});

test('페이지를 떠날 때 close는 저장 대기 중 초안을 즉시 저장하고 제거한 편집기에 상태를 보고하지 않음', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred(), writes: string[] = [], reports: SaveReport[] = [];
  const saver = new DocumentSaver('', async snapshot => { writes.push(snapshot); await gate.promise; }, report => reports.push(report), 800);
  saver.update('아직 타이머를 기다리는 내용');
  const countBeforeClose = reports.length;
  saver.close();
  assert.deepEqual(writes, ['아직 타이머를 기다리는 내용']);
  assert.equal(reports.length, countBeforeClose);
  const draining = saver.flush();
  gate.resolve();
  assert.equal(await draining, true);
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 1);
  assert.equal(reports.length, countBeforeClose);
  saver.update('제거된 편집기의 늦은 변경');
  assert.equal(await saver.flush(), false);
  assert.equal(writes.length, 1);
});

test('페이지를 떠나도 close는 진행 중 요청을 기다린 뒤 최신 초안을 한 번 더 저장', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred(), last = deferred(), writes: string[] = [], reports: SaveReport[] = [];
  const saver = new DocumentSaver('', async snapshot => {
    writes.push(snapshot);
    await (writes.length === 1 ? first.promise : last.promise);
  }, report => reports.push(report), 800);
  saver.update('전송 중인 이전 초안');
  const saved = saver.flush();
  saver.update('이동 직전 최신 초안');
  const countBeforeClose = reports.length;
  saver.close();
  first.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(writes, ['전송 중인 이전 초안', '이동 직전 최신 초안']);
  assert.equal(reports.length, countBeforeClose);
  last.resolve();
  assert.equal(await saved, true);
  context.mock.timers.tick(5000);
  assert.equal(writes.length, 2);
  assert.equal(reports.length, countBeforeClose);
});
