'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { Work } from '@/lib/domain';
import { MEMO_KINDS, type Memo, type MemoConversion, type MemoKind, type RevisitEntry, type RevisitResponse } from '@/lib/memory';
import { plannerDay } from '@/lib/planner';
import { request, RequestError } from './api-client';
import { DocumentTextarea, prepareDocumentNavigation, useUnsavedGuard } from './editor';
import { usePartnerResource } from './partner-resource';
import { ErrorMessage } from './ui';

const MEMOS_CHANGED = 'next-chapter:memos-changed';
function announceMemos() { window.dispatchEvent(new Event(MEMOS_CHANGED)); }
function message(cause: unknown) { return cause instanceof Error ? cause.message : '저장하지 못했어요. 작성한 내용을 확인하고 다시 시도해주세요.'; }
function dateLabel(value: string) {
  const date = new Date(value.length === 10 ? value + 'T00:00:00+09:00' : value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(date) : value;
}

function MemoComposer({ compact = false }: { compact?: boolean }) {
  const [content, setContent] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
  const id = useRef<string | null>(null), locked = useRef(false), fieldId = useId();
  useUnsavedGuard(Boolean(content) || busy);
  async function record(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !content.trim()) return;
    locked.current = true; setBusy(true); setError(''); setSaved('');
    const submitted = content, submissionId = id.current ?? crypto.randomUUID();
    id.current = submissionId;
    try {
      const result = await request<{ memo: Memo }>('/api/memos', 'POST', { id: submissionId, content: submitted });
      if (result.memo.content === submitted) { setContent(''); id.current = null; setSaved('기록했어요.'); }
      else { id.current = null; setError('이전 요청의 메모가 저장됐어요. 현재 내용을 확인하고 다시 기록해주세요.'); }
      announceMemos();
    } catch (cause) {
      setError(message(cause));
      if (cause instanceof RequestError && cause.status === 409) {
        try {
          const result = await request<{ memos: Memo[] }>('/api/memos');
          const existing = result.memos.find(memo => memo.id === submissionId);
          if (existing) { id.current = null; announceMemos(); setError('이전 요청의 메모가 저장됐어요. 현재 내용을 확인하고 다시 기록해주세요.'); }
        } catch { /* Keep the same submission ID until its outcome can be checked. */ }
      }
    } finally { locked.current = false; setBusy(false); }
  }
  return <form className={'memo-composer' + (compact ? ' memo-composer-compact' : '')} onSubmit={event => void record(event)}>
    <label htmlFor={fieldId}>{compact ? '메모' : '새 메모'}</label>
    <DocumentTextarea id={fieldId} value={content} onChange={event => { setContent(event.target.value); setSaved(''); }} maxLength={2000} rows={compact ? 2 : 3} disabled={busy} placeholder="떠오른 내용을 적어두세요." aria-describedby={fieldId + '-count'}/>
    <div className="memory-actions"><span id={fieldId + '-count'} className="memory-count">{content.length.toLocaleString('ko-KR')} / 2,000</span><span className="memory-status" role="status">{saved}</span><button type="submit" className="document-button primary" disabled={busy || !content.trim()}>{busy ? '기록 중…' : '기록'}</button></div>
    <ErrorMessage error={error}/>
  </form>;
}

export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const region = useRef<HTMLElement>(null);
  useEffect(() => { if (open) region.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); }, [open]);
  async function close() { if (await prepareDocumentNavigation({ preserveDrafts: true })) onClose(); }
  return <section id="quick-capture" ref={region} className="quick-capture" hidden={!open} aria-label="빠른 메모">
    <div className="quick-capture-inner"><div className="memory-row-actions"><Link className="document-link" href="/notes">모든 메모</Link><button type="button" className="document-button" onClick={() => void close()}>닫기</button></div><MemoComposer compact/></div>
  </section>;
}

export function NotesHome({ organized = false }: { organized?: boolean }) {
  const resource = usePartnerResource<{ memos: Memo[] }>('/api/memos', false, false);
  const [converted, setConverted] = useState<MemoConversion | null>(null);
  const resultLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => { window.addEventListener(MEMOS_CHANGED, resource.refresh); return () => window.removeEventListener(MEMOS_CHANGED, resource.refresh); }, [resource.refresh]);
  useEffect(() => { if (converted) resultLink.current?.focus(); }, [converted]);
  function onConverted(result: MemoConversion) { setConverted(result); announceMemos(); }
  return <div className="document-page memory-document">
    <header className="document-header"><h1>메모</h1></header>
    <MemoComposer/>
    <nav className="memory-tabs" aria-label="메모 보기"><Link href="/notes" aria-current={!organized ? 'page' : undefined}>메모</Link><Link href="/notes?organized=1" aria-current={organized ? 'page' : undefined}>정리한 메모</Link></nav>
    {converted && <p className="memory-result" role="status">{MEMO_KINDS[converted.target.kind]}에 정리했어요. <Link ref={resultLink} className="document-link" href={converted.target.href}>정리한 기록 열기</Link></p>}
    {resource.error && <div className="memory-load-error"><ErrorMessage error={resource.error}/><button className="document-button" type="button" onClick={resource.refresh}>다시 불러오기</button></div>}
    {resource.loading && !resource.data ? <p className="document-empty" role="status">메모를 불러오는 중…</p> : resource.data && <>
      <MemoList key={organized ? 'organized' : 'inbox'} memos={resource.data.memos} organized={organized} onConverted={onConverted}/>
    </>}
  </div>;
}

function MemoList({ memos, organized, onConverted }: { memos: Memo[]; organized: boolean; onConverted: (result: MemoConversion) => void }) {
  const [protectedRows, setProtectedRows] = useState<Map<string, Memo>>(() => new Map()), [deleted, setDeleted] = useState<Set<string>>(() => new Set());
  const protect = useCallback((id: string, memo: Memo | null) => {
    setProtectedRows(previous => {
      if (memo ? previous.get(id) === memo : !previous.has(id)) return previous;
      const next = new Map(previous);
      if (memo) next.set(id, memo); else next.delete(id);
      return next;
    });
  }, []);
  const removed = useCallback((id: string) => {
    setDeleted(previous => new Set(previous).add(id));
    setProtectedRows(previous => { const next = new Map(previous); next.delete(id); return next; });
    announceMemos();
  }, []);
  const latest = new Map(memos.map(memo => [memo.id, memo]));
  const rows = new Map(memos.filter(memo => !deleted.has(memo.id) && Boolean(memo.converted_kind) === organized).map(memo => [memo.id, memo]));
  for (const [id, memo] of protectedRows) if (!deleted.has(id) && !rows.has(id)) rows.set(id, latest.get(id) ?? memo);
  return <><p className="memory-list-count">{rows.size}개의 {organized ? '정리한 메모' : '메모'}</p>{rows.size ? <div className="memo-lines">{[...rows.values()].map(memo => <MemoLine key={memo.id} initial={memo} retained={!latest.has(memo.id) ? '다른 곳에서 삭제한 메모예요. 작성 중인 내용은 이 화면에 유지돼요.' : Boolean(memo.converted_kind) !== organized ? '다른 곳에서 정리한 메모예요. 작성 중인 내용은 이 화면에 유지돼요.' : ''} onConverted={onConverted} onProtection={protect} onDeleted={removed}/>)}</div> : <p className="document-empty">{organized ? '정리한 메모가 아직 없어요. 메모의 ‘정리’에서 할 일, 회고, 작품 기록으로 옮길 수 있어요.' : '적어둔 메모가 없어요.'}</p>}</>;
}

function MemoLine({ initial, retained, onConverted, onProtection, onDeleted }: { initial: Memo; retained: string; onConverted: (result: MemoConversion) => void; onProtection: (id: string, memo: Memo | null) => void; onDeleted: (id: string) => void }) {
  const [localMemo, setMemo] = useState(initial), [draft, setContent] = useState(initial.content), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false), [kind, setKind] = useState<MemoKind>('task'), [day, setDay] = useState(plannerDay), [workId, setWorkId] = useState('');
  const [conflict, setConflict] = useState(false), [latest, setLatest] = useState<Memo | null>(null);
  const canAdopt = draft === localMemo.content && !busy && !conflict;
  const memo = canAdopt && initial.revision >= localMemo.revision ? initial : localMemo;
  const content = canAdopt ? memo.content : draft;
  const lock = useRef(false), fieldId = useId(), dirty = content !== memo.content;
  const works = usePartnerResource<{ works: Work[] }>(conversionOpen && kind === 'note' ? '/api/works' : null, false, false);
  useUnsavedGuard(dirty || busy);
  useEffect(() => { onProtection(memo.id, dirty || busy ? memo : null); }, [memo, dirty, busy, onProtection]);
  useEffect(() => () => onProtection(initial.id, null), [initial.id, onProtection]);
  async function update(base: Memo) {
    const result = await request<{ memo: Memo }>('/api/memos/' + memo.id, 'PATCH', { content, revision: base.revision });
    setMemo(result.memo); setContent(result.memo.content); setConflict(false); setLatest(null); setSaved('저장했어요.');
    return result.memo;
  }
  function failed(cause: unknown) { setError(message(cause)); if (cause instanceof RequestError && cause.status === 409) { setConflict(true); setLatest(null); } }
  async function save(base = memo) {
    if (lock.current || !content.trim()) return;
    lock.current = true; setBusy(true); setError(''); setSaved('');
    try { await update(base); announceMemos(); } catch (cause) { failed(cause); }
    finally { lock.current = false; setBusy(false); }
  }
  async function checkLatest() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const result = await request<{ memos: Memo[] }>('/api/memos');
      const current = result.memos.find(item => item.id === memo.id);
      if (!current) { setError('메모가 삭제됐거나 더 이상 열 수 없어요. 작성한 내용은 유지돼요.'); return; }
      setLatest(current);
    } catch (cause) { setError(message(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function convert(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !content.trim()) return;
    setMemo(memo); setContent(content);
    lock.current = true; setBusy(true); setError(''); setSaved('');
    try {
      const current = dirty ? await update(memo) : memo;
      const result = await request<MemoConversion>('/api/memos/' + memo.id + '/convert', 'POST', { kind, day, ...(kind === 'note' ? { work_id: workId } : {}), revision: current.revision });
      setMemo(result.memo); setContent(result.memo.content); setConversionOpen(false); onConverted(result);
    } catch (cause) { failed(cause); }
    finally { lock.current = false; setBusy(false); }
  }
  async function remove() {
    if (lock.current) return;
    setMemo(memo); setContent(content);
    lock.current = true; setBusy(true); setError('');
    try { await request('/api/memos/' + memo.id, 'DELETE'); onDeleted(memo.id); }
    catch (cause) { setError(message(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <article id={'memo-' + memo.id} className="memo-line">
    <div className="memory-meta"><time dateTime={memo.created_at}>{dateLabel(memo.created_at)}</time>{memo.converted_kind && <span>{MEMO_KINDS[memo.converted_kind]}에 정리함</span>}</div>
    {retained && <p className="memo-retained" role="status">{retained}</p>}
    {memo.converted_kind ? <><p className="memory-writing">{memo.content}</p>{memo.converted_href && <Link className="document-link" href={memo.converted_href}>정리한 기록 열기</Link>}</> : <>
      <label className="sr-only" htmlFor={fieldId}>메모 내용</label><DocumentTextarea id={fieldId} value={content} maxLength={2000} disabled={busy} onChange={event => { setMemo(memo); setContent(event.target.value); setSaved(''); }} aria-describedby={fieldId + '-count'}/>
      <div className="memory-actions"><span id={fieldId + '-count'} className="memory-count">{content.length.toLocaleString('ko-KR')} / 2,000</span><span className="memory-status" role="status">{saved}</span><button className="document-button" type="button" disabled={busy || !dirty || !content.trim()} onClick={() => void save()}>{busy ? '처리 중…' : '저장'}</button><button className="document-button" type="button" disabled={busy} aria-expanded={conversionOpen} aria-controls={fieldId + '-conversion'} onClick={() => setConversionOpen(value => !value)}>정리</button></div>
      <ErrorMessage error={error}/>
      {conflict && <div className="memo-conflict"><p>저장된 메모를 확인한 뒤 다시 저장할 수 있어요. 작성한 내용은 위에 유지돼요.</p><button className="document-button" type="button" disabled={busy} onClick={() => void checkLatest()}>저장된 메모 확인</button>{latest && <><p className="memory-label">현재 저장된 내용{latest.converted_kind ? ' · 이미 정리한 메모' : ''}</p><p className="memory-writing">{latest.content}</p><div className="memory-row-actions"><button className="document-button secondary" type="button" disabled={busy} onClick={() => { setMemo(latest); setContent(latest.content); setLatest(null); setConflict(false); setError(''); }}>저장된 내용으로 바꾸기</button>{!latest.converted_kind && <button className="document-button" type="button" disabled={busy || !content.trim()} onClick={() => void save(latest)}>내 내용으로 저장</button>}</div></>}</div>}
      <form id={fieldId + '-conversion'} className="memo-conversion" hidden={!conversionOpen} onSubmit={event => void convert(event)}>
        <div className="memo-conversion-fields"><label>정리할 곳<select value={kind} disabled={busy} onChange={event => setKind(event.target.value as MemoKind)}>{Object.entries(MEMO_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{kind === 'note' ? <label>작품<select value={workId} onChange={event => setWorkId(event.target.value)} disabled={busy || works.loading} required><option value="">작품 선택</option>{works.data?.works.map(work => <option value={work.id} key={work.id}>{work.title}</option>)}</select></label> : <label>날짜<input type="date" value={day} min="1900-01-01" max="2100-12-31" disabled={busy} required onChange={event => setDay(event.target.value)}/></label>}</div>
        {kind === 'note' && works.loading && <p className="memory-hint" role="status">작품을 불러오는 중…</p>}{kind === 'note' && works.error && <><ErrorMessage error={works.error}/><button className="document-button" type="button" disabled={busy} onClick={works.refresh}>작품 다시 불러오기</button></>}{kind === 'note' && works.data && !works.data.works.length && <p className="memory-hint">서재에 작품을 추가한 뒤 정리할 수 있어요. <Link className="document-link" href="/library/new">작품 추가</Link></p>}
        <div className="memory-actions"><p className="memory-hint">원래 메모는 정리한 메모에 남아요.</p><button className="document-button secondary" type="submit" disabled={busy || conflict || !content.trim() || (kind === 'note' && (!workId || !works.data))}>{busy ? '정리 중…' : dirty ? '저장하고 정리' : '정리하기'}</button></div>
      </form>
    </>}
    <div className="memo-delete">{confirmDelete ? <><p>{memo.converted_kind ? '메모 원본을 삭제할까요? 정리한 기록은 남아요.' : dirty ? '이 메모와 작성 중인 내용을 삭제할까요?' : '이 메모를 삭제할까요?'}</p><div className="memory-row-actions"><button className="document-button" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>취소</button><button className="document-button secondary" type="button" disabled={busy} onClick={() => void remove()}>{busy ? '삭제 중…' : '메모 삭제'}</button></div></> : <button className="document-button" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>삭제</button>}</div>
    {memo.converted_kind && <ErrorMessage error={error}/>}
  </article>;
}

export function RevisitHome({ entry }: { entry?: string }) {
  const resource = usePartnerResource<RevisitResponse>(entry ? '/api/revisit?entry=' + encodeURIComponent(entry) : '/api/revisit?offset=0', false, false);
  return <div className="document-page memory-document revisit-document"><header className="document-header"><h1>다시 읽기</h1></header>
    {resource.error && <div className="memory-load-error"><ErrorMessage error={resource.error}/><button className="document-button" type="button" onClick={resource.refresh}>다시 불러오기</button></div>}
    {resource.loading && !resource.data ? <p className="document-empty" role="status">기록을 불러오는 중…</p> : resource.data && <RevisitDocument key={entry ?? 'older'} initial={resource.data}/>}
  </div>;
}

function RevisitDocument({ initial }: { initial: RevisitResponse }) {
  const [result, setResult] = useState(initial), [thought, setThought] = useState(''), [busy, setBusy] = useState(false), [moving, setMoving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
  const id = useRef<string | null>(null), lock = useRef(false), heading = useRef<HTMLHeadingElement>(null), fieldId = useId();
  useUnsavedGuard(Boolean(thought) || busy || moving);
  const record = result.record;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record || lock.current || !thought.trim()) return;
    lock.current = true; setBusy(true); setError(''); setSaved('');
    const submissionId = id.current ?? crypto.randomUUID(), submitted = thought;
    id.current = submissionId;
    try {
      const response = await request<{ entry: RevisitEntry }>('/api/revisit', 'POST', { id: submissionId, source_kind: record.kind, source_id: record.source_id, source_day: record.source_day, thought: submitted });
      setResult(previous => ({ ...previous, entries: [response.entry, ...previous.entries.filter(item => item.id !== response.entry.id)] }));
      if (response.entry.thought === submitted) { setThought(''); id.current = null; setSaved('기록했어요.'); }
      else { id.current = null; setError('이전 요청의 생각이 저장됐어요. 현재 내용을 확인하고 다시 기록해주세요.'); }
    } catch (cause) {
      setError(message(cause));
      if (cause instanceof RequestError && cause.status === 409) {
        try {
          const response = await request<RevisitResponse>('/api/revisit?entry=' + encodeURIComponent(submissionId));
          const existing = response.entries.find(item => item.id === submissionId);
          if (existing) { id.current = null; setResult(previous => ({ ...previous, entries: [existing, ...previous.entries.filter(item => item.id !== existing.id)] })); setError('이전 요청의 생각이 저장됐어요. 현재 내용을 확인하고 다시 기록해주세요.'); }
        } catch { /* Preserve the pending ID and draft when the prior write cannot be checked. */ }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  async function another() {
    if (result.next_offset === null || lock.current || !await prepareDocumentNavigation()) return;
    if (lock.current) return;
    lock.current = true; setMoving(true); setError(''); setSaved('');
    try {
      const next = await request<RevisitResponse>('/api/revisit?offset=' + result.next_offset);
      setResult(next); setThought(''); id.current = null;
      requestAnimationFrame(() => heading.current?.focus());
    } catch (cause) { setError(message(cause)); }
    finally { lock.current = false; setMoving(false); }
  }
  return <>
    {record ? <>
      <section className="revisit-source" aria-labelledby={fieldId + '-source'}><div className="memory-meta"><time dateTime={record.date}>{dateLabel(record.date)}</time><span>{record.kind === 'review' ? '회고' : '작품 기록'}</span></div><h2 ref={heading} id={fieldId + '-source'} tabIndex={-1}>{record.title}</h2><p className="memory-writing">{record.text}</p><Link className="document-link" href={record.href}>원래 기록</Link></section>
      <form className="revisit-thought" onSubmit={event => void save(event)}><label htmlFor={fieldId}>지금의 생각</label><DocumentTextarea id={fieldId} value={thought} onChange={event => { setThought(event.target.value); setSaved(''); }} maxLength={4000} rows={3} disabled={busy || moving} aria-describedby={fieldId + '-count'} placeholder="다시 읽으며 떠오른 생각을 적어보세요."/><div className="memory-actions"><span id={fieldId + '-count'} className="memory-count">{thought.length.toLocaleString('ko-KR')} / 4,000</span><span className="memory-status" role="status">{saved}</span><button className="document-button primary" type="submit" disabled={busy || moving || !thought.trim()}>{busy ? '기록 중…' : '기록'}</button></div></form>
      <ErrorMessage error={error}/>
      {result.entries.length > 0 && <section className="revisit-responses" aria-label="이 기록을 다시 읽으며 남긴 생각">{result.entries.map(item => <article className="revisit-response" id={'revisit-' + item.id} key={item.id}><time className="memory-meta" dateTime={item.created_at}>{dateLabel(item.created_at)}</time><p className="memory-writing">{item.thought}</p></article>)}</section>}
    </> : <><div className="document-empty"><h2>아직 다시 읽을 기록이 없어요.</h2><p>7일 이상 지난 회고나 작품 기록이 생기면 이곳에서 다시 읽을 수 있어요.</p></div><ErrorMessage error={error}/></>}
    {result.next_offset !== null && <div className="revisit-next"><button className="document-button secondary" type="button" disabled={busy || moving} onClick={() => void another()}>{moving ? '불러오는 중…' : '다른 기록'}</button></div>}
  </>;
}
