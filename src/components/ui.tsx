'use client';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, LoaderCircle, X, Layers3 } from 'lucide-react';
import { KINDS, STATUSES, type Kind, type Work } from '@/lib/domain';
import { catalogURL } from '@/lib/catalog-types';

export function BrandMark() {
  return <svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M7 7h10v22H7zM21 7h8v22h-8z" fill="currentColor"/><path d="m17 7 4 4v18l-4-4V7Z" fill="currentColor" opacity=".4"/></svg>;
}
export function useModal(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current, focused = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close(); document.body.style.overflow = overflow;
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    };
  }, [ref]);
}
export function closeOnBackdrop(event: React.MouseEvent<HTMLDialogElement>, close: () => void, busy = false) {
  if (busy || event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
}
export function ErrorMessage({ error }: { error: string }) { return error ? <p className="error" role="alert">{error}{error.includes('로그인이 필요')&&<><br/><Link href="/login" target="_blank" rel="noopener noreferrer" className="text-button">새 탭에서 로그인</Link><span className="field-hint">로그인한 뒤 이 화면에서 다시 저장해주세요.</span></>}</p> : null; }
export function Loading() { return <div className="state" role="status"><LoaderCircle size={21} className="spin"/>불러오는 중</div>; }
export function ResourceError({ error, retry }: { error: string; retry: () => void }) {
  return <div className="panel state"><ErrorMessage error={error}/><button className="button secondary" onClick={retry}>다시 불러오기</button></div>;
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><span className="empty-mark"><Layers3 size={24}/></span><h3>{title}</h3>{children}</div>;
}
export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div><div className="header-actions">{children}</div></header>;
}
export function Cover({ url, title, kind, priority = false }: { url?: string; title: string; kind: Kind; priority?: boolean }) {
  const source = catalogURL(url, true);
  const [failed, setFailed] = useState('');
  const show = source && failed !== source;
  return <div className={'cover cover-' + kind}>
    {show ? <Image src={source} alt={title + ' 표지'} fill unoptimized sizes="(max-width: 640px) 45vw, (max-width: 1100px) 25vw, 18vw" loading={priority ? 'eager' : 'lazy'} onError={() => setFailed(source)} referrerPolicy="no-referrer"/> :
      <div className="jacket"><span>{KINDS[kind]}</span><strong>{title}</strong><span className="jacket-rule"/><small>나의 컬렉션</small></div>}
  </div>;
}
export function WorkCard({ work }: { work: Work }) {
  return <Link href={'/library/' + work.id} className={'work-card kind-' + work.kind}>
    <div className="work-art"><Cover url={work.cover_url} title={work.title} kind={work.kind}/><span className={'badge status-' + work.status}>{STATUSES[work.status]}</span><span className="work-open"><ArrowUpRight size={19}/></span></div>
    <div className="work-copy"><p className="work-category">{KINDS[work.kind]}{work.year ? ' · ' + work.year : ''}{work.source==='yes24'?' · 예스24':''}</p><h3>{work.title}</h3><p className="work-creator">{work.creator || (work.progress != null ? work.progress + (work.kind === 'book' ? ' 페이지' : ' 회') : '나의 기록')}</p>
      {work.rating && <p className="rating" aria-label={'만족도 ' + work.rating + '점'}>{'★'.repeat(work.rating)}<span className="unrated">{'★'.repeat(5-work.rating)}</span></p>}
      {work.status==='completed'&&Boolean(work.summary.trim())&&<p className="work-verdict">{work.summary}</p>}
    </div>
  </Link>;
}
export function ConfirmDialog({ title, description, busy, error, confirm, cancel, confirmLabel = '삭제하기', busyLabel = '삭제 중' }: { title: string; description: string; busy: boolean; error: string; confirm: () => void; cancel: () => void; confirmLabel?: string; busyLabel?: string }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useModal(ref);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={id} aria-describedby={id + '-description'} onCancel={event => { event.preventDefault(); if (!busy) cancel(); }} onClick={event => closeOnBackdrop(event, cancel, busy)}>
    <button className="dialog-close" aria-label="닫기" disabled={busy} onClick={cancel}><X size={20}/></button>
    <h2 id={id}>{title}</h2><p id={id + '-description'} className="muted">{description}</p><ErrorMessage error={error}/>
    <div className="actions"><button className="button secondary" autoFocus disabled={busy} onClick={cancel}>돌아가기</button><button className="button danger" disabled={busy} onClick={confirm}>{busy ? busyLabel : confirmLabel}</button></div>
  </dialog>;
}
