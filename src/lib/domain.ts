import { catalogURL, SOURCES, type Source } from './catalog-types.ts';

export const KINDS = { book: '책', movie: '영화', drama: '드라마' } as const;
export const STATUSES = { planned: '예정', active: '감상 중', completed: '완료', dropped: '중단' } as const;
export const MOODS = { calm: '편안함', immersive: '몰입', thoughtful: '생각할 거리', light: '가벼움' } as const;
export type Kind = keyof typeof KINDS;
export type WorkStatus = keyof typeof STATUSES;
export type Mood = keyof typeof MOODS;
export type WorkInput = {
  title: string; kind: Kind; status: WorkStatus; rating: number | null;
  summary: string; tags: string[]; moods: Mood[]; minutes: number | null;
  progress: number | null; started_on: string | null; finished_on: string | null;
  creator: string; year: number | null; description: string; cover_url: string;
  source: Source | null; source_id: string | null; source_url: string;
};
export type Work = WorkInput & { id: string; created_at: string; updated_at: string };
export type NoteInput = { content: string; thought: string };
export type Note = NoteInput & { id: string; work_id: string; created_at: string; updated_at: string };
export type Detail = { work: Work; notes: Note[] };
export type Issues = Record<string, string>;

export class InputError extends Error {
  issues: Issues;
  constructor(issues: Issues) { super(Object.values(issues)[0]); this.issues = issues; }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError({ form: '입력 내용을 확인해주세요.' });
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number, issues: Issues, required = false) {
  if (value != null && typeof value !== 'string') issues[field] = '문자로 입력해주세요.';
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) issues[field] = '내용을 입력해주세요.';
  if (result.length > max) issues[field] = String(max) + '자 이내로 입력해주세요.';
  return result;
}
function integer(value: unknown, field: string, min: number, max: number, issues: Issues) {
  if (value === '' || value == null) return null;
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(result) || result < min || result > max) issues[field] = String(min) + '~' + String(max) + ' 사이의 정수를 입력해주세요.';
  return result;
}
function date(value: unknown, field: string, issues: Issues) {
  if (value === '' || value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { issues[field] = '날짜를 확인해주세요.'; return null; }
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) issues[field] = '올바른 날짜를 입력해주세요.';
  return value;
}
export function parseWork(value: unknown): WorkInput {
  const input = object(value), issues: Issues = {};
  const title = text(input.title, 'title', 100, issues, true);
  const kind = input.kind as Kind, status = input.status as WorkStatus;
  if (!Object.hasOwn(KINDS, kind ?? '')) issues.kind = '작품 종류를 선택해주세요.';
  if (!Object.hasOwn(STATUSES, status ?? '')) issues.status = '감상 상태를 선택해주세요.';
  const summary = text(input.summary, 'summary', 300, issues);
  const rating = integer(input.rating, 'rating', 1, 5, issues);
  const minutes = integer(input.minutes, 'minutes', 1, 2147483647, issues);
  const progress = integer(input.progress, 'progress', 0, 2147483647, issues);
  const started_on = date(input.started_on, 'started_on', issues), finished_on = date(input.finished_on, 'finished_on', issues);
  if (started_on && finished_on && finished_on < started_on) issues.finished_on = '완료일은 시작일과 같거나 이후여야 해요.';
  const creator = text(input.creator, 'creator', 160, issues);
  const year = integer(input.year, 'year', 1000, 2100, issues);
  const description = text(input.description, 'description', 3000, issues);
  const cover_url = catalogURL(input.cover_url, true), source_url = catalogURL(input.source_url);
  if (input.cover_url && !cover_url) issues.cover_url = '지원하는 출처의 표지 주소를 입력해주세요.';
  if (input.source_url && !source_url) issues.source_url = '작품 정보 출처를 확인해주세요.';
  const source = input.source == null ? null : input.source as Source;
  const source_id = input.source_id == null ? null : text(input.source_id, 'source_id', 120, issues);
  if (source && !Object.hasOwn(SOURCES, source)) issues.source = '작품 출처를 확인해주세요.';
  if (Boolean(source) !== Boolean(source_id)) issues.source_id = '작품 출처와 식별자를 함께 입력해주세요.';
  let tags: string[] = [];
  if (input.tags != null) {
    if (!Array.isArray(input.tags) || input.tags.some(x => typeof x !== 'string')) issues.tags = '태그를 확인해주세요.';
    else tags = [...new Set((input.tags as string[]).map(x => x.trim()).filter(Boolean))];
  }
  if (tags.length > 20 || tags.some(x => x.length > 50)) issues.tags = '태그는 50자 이내로, 최대 20개까지 입력해주세요.';
  let moods: Mood[] = [];
  if (input.moods != null) {
    if (!Array.isArray(input.moods) || input.moods.some(x => typeof x !== 'string' || !Object.hasOwn(MOODS, x))) issues.moods = '분위기를 확인해주세요.';
    else moods = [...new Set(input.moods)] as Mood[];
  }
  if (Object.keys(issues).length) throw new InputError(issues);
  return { title, kind, status, rating, summary, tags, moods, minutes, progress: kind === 'movie' ? null : progress, started_on, finished_on, creator, year, description, cover_url, source, source_id, source_url };
}
export function parseNote(value: unknown): NoteInput {
  const input = object(value), issues: Issues = {};
  const content = text(input.content, 'content', 20000, issues, true);
  const thought = text(input.thought, 'thought', 20000, issues);
  if (Object.keys(issues).length) throw new InputError(issues);
  return { content, thought };
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InputError({ form: '기록 식별자를 확인해주세요.' });
  return value;
}
export type LibraryFilter = { query?: string; kind?: string; status?: string; tags?: string[]; sort?: 'updated' | 'title' };
export function filterWorks(works: Work[], filter: LibraryFilter): Work[] {
  const query = (filter.query ?? '').trim().toLocaleLowerCase('ko-KR');
  return works.filter(work =>
    (!query || (work.title + ' ' + work.summary).toLocaleLowerCase('ko-KR').includes(query)) &&
    (!filter.kind || work.kind === filter.kind) && (!filter.status || work.status === filter.status) &&
    (filter.tags ?? []).every(tag => work.tags.includes(tag))
  ).sort((a, b) => filter.sort === 'title' ? a.title.localeCompare(b.title, 'ko-KR') : b.updated_at.localeCompare(a.updated_at));
}
export function backup(works: Work[], notes: Note[], exportedAt = new Date().toISOString()) {
  const ids = new Set(works.map(work => work.id));
  return { schemaVersion: 1, exportedAt, works, notes: notes.filter(note => ids.has(note.work_id)) };
}
export const workColumns = 'id,title,kind,status,rating,summary,tags,moods,minutes,progress,started_on,finished_on,creator,year,description,cover_url,source,source_id,source_url,created_at,updated_at';
export const noteColumns = 'id,work_id,content,thought,created_at,updated_at';
export function formattedDate(value: string | null, withTime = false) {
  if (!value) return '미입력';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' as const } : {}) }).format(new Date(value.length === 10 ? value + 'T00:00:00' : value));
}
