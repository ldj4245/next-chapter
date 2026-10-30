import { InputError } from './domain.ts';

export const SEARCH_KINDS = { all: '전체', task: '할 일 · 집중', memo: '메모 · 다시 읽기', review: '회고', library: '서재', resources: '학습 자료', goal: '목표' } as const;
export type SearchKind = keyof typeof SEARCH_KINDS;
export const RECORD_TYPES = { task: '할 일', session: '집중 기록', memo: '메모', revisit: '다시 읽기', review: '하루 회고', week_review: '주간 회고', work: '작품', note: '문장 · 생각', goal: '목표', resource: '학습 자료', resource_bookmark: '영상 구간' } as const;
export type RecordType = keyof typeof RECORD_TYPES;
export const SEARCH_PAGE_SIZE = 30;
export type SearchInput = { q: string; kind: SearchKind; offset: number };
export type SearchResult = { id: string; recordType: RecordType; group: Exclude<SearchKind, 'all'>; title: string; excerpt: string; date: string; href: string };
export type SearchResponse = { results: SearchResult[]; hasMore: boolean; nextOffset: number | null };

export function parseRecordSearch(params: URLSearchParams): SearchInput {
  for (const key of ['q', 'kind', 'offset']) if (params.getAll(key).length > 1) throw new InputError({ search: '검색 조건을 확인해주세요.' });
  const raw = params.get('q') ?? '', q = raw.trim(), kind = params.get('kind') ?? 'all', offset = params.get('offset') ?? '0';
  if ([...raw].length > 80 || /[\u0000-\u001f\u007f]/u.test(raw)) throw new InputError({ q: '검색어를 80자 이내의 한 줄로 입력해주세요.' });
  if (!Object.hasOwn(SEARCH_KINDS, kind)) throw new InputError({ kind: '검색 범위를 확인해주세요.' });
  if (!/^(0|[1-9]\d{0,6})$/.test(offset) || Number(offset) > 1_000_000) throw new InputError({ offset: '검색 위치를 확인해주세요.' });
  return { q, kind: kind as SearchKind, offset: Number(offset) };
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const uuidPattern = new RegExp('^' + uuid + '$', 'i');
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const groups: Record<RecordType, SearchResult['group']> = { task: 'task', session: 'task', memo: 'memo', revisit: 'memo', review: 'review', week_review: 'review', work: 'library', note: 'library', goal: 'goal', resource: 'resources', resource_bookmark: 'resources' };

/** Only the owner-safe, small search projection reaches the client. */
export function recordSearchResponse(value: unknown, offset: number): SearchResponse {
  if (!value || typeof value !== 'object') throw new Error('SEARCH_RESPONSE_INVALID');
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.results) || input.results.length > SEARCH_PAGE_SIZE || typeof input.hasMore !== 'boolean') throw new Error('SEARCH_RESPONSE_INVALID');
  const results = input.results.map((item: unknown): SearchResult => {
    if (!item || typeof item !== 'object') throw new Error('SEARCH_RESPONSE_INVALID');
    const row = item as Record<string, unknown>, type = row.recordType;
    if (typeof type !== 'string' || !Object.hasOwn(RECORD_TYPES, type)) throw new Error('SEARCH_RESPONSE_INVALID');
    const recordType = type as RecordType;
    if (typeof row.id !== 'string' || !(recordType === 'review' || recordType === 'week_review' ? dayPattern : uuidPattern).test(row.id) ||
      typeof row.title !== 'string' || [...row.title].length > 200 || typeof row.excerpt !== 'string' || [...row.excerpt].length > 220 ||
      typeof row.date !== 'string' || !dayPattern.test(row.date) || typeof row.href !== 'string') throw new Error('SEARCH_RESPONSE_INVALID');
    let safe = false;
    switch (recordType) {
      case 'task': safe = row.href === '/?day=' + row.date + '#task-' + row.id; break;
      case 'session': safe = row.href === '/?day=' + row.date + '#session-' + row.id; break;
      case 'review': safe = row.id === row.date && row.href === '/?day=' + row.date + '#reflection-' + row.date; break;
      case 'week_review': safe = row.id === row.date && row.href === '/?day=' + row.date + '#week-review-' + row.date; break;
      case 'goal': safe = row.href === '/goals#goal-' + row.id; break;
      case 'memo': safe = row.href === '/notes#memo-' + row.id || row.href === '/notes?organized=1#memo-' + row.id; break;
      case 'revisit': safe = row.href === '/revisit?entry=' + row.id; break;
      case 'work': safe = row.href === '/library/' + row.id; break;
      case 'resource': safe = row.href === '/resources/' + row.id; break;
      case 'resource_bookmark': safe = new RegExp('^/resources/' + uuid + '#bookmark-' + row.id + '$', 'i').test(row.href); break;
      case 'note': safe = new RegExp('^/library/' + uuid + '#note-' + row.id + '$', 'i').test(row.href); break;
    }
    if (!safe) throw new Error('SEARCH_RESPONSE_INVALID');
    return { id: row.id, recordType, group: groups[recordType], title: row.title, excerpt: row.excerpt, date: row.date, href: row.href };
  });
  if (input.hasMore && results.length !== SEARCH_PAGE_SIZE) throw new Error('SEARCH_RESPONSE_INVALID');
  return { results, hasMore: input.hasMore, nextOffset: input.hasMore ? offset + SEARCH_PAGE_SIZE : null };
}
