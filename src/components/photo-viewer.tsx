'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import type { TaskPhoto } from '@/lib/photos';
import { closeOnBackdrop, useModal } from './ui';

export function PhotoViewer({ photos, start = 0, label, close }: { photos: TaskPhoto[]; start?: number; label: string; close: () => void }) {
  const [index, setIndex] = useState(Math.min(Math.max(0, start), Math.max(0, photos.length - 1)));
  const [loaded, setLoaded] = useState(''), [failed, setFailed] = useState(''), [retry, setRetry] = useState(0);
  const ref = useRef<HTMLDialogElement>(null), heading = useId();
  useModal(ref);
  const photo = photos[Math.min(index, photos.length - 1)];
  const key = photo ? photo.id + ':' + retry : '';
  const source = photo ? photo.url + (retry ? (photo.url.includes('?') ? '&' : '?') + 'retry=' + retry : '') : '';
  const previous = () => setIndex(value => Math.max(0, value - 1));
  const next = () => setIndex(value => Math.min(photos.length - 1, value + 1));
  return <dialog ref={ref} className="photo-viewer" aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }} onClick={event => closeOnBackdrop(event, close)} onKeyDown={event => {
    if (event.target !== event.currentTarget && event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  }}>
    <div className="photo-viewer-header"><h2 id={heading}>{label}</h2><button type="button" className="photo-viewer-close" autoFocus aria-label="사진 닫기" onClick={close}><X size={22} aria-hidden="true"/></button></div>
    <div className="photo-viewer-stage">
      {photo && <Image key={key} src={source} alt={label + ' 사진 ' + (index + 1)} width={photo.width} height={photo.height} unoptimized priority referrerPolicy="no-referrer" onLoad={() => setLoaded(key)} onError={() => setFailed(key)} className={failed === key ? 'photo-full is-failed' : 'photo-full'}/>}
      {photo && loaded !== key && failed !== key && <p className="photo-viewer-state" role="status">사진을 불러오고 있어요.</p>}
      {photo && failed === key && <div className="photo-viewer-state"><p role="alert">사진을 불러오지 못했어요. 연결이나 공유 상태를 확인해주세요.</p><button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={16} aria-hidden="true"/>다시 불러오기</button></div>}
      {!photo && <p className="photo-viewer-state">사진이 삭제됐거나 공유가 해제됐어요.</p>}
    </div>
    <div className="photo-viewer-navigation"><button type="button" aria-label="이전 사진" disabled={index === 0} onClick={previous}><ChevronLeft size={22} aria-hidden="true"/></button><span role="status" aria-live="polite">{photo ? index + 1 : 0} / {photos.length}</span><button type="button" aria-label="다음 사진" disabled={index >= photos.length - 1} onClick={next}><ChevronRight size={22} aria-hidden="true"/></button></div>
  </dialog>;
}
