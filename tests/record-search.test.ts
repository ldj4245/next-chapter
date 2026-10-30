import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecordSearch, recordSearchResponse, SEARCH_PAGE_SIZE } from '../src/lib/record-search.ts';

test('검색 입력은 한국어·리터럴 기호를 보존하고 길이·범위·페이지를 검증', () => {
  assert.deepEqual(parseRecordSearch(new URLSearchParams({ q: '  내 생각 %_\\  ', kind: 'memo', offset: '30' })), { q: '내 생각 %_\\', kind: 'memo', offset: 30 });
  assert.deepEqual(parseRecordSearch(new URLSearchParams()), { q: '', kind: 'all', offset: 0 });
  assert.equal(parseRecordSearch(new URLSearchParams({ q: '한'.repeat(80) })).q.length, 80);
  const invalid: Record<string, string>[] = [{ q: '한'.repeat(81) }, { q: '줄\n바꿈' }, { q: 'a\0b' }, { kind: '__proto__' }, { kind: 'task OR true' }, { offset: '-1' }, { offset: '1.5' }, { offset: '01' }, { offset: '1000001' }];
  for (const params of invalid) assert.throws(() => parseRecordSearch(new URLSearchParams(params)));
  assert.throws(() => parseRecordSearch(new URLSearchParams('q=첫째&q=둘째')));
});

const id = '11111111-1111-4111-8111-111111111111', work = '22222222-2222-4222-8222-222222222222', day = '2026-10-29';
const row = { id, recordType: 'task', title: '내 기록', excerpt: '검색한 문장', date: day, href: '/?day=' + day + '#task-' + id };
test('검색 응답은 필요한 필드만 투영하고 출처 링크를 제한', () => {
  const result = recordSearchResponse({ results: [{ ...row, user_id: '비공개 사용자', email: 'secret@example.com', object_path: 'private/photo' }], hasMore: false }, 0);
  assert.deepEqual(result, { results: [{ ...row, group: 'task' }], hasMore: false, nextOffset: null });
  for (const [recordType, recordId, href] of [
    ['session', id, '/?day=' + day + '#session-' + id], ['goal', id, '/goals#goal-' + id],
    ['memo', id, '/notes#memo-' + id], ['memo', id, '/notes?organized=1#memo-' + id], ['revisit', id, '/revisit?entry=' + id],
    ['work', id, '/library/' + id], ['note', id, '/library/' + work + '#note-' + id],
    ['review', day, '/?day=' + day + '#reflection-' + day], ['week_review', day, '/?day=' + day + '#week-review-' + day],
  ]) assert.equal(recordSearchResponse({ results: [{ ...row, recordType, id: recordId, href }], hasMore: false }, 0).results[0].href, href);
  for (const href of ['https://evil.example/', '//evil.example/', 'javascript:alert(1)', '/account', row.href + '&other=1']) assert.throws(() => recordSearchResponse({ results: [{ ...row, href }], hasMore: false }, 0));
  assert.throws(() => recordSearchResponse({ results: [{ ...row, recordType: '__proto__' }], hasMore: false }, 0));
  assert.throws(() => recordSearchResponse({ results: [row], hasMore: true }, 0));
  assert.throws(() => recordSearchResponse({ results: Array(SEARCH_PAGE_SIZE + 1).fill(row), hasMore: true }, 0));
  assert.equal(recordSearchResponse({ results: Array(SEARCH_PAGE_SIZE).fill(row), hasMore: true }, 60).nextOffset, 90);
});
