import { InputError, object, uuid } from './domain.ts';
import { GOAL_METRIC_UNITS } from './goal-metrics.ts';

export const ARCHIVE_SECTIONS = {
  days: { title: '하루 기록', description: '할 일, 하루·주간 회고, 집중 기록' },
  library: { title: '서재', description: '작품 정보, 한 줄 감상, 문장과 내 생각' },
  notes: { title: '목표와 메모', description: '목표, 빠른 메모, 다시 읽으며 남긴 생각' },
  learning: { title: '학습 자료', description: '자료 주소, 메모, 영상 북마크' },
} as const;
export type ArchiveSection = keyof typeof ARCHIVE_SECTIONS;
export type ArchiveOptions = { from: string; to: string; sections: ArchiveSection[] };
export type ArchiveEntry = { section: ArchiveSection; kind: string; date: string; title: string; fields: { label: string; text: string }[]; blocks?: { kind: string; text: string; checked: boolean }[] };
export type ArchiveDocument = { format: 'next-chapter-records'; version: 1; createdAt: string; period: { from: string; to: string }; sections: ArchiveSection[]; entries: ArchiveEntry[] };
export type ArchiveEnvelope = { format: 'next-chapter-encrypted'; version: 1; cipher: 'AES-256-GCM'; compression: 'gzip' | 'none'; iv: string; ciphertext: string };
export type ArchiveCounts = Partial<Record<ArchiveSection, number>>;
export type ArchiveRecord = { id: string; period_start: string; period_end: string; sections: ArchiveSection[]; counts: ArchiveCounts; byte_length: number; digest: string; data_id: string; state: 'prepared' | 'submitted' | 'confirmed'; created_at: string; submitted_at: string | null; confirmed_at: string | null };
export type ArchiveKit = { format: 'next-chapter-recovery'; version: 1; archiveId: string; key: string; envelope: ArchiveEnvelope; digest: string; dataId: string | null };
export const MAX_ARCHIVE_BYTES = 100_000;
export const ARCHIVE_COLUMNS = 'id,period_start,period_end,sections,counts,byte_length,digest,data_id,state,created_at,submitted_at,confirmed_at';
export const ARCHIVE_AAD = 'next-chapter-record-archive:1:';

function day(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') throw new InputError({ period: '보관할 기간을 확인해주세요.' });
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new InputError({ period: '올바른 날짜를 선택해주세요.' });
  return value;
}
export function parseArchiveOptions(value: unknown): ArchiveOptions {
  const input = object(value), from = day(input.from), to = day(input.to);
  if (from > to) throw new InputError({ period: '시작일은 종료일보다 늦을 수 없어요.' });
  if (!Array.isArray(input.sections) || !input.sections.length || input.sections.length > 4 || input.sections.some(s => typeof s !== 'string' || !Object.hasOwn(ARCHIVE_SECTIONS, s))) throw new InputError({ sections: '보관할 기록을 하나 이상 선택해주세요.' });
  return { from, to, sections: [...new Set(input.sections)] as ArchiveSection[] };
}
export function parseArchiveEnvelope(value: unknown): ArchiveEnvelope {
  const e = object(value);
  if (Object.keys(e).sort().join(',') !== 'cipher,ciphertext,compression,format,iv,version' || e.format !== 'next-chapter-encrypted' || e.version !== 1 || e.cipher !== 'AES-256-GCM' || !['none', 'gzip'].includes(String(e.compression)) || typeof e.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(e.iv) || typeof e.ciphertext !== 'string' || e.ciphertext.length < 24 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e.ciphertext)) throw new InputError({ archive: '암호화된 보관 파일을 확인해주세요.' });
  const envelope: ArchiveEnvelope = { format: e.format, version: 1, cipher: e.cipher, compression: e.compression as ArchiveEnvelope['compression'], iv: e.iv, ciphertext: e.ciphertext };
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_ARCHIVE_BYTES) throw new InputError({ archive: '무료 보관 크기를 넘었어요. 기간이나 기록 종류를 줄여주세요.' });
  return envelope;
}
export function archiveCounts(document: ArchiveDocument): ArchiveCounts {
  return Object.fromEntries(document.sections.map(section => [section, document.entries.filter(e => e.section === section).length]));
}
export function parseArchiveCreate(value: unknown) {
  const input = object(value);
  if (Object.keys(input).some(k => !['id', 'from', 'to', 'sections', 'counts', 'envelope'].includes(k))) throw new InputError({ archive: '보관 요청 형식을 확인해주세요.' });
  const options = parseArchiveOptions(input), countsInput = object(input.counts), counts: ArchiveCounts = {};
  if (Object.keys(countsInput).some(k => !options.sections.includes(k as ArchiveSection))) throw new InputError({ archive: '기록 수를 확인해주세요.' });
  for (const section of options.sections) {
    const n = countsInput[section];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100000) throw new InputError({ archive: '기록 수를 확인해주세요.' });
    counts[section] = n;
  }
  if (!Object.values(counts).some(n => n! > 0)) throw new InputError({ archive: '보관할 기록이 없어요.' });
  return { id: uuid(input.id), ...options, counts, envelope: parseArchiveEnvelope(input.envelope) };
}
export function archiveGatewayURL(dataId: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(dataId)) throw new Error('보관 주소를 확인해주세요.');
  return 'https://arweave.net/' + dataId;
}

type Row = Record<string, unknown>;
export type ArchiveSource = Partial<Record<'tasks' | 'reviews' | 'weekReviews' | 'sessions' | 'works' | 'notes' | 'goals' | 'memos' | 'revisits' | 'resources' | 'bookmarks', Row[]>>;
const states: Record<string, string> = { planned: '예정', active: '진행 중', completed: '완료', partial: '일부 진행', not_done: '하지 못함', dropped: '중단', paused: '잠시 멈춤', saved: '예정', book: '책', movie: '영화', drama: '드라마', short: '단기 목표', long: '장기 목표', time: '시간 부족', energy: '피로·컨디션', overload: '계획 과다', difficulty: '예상보다 어려움', priority: '우선순위 변경', other: '기타' };
function str(value: unknown): string { return value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value); }
function localDay(value: unknown): string {
  const text = str(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time + 9 * 3600000).toISOString().slice(0, 10) : '';
}
function blocks(value: unknown): ArchiveEntry['blocks'] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Row).blocks)) return undefined;
  return ((value as Row).blocks as Row[]).map(b => ({ kind: str(b.kind), text: str(b.text), checked: b.checked === true }));
}
export function buildArchiveDocument(options: ArchiveOptions, source: ArchiveSource, now = new Date().toISOString()): ArchiveDocument {
  const entries: ArchiveEntry[] = [], rows = (name: keyof ArchiveSource) => source[name] ?? [];
  const within = (date: string) => Boolean(date) && date >= options.from && date <= options.to;
  const changed = (r: Row) => within(localDay(r.created_at)) || within(localDay(r.updated_at));
  const names = (name: keyof ArchiveSource) => new Map(rows(name).map(r => [r.id, str(r.title)]));
  const works = names('works'), goals = names('goals'), resources = names('resources');
  function entry(section: ArchiveSection, kind: string, r: Row, title: string, pairs: [string, unknown][], date?: string, document?: unknown) {
    entries.push({ section, kind, date: date ?? localDay(r.updated_at ?? r.created_at), title, fields: pairs.map(([label, value]) => ({ label, text: str(value) })).filter(f => f.text !== ''), ...(blocks(document) ? { blocks: blocks(document) } : {}) });
  }
  if (options.sections.includes('days')) {
    for (const r of rows('tasks').filter(r => within(str(r.day)))) entry('days', '할 일', r, str(r.title), [['상태', states[str(r.status)] ?? r.status], ['중요', r.important ? '중요' : ''], ['예상 시간', r.minutes == null ? '' : r.minutes + '분'], ['목표', goals.get(r.goal_id)], ['작품', works.get(r.work_id)], ['메모', r.note], ['공유한 메모', r.public_note], ['지키지 못한 이유', states[str(r.reason)] ?? r.reason], ['이유에 대한 기록', r.reason_detail]], str(r.day));
    for (const r of rows('reviews').filter(r => within(str(r.day)))) entry('days', '하루 회고', r, '하루 회고', r.document ? [] : [['잘 된 것', r.helped], ['어려웠던 것', r.hindered], ['얻은 것', r.gained], ['다음에 해볼 것', r.next_step]], str(r.day), r.document);
    for (const r of rows('weekReviews').filter(r => within(str(r.day)))) entry('days', '주간 회고', r, '주간 회고', [], str(r.day), r.document);
    for (const r of rows('sessions').filter(r => within(str(r.reading_day) || localDay(r.finished_at)) && r.status === 'completed')) entry('days', '집중 기록', r, str(r.task_title || r.work_title) || '집중 기록', [['집중한 시간', Math.floor(Number(r.elapsed_seconds ?? 0) / 60) + '분'], ['작품', r.work_title], ['시작 페이지', r.start_page], ['마친 페이지', r.end_page], ['집중 중 메모', r.memo]], str(r.reading_day) || localDay(r.finished_at));
  }
  if (options.sections.includes('library')) {
    for (const r of rows('works').filter(changed)) entry('library', '작품', r, str(r.title), [['종류', states[str(r.kind)] ?? r.kind], ['작가·감독', r.creator], ['상태', states[str(r.status)] ?? r.status], ['평점', r.rating], ['한 줄 감상', r.summary], ['태그', r.tags], ['진행', r.progress], ['시작일', r.started_on], ['완료일', r.finished_on]]);
    for (const r of rows('notes').filter(changed)) entry('library', '문장과 생각', r, works.get(r.work_id) ?? '작품 기록', [['문장·장면', r.content], ['내 생각', r.thought]]);
  }
  if (options.sections.includes('notes')) {
    for (const r of rows('goals').filter(changed)) entry('notes', '목표', r, str(r.title), [['기간', states[str(r.period)] ?? r.period], ['상태', states[str(r.status)] ?? r.status], ['이유', r.motivation], ['목표 날짜', r.target_day], ['상위 목표', goals.get(r.parent_id)], ['측정 단위', GOAL_METRIC_UNITS[str(r.metric_unit) as keyof typeof GOAL_METRIC_UNITS] ?? r.metric_unit], ['목표량', r.metric_target], ['측정 시작일', r.metric_start_day]]);
    for (const r of rows('memos').filter(changed)) entry('notes', '빠른 메모', r, '빠른 메모', [['내용', r.content]]);
    for (const r of rows('revisits').filter(changed)) entry('notes', '다시 읽은 기록', r, str(r.source_title) || '다시 읽은 기록', [['원래 기록', r.source_text], ['다시 읽은 생각', r.thought], ['원래 날짜', r.source_date ?? r.source_day]]);
  }
  if (options.sections.includes('learning')) {
    for (const r of rows('resources').filter(changed)) entry('learning', '학습 자료', r, str(r.title), [['주소', r.url], ['종류', r.kind === 'article' ? '글' : r.kind === 'video' ? '영상' : '기타'], ['상태', states[str(r.status)] ?? r.status], ['태그', r.tags], ['메모', r.memo]]);
    for (const r of rows('bookmarks').filter(changed)) entry('learning', '영상 북마크', r, resources.get(r.resource_id) ?? '영상 북마크', [['시점', Math.floor(Number(r.seconds) / 60) + ':' + String(Number(r.seconds) % 60).padStart(2, '0')], ['기록', r.label]]);
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.section.localeCompare(b.section));
  return { format: 'next-chapter-records', version: 1, createdAt: now, period: { from: options.from, to: options.to }, sections: options.sections, entries };
}
