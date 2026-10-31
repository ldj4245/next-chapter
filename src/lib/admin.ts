import { InputError, object } from './domain.ts';
import { parseDay } from './planner.ts';

export const ADMIN_SECTIONS = {
  planning: '계획·목표', reviews: '회고', library: '서재', focus: '집중', memos: '메모',
  resources: '학습 자료', photos: '사진', partner: '연결', settings: '설정',
} as const;
export const ADMIN_FEATURES = { planning: '계획·목표', reviews: '회고', focus: '집중 완료', library: '서재', resources: '학습 자료', memos: '메모', photos: '사진 저장', partner: '프로필' } as const;
export const ADMIN_KINDS: Record<string, string> = {
  task: '할 일', goal: '목표', routine: '반복 계획', occurrence: '반복 일정', review: '하루 회고', week_review: '주간 회고',
  work: '작품', note: '문장·생각', focus: '집중 기록', memo: '메모', revisit: '지난 기록', resource: '학습 자료',
  bookmark: '영상 구간', photo: '사진', connection: '연결', invite: '연결 초대', reading_settings: '독서 설정', day_settings: '하루 설정',
};
export type AdminSection = keyof typeof ADMIN_SECTIONS;
export type AdminMember = {
  id: string; email: string | null; nickname: string; created_at: string; last_sign_in_at: string | null;
  last_activity_at: string | null; confirmed: boolean; account_status: 'active' | 'banned' | 'deleted' | 'unconfirmed'; is_test: boolean; is_admin: boolean;
};
export type AdminOverview = {
  registered: number; members: number; tests: number; active_today: number; active_7d: number; active_30d: number;
  tracking_since: string; server_now: string; features: { feature: keyof typeof ADMIN_FEATURES; users: number; saves: number }[];
};
export type AdminMembers = { total: number; offset: number; limit: number; members: AdminMember[] };
export type AdminMemberDetail = AdminMember & { counts: Record<string, number>; tracking_since: string };
export type AdminRecord = { kind: string; id: string; title: string; day: string | null; at: string | null; data: Record<string, unknown> };
export type AdminRecords = { total: number; offset: number; limit: number; records: AdminRecord[] };
export type AdminAudit = { total: number; offset: number; limit: number; before_id: string; events: { id: string; action: string; section: string | null; created_at: string; actor_email: string | null; target_email: string | null }[] };

export function adminAuditCursor(value: string | null): string | null {
  if (value === null) return null;
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > BigInt('9223372036854775807')) throw new InputError({ before: '열람 이력의 페이지를 다시 확인해주세요.' });
  return value;
}

export function adminOffset(value: string | null): number {
  if (value === null) return 0;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1000000) throw new InputError({ offset: '페이지를 확인해주세요.' });
  return Number(value);
}
export function adminSearch(value: string | null): string {
  const search = (value ?? '').trim();
  if (search.length > 120) throw new InputError({ search: '검색어는 120자 이내로 입력해주세요.' });
  return search;
}
export function adminMemberQuery(params: URLSearchParams) {
  const kind = params.get('kind') ?? 'all', sort = params.get('sort') ?? 'joined';
  if (!['all', 'members', 'test'].includes(kind) || !['joined', 'login', 'activity'].includes(sort)) throw new InputError({ filter: '회원 조회 조건을 확인해주세요.' });
  return { p_search: adminSearch(params.get('q')), p_kind: kind, p_sort: sort, p_offset: adminOffset(params.get('offset')) };
}
export function adminRecordQuery(params: URLSearchParams) {
  const section = params.get('section') ?? 'planning';
  if (!Object.hasOwn(ADMIN_SECTIONS, section)) throw new InputError({ section: '기록 종류를 확인해주세요.' });
  const from = params.get('from') ? parseDay(params.get('from')) : null, to = params.get('to') ? parseDay(params.get('to')) : null;
  if (from && to && from > to) throw new InputError({ from: '시작 날짜는 종료 날짜보다 늦을 수 없어요.' });
  return { p_section: section, p_from: from, p_to: to, p_search: adminSearch(params.get('q')), p_offset: adminOffset(params.get('offset')) };
}
export function adminTestFlag(value: unknown): boolean {
  const input = object(value);
  if (typeof input.is_test !== 'boolean') throw new InputError({ is_test: '계정 분류를 확인해주세요.' });
  return input.is_test;
}
export function adminDate(value: string | null, withTime = true): string {
  if (!value) return '기록 없음';
  const date = new Date(value.length === 10 ? value + 'T00:00:00+09:00' : value);
  if (!Number.isFinite(date.getTime())) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}) }).format(date);
}
