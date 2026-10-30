import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWork, parseNote, InputError, filterWorks, backup, type Work, type Note } from '../src/lib/domain.ts';
const input = { title: '  작품  ', kind: 'book', status: 'planned', rating: null, summary: '', tags: [], moods: [], minutes: null, progress: null, started_on: null, finished_on: null };
const make = (id: string, changes: Partial<Work> = {}): Work => ({ ...parseWork(input), id, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...changes });
test('입력 정규화와 잘못된 필드 거부', () => {
  assert.equal(parseWork(input).title, '작품');
  assert.deepEqual(parseWork({ ...input, tags: [' 성장 ', '성장', '', '여행'] }).tags, ['성장', '여행']);
  for (const changes of [{ title: '  ' }, { title: 'x'.repeat(101) }, { rating: 0 }, { rating: 6 }, { rating: 1.5 }, { progress: -1 }, { minutes: 0 }, { minutes: 1.2 }, { started_on: '2026-02-30' }, { started_on: '2026-10-05', finished_on: '2026-10-04' }, { summary: 'x'.repeat(301) }, { moods: ['fake'] }, { kind: 'other' }, { status: 'other' }]) {
    assert.throws(() => parseWork({ ...input, ...changes }), InputError);
  }
  assert.equal(parseWork({ ...input, kind: 'movie', progress: 100 }).progress, null);
  assert.throws(() => parseNote({ content: '   ', thought: '생각' }), InputError);
  assert.deepEqual(parseNote({ content: ' 문장 ', thought: ' 생각 ' }), { content: '문장', thought: '생각' });
});
test('검색, 종류, 상태, 태그가 모두 적용되고 제목과 수정시각으로 정렬', () => {
  const works = [make('a', { title: '가나다', summary: '따뜻한 여행', tags: ['성장', '여행'], rating: 5 }), make('b', { title: '나무', tags: ['성장'], status: 'active' }), make('c', { title: '영화', kind: 'movie', summary: '따뜻한 여행', tags: ['여행'], updated_at: '2026-10-02T00:00:00Z' })];
  assert.deepEqual(filterWorks(works, { query: '따뜻한', kind: 'book', status: 'planned', tags: ['성장', '여행'] }).map(x => x.id), ['a']);
  assert.deepEqual(filterWorks(works, { query: '나' }).map(x => x.id), ['a','b']);
  assert.equal(filterWorks(works, {})[0].id, 'c');
  assert.deepEqual(filterWorks(works, { sort: 'title' }).map(x => x.id), ['a','b','c']);
});
test('백업은 버전과 시각, 작품에 연결된 기록만 포함', () => {
  const notes = [{ id: 'n1', work_id: 'a', content: '문장', thought: '생각', created_at: '', updated_at: '' }, { id: 'n2', work_id: 'other', content: '다른 사람', thought: '', created_at: '', updated_at: '' }] as Note[];
  const result = JSON.parse(JSON.stringify(backup([make('a')], notes, '2026-10-05T00:00:00Z')));
  assert.equal(result.schemaVersion, 1); assert.equal(result.exportedAt, '2026-10-05T00:00:00Z');
  assert.equal(result.works.length, 1); assert.equal(result.notes.length, 1); assert.equal(result.notes[0].work_id, result.works[0].id);
});
