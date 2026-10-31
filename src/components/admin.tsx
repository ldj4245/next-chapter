'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { ADMIN_FEATURES, ADMIN_KINDS, ADMIN_SECTIONS, adminDate, type AdminAudit, type AdminMemberDetail, type AdminMembers, type AdminOverview, type AdminRecord, type AdminRecords, type AdminSection } from '@/lib/admin';
import { parseReflection } from '@/lib/reflection';
import { ReflectionContent } from './reflection';
import { request, useAction, useResource } from './api-client';
import { BrandMark } from './ui';

export function AdminNavigation() {
  const pathname = usePathname();
  return <header className="admin-topbar"><Link href="/" className="admin-brand"><BrandMark/><span>다음 장</span><small>관리</small></Link><nav aria-label="관리 메뉴"><Link href="/admin" aria-current={pathname === '/admin' ? 'page' : undefined}>회원</Link><Link href="/admin/audit" aria-current={pathname === '/admin/audit' ? 'page' : undefined}>열람 이력</Link></nav><Link className="admin-return" href="/"><ArrowLeft size={15}/><span>내 공간</span></Link></header>;
}

function useAdminResource<T>(path: string) {
  const resource = useResource<T>(path);
  const refresh = resource.refresh;
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [refresh]);
  return resource;
}
function LoadState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return loading ? <p className="admin-load" role="status">불러오는 중…</p> : error ? <div className="admin-load-error" role="alert"><p>{error}</p><button type="button" className="text-button" onClick={retry}>다시 확인</button></div> : null;
}
export function AdminPagination({ offset, total, limit, change }: { offset: number; total: number; limit: number; change: (offset: number) => void }) {
  if (total <= limit && offset === 0) return null;
  return <nav className="admin-pagination" aria-label="조회 결과 페이지"><span>{total ? `${Math.min(offset + 1, total)}–${Math.min(offset + limit, total)} / ${total}` : '0개'}</span><button type="button" aria-label="이전 페이지" disabled={offset === 0} onClick={() => change(Math.max(0, offset - limit))}><ChevronLeft size={18}/></button><button type="button" aria-label="다음 페이지" disabled={offset + limit >= total} onClick={() => change(offset + limit)}><ChevronRight size={18}/></button></nav>;
}

export function AdminHome() {
  const overview = useAdminResource<AdminOverview>('/api/admin/overview');
  const [draft, setDraft] = useState(''), [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [sort, setSort] = useState('joined'), [offset, setOffset] = useState(0), [selected, setSelected] = useState<string | null>(null);
  const params = new URLSearchParams({ q: query, kind, sort, offset: String(offset) });
  const members = useAdminResource<AdminMembers>('/api/admin/members?' + params);
  function refresh() { overview.refresh(); members.refresh(); }
  function close() { const id = selected; setSelected(null); setTimeout(() => { document.getElementById('member-' + id)?.focus(); }, 0); }
  return <div className="admin-home"><header className="admin-page-heading"><div><p className="eyebrow">서비스 운영</p><h1>회원</h1></div><button type="button" className="text-button" onClick={refresh}><RefreshCw size={15}/>새로고침</button></header>
    <LoadState {...overview} retry={overview.refresh}/>
    {overview.data && <><dl className="admin-summary"><div><dt>전체 계정</dt><dd>{overview.data.registered}<small>테스트 {overview.data.tests}</small></dd></div><div><dt>오늘 활동</dt><dd>{overview.data.active_today}</dd></div><div><dt>최근 7일</dt><dd>{overview.data.active_7d}</dd></div><div><dt>최근 30일</dt><dd>{overview.data.active_30d}</dd></div></dl><p className="admin-stat-note">활동은 저장·완료한 계정 수이며 테스트 계정은 제외해요. {adminDate(overview.data.tracking_since, false)}부터 집계 · 한국 시간</p>
    <details className="admin-feature-summary"><summary>최근 30일 기능별 이용</summary><div className="admin-feature-grid">{Object.entries(ADMIN_FEATURES).map(([key, label]) => { const entry = overview.data!.features.find(item => item.feature === key); return <div key={key}><span>{label}</span><strong>{entry?.users ?? 0}<small>명 · {entry?.saves ?? 0}회</small></strong></div>; })}</div><p>저장 횟수에는 내용 수정이 포함돼요. 집중은 완료 시, 사진은 저장 완료 시 집계해요.</p></details></>}
    <div className="admin-members-layout" data-selected={Boolean(selected)}><section className="admin-member-list" aria-label="회원 목록" hidden={false}>
      <form className="admin-member-tools" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setOffset(0); }}><div className="admin-search"><Search size={17}/><input aria-label="이메일 또는 닉네임 검색" type="search" value={draft} onChange={event => setDraft(event.target.value)} maxLength={120} placeholder="이메일 또는 닉네임"/><button type="submit">검색</button></div><div className="admin-list-options"><select aria-label="계정 분류" value={kind} onChange={event => { setKind(event.target.value); setOffset(0); }}><option value="all">전체 계정</option><option value="members">일반 계정</option><option value="test">테스트 계정</option></select><select aria-label="회원 정렬" value={sort} onChange={event => { setSort(event.target.value); setOffset(0); }}><option value="joined">최근 가입순</option><option value="login">최근 로그인순</option><option value="activity">최근 활동순</option></select></div></form>
      <LoadState {...members} retry={members.refresh}/>
      {members.data && <><div className="admin-list-caption"><span>{query ? '검색 결과' : '가입 계정'} <strong>{members.data.total}</strong></span><span>마지막 로그인 · 한국 시간</span></div>{members.data.members.length ? <table className="admin-members-table"><thead><tr><th scope="col">계정</th><th scope="col" className="admin-joined-col">가입일</th><th scope="col">마지막 로그인</th></tr></thead><tbody>{members.data.members.map(member => <tr key={member.id} data-selected={selected === member.id}><td><button type="button" id={'member-' + member.id} className="admin-member-select" onClick={() => setSelected(member.id)} aria-pressed={selected === member.id}><strong>{member.email ?? '이메일 없음'}</strong><span>{member.nickname || '닉네임 없음'}{member.is_admin && <small>관리자</small>}{member.is_test && <small>테스트</small>}{member.account_status !== 'active' && <small>{accountStatus(member.account_status)}</small>}</span></button></td><td className="admin-joined-col">{adminDate(member.created_at, false)}</td><td><time dateTime={member.last_sign_in_at ?? undefined}>{adminDate(member.last_sign_in_at)}</time></td></tr>)}</tbody></table> : <p className="admin-empty">{query ? '검색한 계정이 없어요.' : '이 분류에 등록된 계정이 없어요.'}</p>}<AdminPagination {...members.data} change={setOffset}/></>}
    </section>{selected && <AdminMemberPanel key={selected} id={selected} close={close} changed={refresh}/>}</div>
  </div>;
}
function accountStatus(value: string): string { return ({ active: '사용 가능', banned: '정지', deleted: '삭제 처리', unconfirmed: '이메일 미인증' } as Record<string, string>)[value] ?? value; }

const sectionKinds: Record<AdminSection, string[]> = { planning: ['task', 'goal', 'routine', 'occurrence'], reviews: ['review', 'week_review'], library: ['work', 'note'], focus: ['focus'], memos: ['memo', 'revisit'], resources: ['resource', 'bookmark'], photos: ['photo'], partner: ['connection', 'invite'], settings: ['reading_settings', 'day_settings'] };
export function AdminMemberPanel({ id, close, changed }: { id: string; close: () => void; changed: () => void }) {
  const member = useAdminResource<AdminMemberDetail>('/api/admin/members/' + id), action = useAction(), heading = useRef<HTMLHeadingElement>(null);
  const [section, setSection] = useState<AdminSection>('planning');
  useEffect(() => { heading.current?.focus(); }, []);
  async function classify() {
    if (!member.data) return;
    await action.run(async () => { await request('/api/admin/members/' + id, 'PATCH', { is_test: !member.data!.is_test }); member.refresh(); changed(); });
  }
  return <aside className="admin-member-panel" aria-labelledby="admin-member-title"><div className="admin-panel-header"><h2 id="admin-member-title" ref={heading} tabIndex={-1}>회원 기록</h2><button type="button" className="admin-close" onClick={close} aria-label="회원 기록 닫기"><X size={20}/></button></div><LoadState {...member} retry={member.refresh}/>
    {member.data && <><div className="admin-member-identity"><h3>{member.data.email ?? '이메일 없음'}</h3><p>{member.data.nickname || '닉네임 없음'}<span>{accountStatus(member.data.account_status)}</span>{member.data.is_admin && <span>관리자</span>}</p></div><dl className="admin-member-facts"><div><dt>가입</dt><dd>{adminDate(member.data.created_at)}</dd></div><div><dt>마지막 로그인</dt><dd>{adminDate(member.data.last_sign_in_at)}</dd></div><div><dt>최근 활동</dt><dd>{member.data.last_activity_at ? adminDate(member.data.last_activity_at) : '최근 90일 기록 없음'}</dd></div></dl><div className="admin-classification"><span>{member.data.is_test ? '테스트 계정 · 이용 통계에서 제외' : '일반 계정 · 이용 통계에 포함'}</span><button type="button" disabled={action.busy} onClick={classify}>{action.busy ? '변경 중…' : member.data.is_test ? '일반 계정으로 변경' : '테스트 계정으로 변경'}</button></div>{action.error && <p className="error" role="alert">{action.error}</p>}
    <nav className="admin-record-tabs" aria-label="회원 기록 종류">{Object.entries(ADMIN_SECTIONS).map(([key, label]) => <button type="button" key={key} aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key as AdminSection)}>{label}<span>{sectionKinds[key as AdminSection].reduce((sum, kind) => sum + (member.data!.counts[kind] ?? 0), 0)}</span></button>)}</nav><AdminRecordList key={section} userId={id} section={section}/><Link className="admin-member-audit" href={'/admin/audit?user=' + id}>이 회원의 열람 이력<ChevronRight size={15}/></Link></>}
  </aside>;
}

export function AdminRecordList({ userId, section }: { userId: string; section: AdminSection }) {
  const [draft, setDraft] = useState({ q: '', from: '', to: '' }), [filter, setFilter] = useState(draft), [offset, setOffset] = useState(0), [validation, setValidation] = useState('');
  const params = new URLSearchParams({ ...filter, section, offset: String(offset) });
  const records = useAdminResource<AdminRecords>('/api/admin/members/' + userId + '/records?' + params);
  function submit(event: FormEvent) { event.preventDefault(); if (draft.from && draft.to && draft.from > draft.to) { setValidation('시작 날짜는 종료 날짜보다 늦을 수 없어요.'); return; } setValidation(''); setFilter({ ...draft, q: draft.q.trim() }); setOffset(0); }
  return <section className="admin-record-section" aria-label={ADMIN_SECTIONS[section]}><form className="admin-record-filter" onSubmit={submit}><div className="admin-date-range"><label>시작일<input type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })}/></label><span aria-hidden="true">–</span><label>종료일<input type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })}/></label></div><div className="admin-record-search"><input aria-label="선택한 종류의 기록 검색" type="search" maxLength={120} placeholder="제목·본문 검색" value={draft.q} onChange={event => setDraft({ ...draft, q: event.target.value })}/><button type="submit">적용</button>{(filter.q || filter.from || filter.to) && <button type="button" onClick={() => { const empty = { q: '', from: '', to: '' }; setDraft(empty); setFilter(empty); setValidation(''); setOffset(0); }}>초기화</button>}</div></form>{validation && <p className="error" role="alert">{validation}</p>}<p className="admin-filter-note">할 일·회고·집중은 기록 날짜, 그 외에는 처음 저장한 날짜 기준이에요.</p><LoadState {...records} retry={records.refresh}/>
    {records.data && <><p className="admin-record-total">{records.data.total}개의 기록</p>{records.data.records.length ? records.data.records.map(record => <AdminRecordEntry key={record.kind + '/' + record.id} record={record}/>) : <p className="admin-empty">이 조건에 해당하는 기록이 없어요.</p>}<AdminPagination {...records.data} change={setOffset}/></>}
  </section>;
}

const textFields: Record<string, string> = { note: '개인 메모', content: '문장·내용', thought: '내 생각', source_text: '당시 기록', source_title: '원래 제목', memo: '메모', motivation: '목표를 정한 이유', summary: '한줄평', description: '작품 소개', public_note: '상대에게 공유한 문장', reason_detail: '이유', helped: '잘 된 것', hindered: '어려웠던 것', gained: '얻은 것', next_step: '다음에 해볼 것' };
const fieldLabels: Record<string, string> = { id: '기록 ID', title: '제목', kind: '종류', status: '상태', important: '중요', minutes: '예상 시간(분)', reason: '미완료 원인', goal_title: '연결 목표', work_title: '연결 작품', period: '목표 기간', target_day: '목표일', parent_id: '상위 목표 ID', metric_unit: '측정 기준', metric_target: '목표량', metric_start_day: '측정 시작일', weekdays: '반복 요일', start_day: '시작일', end_day: '종료일', active: '사용 중', creator: '저자·제작자', year: '출간·공개 연도', rating: '평점', progress: '진행도', started_on: '감상 시작일', finished_on: '감상 완료일', tags: '태그', moods: '분위기', url: '자료 주소', source_url: '출처 주소', cover_url: '표지 주소', source: '정보 출처', source_id: '출처 ID', elapsed_seconds: '집중 시간', target_seconds: '목표 시간', running_since: '측정 재개', end_page: '끝낸 페이지', start_page: '시작 페이지', is_reading: '독서 기록', seconds: '영상 위치', label: '구간 메모', resource_url: '영상 주소', created_at: '처음 저장', updated_at: '마지막 수정', started_at: '집중 시작', finished_at: '집중 완료', completed_at: '할 일 완료', converted_at: '정리한 시각', converted_kind: '정리한 종류', converted_day: '정리한 날짜', source_date: '원래 기록 날짜', source_kind: '원래 기록 종류', source_day: '원래 회고 날짜', shared: '상대 공유', photos_shared: '사진 공유', peer_email: '연결 계정', peer_nickname: '연결 닉네임', connected_at: '연결일', revoked_at: '연결 해제', expires_at: '초대 만료', accepted_at: '초대 수락', cue: '독서 계기', reminder_time: '독서 설정 시각', available_minutes: '기존 여유 시간 설정(분)', task_day: '할 일 날짜', day: '기록 날짜', state: '사진 상태', width: '가로 크기', height: '세로 크기', bytes: '사진 용량', thumbnail_bytes: '미리보기 용량', mime_type: '파일 형식', goal_id: '목표 ID', work_id: '작품 ID', task_id: '할 일 ID', routine_id: '반복 계획 ID', carried_from_id: '이어온 할 일 ID', note_id: '작품 기록 ID', resource_id: '자료 ID', converted_id: '정리한 기록 ID', source_id_record: '원래 기록 ID', source_work_id: '원래 작품 ID', peer_id: '연결 계정 ID', shared_connection_id: '할 일 공유 연결 ID', photo_connection_id: '사진 공유 연결 ID' };
const values: Record<string, string> = { planned: '예정', saved: '예정', completed: '완료', dropped: '중단', partial: '일부 진행', not_done: '하지 못함', paused: '잠시 멈춤', book: '책', movie: '영화', drama: '드라마', article: '글', video: '영상', other: '기타', short: '단기', long: '장기', time: '시간 부족', energy: '피로·컨디션', overload: '계획 과다', difficulty: '예상보다 어려움', priority: '우선순위 변경', ready: '저장 완료', pending: '저장 처리 중', calm: '편안함', immersive: '몰입', thoughtful: '생각할 거리', light: '가벼움', task: '할 일', review: '회고', note: '작품 기록' };
function displayValue(key: string, value: unknown) {
  if (typeof value === 'boolean') return value ? '예' : '아니요';
  if (key.endsWith('_seconds') || key === 'seconds') { const seconds = Number(value); return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`; }
  if (key === 'weekdays' && Array.isArray(value)) return value.map(day => ['월', '화', '수', '목', '금', '토', '일'][Number(day) - 1]).join(' · ');
  if (Array.isArray(value)) return value.map(item => values[String(item)] ?? String(item)).join(' · ');
  if (key.endsWith('_at') || key === 'running_since') return adminDate(String(value));
  if (key === 'bytes' || key === 'thumbnail_bytes') return Math.round(Number(value) / 1024) + ' KB';
  if (value === 'active') return '진행 중';
  return values[String(value)] ?? String(value);
}
function safeLink(value: unknown): string | null { try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }

export function AdminRecordEntry({ record }: { record: AdminRecord }) {
  const [open, setOpen] = useState(false), [imageError, setImageError] = useState(false), data = record.data;
  let document = null;
  try { if (data.document) document = parseReflection(data.document); } catch { /* Historical text remains visible below. */ }
  const excluded = new Set(['title', 'document', 'revision', ...Object.keys(textFields)]);
  const metadata = Object.entries(data).filter(([key, value]) => !excluded.has(key) && fieldLabels[key] && value !== null && value !== '' && (!Array.isArray(value) || value.length));
  return <details className="admin-record" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary><span className="admin-record-kind">{ADMIN_KINDS[record.kind] ?? '기록'}</span><strong>{record.title}</strong><time>{record.day ? adminDate(record.day, false) : '날짜 없음'}</time></summary>{open && <div className="admin-record-body">
    {document && <ReflectionContent document={document}/>}
    {Object.entries(textFields).map(([key, label]) => { const value = data[key]; if (document && ['helped', 'hindered', 'gained', 'next_step'].includes(key)) return null; return typeof value === 'string' && value ? <section className="admin-record-text" key={key}><h4>{label}</h4><p>{value}</p></section> : null; })}
    {document && ['helped', 'hindered', 'gained', 'next_step'].some(key => Boolean(data[key])) && <details className="admin-legacy-review"><summary>이전 형식으로 남아 있는 회고</summary>{['helped', 'hindered', 'gained', 'next_step'].map(key => typeof data[key] === 'string' && data[key] ? <section className="admin-record-text" key={key}><h4>{textFields[key]}</h4><p>{String(data[key])}</p></section> : null)}</details>}
    {record.kind === 'photo' && (data.state === 'ready' ? <div className="admin-photo">{imageError ? <p role="status">사진을 불러오지 못했어요. 원본 보기에서 다시 확인할 수 있어요.</p> : <Image unoptimized src={'/api/admin/photos/' + record.id + '?size=thumb'} width={Number(data.width) || 320} height={Number(data.height) || 240} alt={record.title + '에 첨부한 사진'} onError={() => setImageError(true)} loading="lazy" referrerPolicy="no-referrer"/>}<a href={'/api/admin/photos/' + record.id} target="_blank" rel="noreferrer">원본 보기<ArrowUpRight size={14}/></a></div> : <p className="admin-filter-note">사진 저장 처리가 아직 완료되지 않았어요.</p>)}
    {metadata.length > 0 && <dl className="admin-record-metadata">{metadata.map(([key, value]) => { const url = ['url', 'source_url', 'cover_url', 'resource_url'].includes(key) ? safeLink(value) : null; return <div key={key}><dt>{fieldLabels[key]}</dt><dd>{url ? <a href={url} target="_blank" rel="noreferrer">{url}<ArrowUpRight size={12}/></a> : displayValue(key, value)}</dd></div>; })}</dl>}
  </div>}</details>;
}

const auditActions: Record<string, string> = { overview: '운영 현황 조회', members: '회원 목록 조회', member: '회원 정보 조회', records: '회원 기록 조회', photo: '사진 열람', classification: '계정 분류 변경', audit: '열람 이력 조회' };
export function AdminAuditPage({ userId }: { userId: string | null }) {
  const [page, setPage] = useState<{ offset: number; before: string | null }>({ offset: 0, before: null }), params = new URLSearchParams({ offset: String(page.offset), ...(userId ? { user: userId } : {}), ...(page.before ? { before: page.before } : {}) });
  const audit = useAdminResource<AdminAudit>('/api/admin/audit?' + params);
  function refresh() { if (page.before || page.offset) setPage({ offset: 0, before: null }); else audit.refresh(); }
  return <section><header className="admin-page-heading"><div><p className="eyebrow">관리자 활동</p><h1>열람 이력</h1><p className="muted">최근 90일의 조회와 계정 분류 변경 내역이에요. 한국 시간 기준으로 표시해요.</p></div><button type="button" className="text-button" onClick={refresh}><RefreshCw size={15}/>새로고침</button></header>{userId && <p className="admin-audit-filter">선택한 회원의 이력<Link href="/admin/audit">전체 이력 보기</Link></p>}<LoadState {...audit} retry={audit.refresh}/>{audit.data && <><div className="admin-audit-list">{audit.data.events.map(event => <article key={event.id}><time dateTime={event.created_at}>{adminDate(event.created_at)}</time><div><h2>{auditActions[event.action] ?? event.action}{event.section && Object.hasOwn(ADMIN_SECTIONS, event.section) && <small> · {ADMIN_SECTIONS[event.section as AdminSection]}</small>}</h2><p>{event.actor_email ?? '삭제된 관리자'}{event.target_email && <><span aria-hidden="true"> → </span>{event.target_email}</>}{event.action === 'classification' && <span> · {event.section === 'test' ? '테스트 계정' : '일반 계정'}</span>}</p></div></article>)}{!audit.data.events.length && <p className="admin-empty">저장된 이력이 없어요.</p>}</div><AdminPagination {...audit.data} change={offset => setPage({ offset, before: audit.data!.before_id })}/></>}</section>;
}
