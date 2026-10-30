'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ChevronDown } from 'lucide-react';
import { KINDS, STATUSES, MOODS, parseWork, InputError, type Work, type Kind, type Issues } from '@/lib/domain';
import { request, RequestError } from './api-client';
import { ErrorMessage } from './ui';

export function WorkForm({ work, onSaved, cancel }: { work?: Work; onSaved?: (work:Work) => void; cancel?: () => void }) {
  const router = useRouter(), id = useRef<string | null>(work?.id ?? null), lock = useRef(false);
  const [kind, setKind] = useState<Kind>(work?.kind ?? 'book'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [issues, setIssues] = useState<Issues>({});
  const [expanded, setExpanded] = useState(Boolean(work)), [summary, setSummary] = useState(work?.summary ?? '');
  const [progress, setProgress] = useState(String(work?.progress ?? ''));
  const formRef = useRef<HTMLFormElement>(null);
  const fieldProps = (field: string) => ({ 'aria-invalid': Boolean(issues[field]), 'aria-describedby': issues[field] ? 'error-' + field : undefined });
  useEffect(() => {
    const name = Object.keys(issues)[0];
    const field = name && formRef.current?.elements.namedItem(name);
    if (field instanceof HTMLElement) field.focus();
    else if (field instanceof RadioNodeList && field[0] instanceof HTMLElement) field[0].focus();
  }, [issues]);
  const issue = (field: string) => issues[field] ? <span id={'error-' + field} className="field-error">{issues[field]}</span> : null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const data = new FormData(event.currentTarget);
    setError(''); setIssues({});
    try {
      const input = parseWork({ ...work, title: data.get('title'), kind, status: data.get('status'), rating: data.get('rating'), summary,
        creator: data.get('creator'), year: data.get('year'),
        tags: String(data.get('tags') ?? '').split(','), moods: data.getAll('moods'), minutes: data.get('minutes'), progress: data.get('progress'),
        started_on: data.get('started_on'), finished_on: data.get('finished_on') });
      lock.current = true; setBusy(true); id.current ??= crypto.randomUUID();
      const saved = await request<{ work: Work }>(work ? '/api/works/' + work.id : '/api/works', work ? 'PATCH' : 'POST', { ...input, id: id.current,...(work?{expected_summary:work.summary}:{}) });
      if (onSaved) onSaved(saved.work); else { router.push('/library/' + saved.work.id); router.refresh(); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했어요.');
      if (cause instanceof InputError || cause instanceof RequestError) { setIssues(cause.issues); if (Object.keys(cause.issues).some(field => !['title', 'kind', 'status'].includes(field))) setExpanded(true); }
    } finally { lock.current = false; setBusy(false); }
  }
  return <form ref={formRef} className="panel work-form" onSubmit={submit} noValidate>
    {work?.source==='yes24'&&work.source_url&&<p className="field-hint">도서 정보: <a className="source-link" href={work.source_url} target="_blank" rel="noreferrer">예스24 원문 보기 ↗</a></p>}
    <div className="section-heading"><h2>{work ? '작품 정보 수정' : '어떤 작품을 담아둘까요?'}</h2><span className="muted">* 필수 입력</span></div>
    <label>제목 *<input name="title" defaultValue={work?.title} placeholder="기억하고 싶은 작품의 제목" required maxLength={100} aria-invalid={Boolean(issues.title)} aria-describedby={issues.title ? 'error-title' : undefined}/>{issue('title')}</label>
    <div className="form-grid"><label>종류 *<select name="kind" {...fieldProps('kind')} value={kind} onChange={event => setKind(event.target.value as Kind)}>{Object.entries(KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{issue('kind')}</label>
      <label>상태 *<select name="status" {...fieldProps('status')} defaultValue={work?.status ?? 'planned'}>{Object.entries(STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{issue('status')}</label></div>
    <div className="form-grid"><label>작가·감독<input name="creator" {...fieldProps('creator')} defaultValue={work?.creator??''} maxLength={160} placeholder="선택 입력"/>{issue('creator')}</label><label>발표 연도<input name="year" {...fieldProps('year')} type="number" min={1000} max={2100} defaultValue={work?.year??''} placeholder="예: 2024"/>{issue('year')}</label></div>
    <button className="expand-button" type="button" aria-expanded={expanded} aria-controls="optional-fields" onClick={() => setExpanded(!expanded)}>감상과 추가 정보 <span className="muted">선택 입력</span><ChevronDown size={18} style={{ transform: expanded ? 'rotate(180deg)' : undefined }}/></button>
    <div id="optional-fields" hidden={!expanded}>
      <label>한 줄 감상<textarea name="summary" {...fieldProps('summary')} rows={3} value={summary} onChange={event => setSummary(event.target.value)} maxLength={300} placeholder="이 작품이 남긴 느낌을 짧게 적어보세요."/>{issue('summary')}<span className="field-hint">{summary.length} / 300</span></label>
      <div className="form-grid"><label>만족도<select name="rating" {...fieldProps('rating')} defaultValue={work?.rating ?? ''}><option value="">아직 정하지 않았어요</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}점 {'★'.repeat(n)}</option>)}</select>{issue('rating')}</label>
        <label>감상 시간 (분)<input type="number" name="minutes" {...fieldProps('minutes')} min={1} max={2147483647} step={1} defaultValue={work?.minutes ?? ''} placeholder="예: 30"/>{issue('minutes')}<span className="field-hint">{kind === 'movie' ? '한 편을 보는 시간' : kind === 'drama' ? '한 회차를 보는 시간' : '한 번 독서하는 시간'}</span></label></div>
      <label>태그<input name="tags" {...fieldProps('tags')} defaultValue={work?.tags.join(', ')} placeholder="성장, 주말, 다시 보고 싶은"/>{issue('tags')}<span className="field-hint">쉼표로 구분해주세요. 최대 20개, 각 50자.</span></label>
      <fieldset><legend>작품의 분위기</legend><div className="choice-row">{Object.entries(MOODS).map(([key, label]) => <label className="choice" key={key}><input name="moods" {...fieldProps('moods')} type="checkbox" value={key} defaultChecked={work?.moods.includes(key as keyof typeof MOODS)}/><span>{label}</span></label>)}</div>{issue('moods')}</fieldset>
      {kind !== 'movie' && <label>{kind === 'book' ? '현재 페이지' : '현재 회차'}<input name="progress" {...fieldProps('progress')} type="number" min={0} max={2147483647} step={1} value={progress} onChange={event => setProgress(event.target.value)} placeholder="예: 0"/>{issue('progress')}</label>}
      <div className="form-grid"><label>시작일<input name="started_on" {...fieldProps('started_on')} type="date" defaultValue={work?.started_on ?? ''}/>{issue('started_on')}</label><label>완료일<input name="finished_on" {...fieldProps('finished_on')} type="date" defaultValue={work?.finished_on ?? ''}/>{issue('finished_on')}</label></div>
    </div>
    <ErrorMessage error={error}/><div className="form-actions">{cancel && <button className="button secondary" type="button" disabled={busy} onClick={cancel}>취소</button>}<button className="button primary" disabled={busy}><Save size={17}/>{busy ? '저장 중…' : work ? '수정 저장' : '서재에 담기'}</button></div>
  </form>;
}
