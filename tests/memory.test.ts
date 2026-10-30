import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMemo, parseMemoConversion, parseRevisit, parseRevisitOffset, parseRevision } from '../src/lib/memory.ts';

const id = '11111111-1111-4111-8111-111111111111';
test('빠른 메모와 지금 생각은 공백과 줄바꿈을 보존하고 owner·snapshot 필드를 받지 않는다', () => {
  const content = '  생각\n\n이어 쓰기  ';
  assert.deepEqual(parseMemo({ content, user_id: id, converted_kind: 'task' }), { content });
  assert.deepEqual(parseRevisit({ id, source_kind: 'note', source_id: id, thought: content, source_text: '위조', user_id: id }), { id, source_kind: 'note', source_id: id, source_day: null, thought: content });
  for (const invalid of ['', ' \n\t ', 1, null, '가'.repeat(2001)]) assert.throws(() => parseMemo({ content: invalid }));
  assert.equal(parseMemo({ content: '가'.repeat(2000) }).content.length, 2000);
  assert.throws(() => parseRevisit({ id, source_kind: 'review', source_day: '2026-02-30', thought: '생각' }));
  assert.throws(() => parseRevisit({ id, source_kind: 'review', source_day: '2026-10-01', thought: '가'.repeat(4001) }));
});
test('메모 정리는 유효한 날짜·저장 revision·작품 연결을 요구한다', () => {
  assert.deepEqual(parseMemoConversion({ kind: 'task', day: '2026-10-29', revision: 1, work_id: id }), { kind: 'task', day: '2026-10-29', revision: 1, work_id: null });
  assert.deepEqual(parseMemoConversion({ kind: 'note', day: '2026-10-29', revision: 2, work_id: id }), { kind: 'note', day: '2026-10-29', revision: 2, work_id: id });
  for (const invalid of [0, -1, '1', 1.5, null, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseRevision(invalid));
  assert.throws(() => parseMemoConversion({ kind: 'note', day: '2026-10-29', revision: 1 }));
  assert.throws(() => parseMemoConversion({ kind: 'unknown', day: '2026-10-29', revision: 1 }));
  assert.equal(parseRevisitOffset(null), 0);
  assert.equal(parseRevisitOffset('100'), 100);
  for (const invalid of ['-1', '1.1', '1e3', '1000001']) assert.throws(() => parseRevisitOffset(invalid));
});
