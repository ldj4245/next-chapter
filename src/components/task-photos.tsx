'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, Check, LockKeyhole, Paperclip, RefreshCw, Trash2, X } from 'lucide-react';
import type { PartnerConnection } from '@/lib/partner';
import type { Task } from '@/lib/planner';
import type { TaskPhoto } from '@/lib/photos';
import { compressPhoto, photoRequest, uploadPhoto, validatePhotoFile } from '@/lib/photo-client';
import { RequestError, request, useAction } from './api-client';
import { useUnsavedGuard } from './editor';
import { PhotoViewer } from './photo-viewer';
import { ErrorMessage } from './ui';

type PendingPhoto = { id: string; original: File; file: File | null; preview: string; stage: 'preparing' | 'uploading' | 'error'; error: string };

function PhotoThumbnail({ photo, label, index, open }: { photo: TaskPhoto; label: string; index: number; open: () => void }) {
  const [failed, setFailed] = useState('');
  return <button className="task-photo-open" type="button" aria-label={label + ' 사진 ' + (index + 1) + ' 크게 보기'} onClick={open}>
    <Image src={photo.thumbnail_url} alt={label + ' 사진 ' + (index + 1)} width={photo.width} height={photo.height} loading="lazy" unoptimized referrerPolicy="no-referrer" className={failed === photo.thumbnail_url ? 'is-failed' : ''} onError={() => setFailed(photo.thumbnail_url)}/>
    {failed === photo.thumbnail_url && <span className="photo-thumb-error">사진 보기</span>}
  </button>;
}

export function PhotoStrip({ photos, label, remove, disabled = false }: { photos: TaskPhoto[]; label: string; remove?: (photo: TaskPhoto) => void; disabled?: boolean }) {
  const [viewer, setViewer] = useState<number | null>(null);
  if (!photos.length) return null;
  return <>
    <ul className="task-photo-strip" aria-label={label + ' 첨부 사진'}>{photos.map((photo, index) => <li className="task-photo-tile" key={photo.id}>
      <PhotoThumbnail photo={photo} label={label} index={index} open={() => setViewer(index)}/>
      {remove && <button className="task-photo-remove" type="button" disabled={disabled} aria-label={label + ' 사진 ' + (index + 1) + ' 삭제'} onClick={() => remove(photo)}><X size={15} aria-hidden="true"/></button>}
    </li>)}</ul>
    {viewer !== null && <PhotoViewer photos={photos} start={viewer} label={label} close={() => setViewer(null)}/>}
  </>;
}

export function TaskPhotos({ task, connection, known, ready, save, onBusyChange, initialPhotos }: { task: Task; connection: PartnerConnection | null; known: boolean; ready: () => Promise<boolean>; save: (task: Task) => void; onBusyChange?: (busy: boolean) => void; initialPhotos?: TaskPhoto[] }) {
  const hasInitialPhotos = initialPhotos !== undefined;
  const [photos, setPhotos] = useState<TaskPhoto[]>(initialPhotos ?? []), [pending, setPending] = useState<PendingPhoto[]>([]);
  const [loading, setLoading] = useState(!hasInitialPhotos), [loadError, setLoadError] = useState(''), [selectionError, setSelectionError] = useState('');
  const [revision, setRevision] = useState(0), [removing, setRemoving] = useState<TaskPhoto | null>(null);
  const album = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null), action = useAction();
  const attach = useRef<HTMLButtonElement>(null), removeCancel = useRef<HTMLButtonElement>(null), removeOrigin = useRef<HTMLElement | null>(null);
  const generation = useRef(0), previewURLs = useRef(new Set<string>()), alive = useRef(false), writes = useRef(new Set<AbortController>());
  useUnsavedGuard(pending.length > 0);
  const busy = action.busy || pending.some(item => item.stage !== 'error');
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const clearPreview = useCallback((url: string) => { URL.revokeObjectURL(url); previewURLs.current.delete(url); }, []);
  useEffect(() => {
    alive.current = true;
    const urls = previewURLs.current, controllers = writes.current;
    return () => { alive.current = false; urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); controllers.forEach(controller => controller.abort()); controllers.clear(); };
  }, []);
  useEffect(() => {
    if (!revision && hasInitialPhotos) return;
    const controller = new AbortController(), version = ++generation.current;
    photoRequest<{ photos: TaskPhoto[] }>('/api/planner/tasks/' + task.id + '/photos', 'GET', undefined, controller.signal).then(result => {
      if (!controller.signal.aborted && version === generation.current) { setPhotos(result.photos); setLoading(false); setLoadError(''); }
    }).catch(cause => {
      if (!controller.signal.aborted && version === generation.current) { setLoading(false); setLoadError(cause instanceof Error ? cause.message : '사진을 불러오지 못했어요.'); }
    });
    return () => controller.abort();
  }, [task.id, revision, hasInitialPhotos]);
  function reload() { setLoading(true); setLoadError(''); setRevision(value => value + 1); }
  function updatePending(id: string, update: Partial<PendingPhoto>) { if (alive.current) setPending(items => items.map(item => item.id === id ? { ...item, ...update } : item)); }
  async function persistPhoto(item: PendingPhoto) {
    const controller = new AbortController(); writes.current.add(controller);
    let preview = item.preview;
    try {
      updatePending(item.id, { stage: item.file ? 'uploading' : 'preparing', error: '' });
      const file = item.file ?? await compressPhoto(item.original);
      if (!alive.current || controller.signal.aborted) return;
      if (!preview) { preview = URL.createObjectURL(file); previewURLs.current.add(preview); }
      updatePending(item.id, { file, preview, stage: 'uploading' });
      if (!await ready()) { updatePending(item.id, { stage: 'error', error: '할 일 저장을 먼저 마쳐주세요. 사진은 그대로 두었어요.' }); return; }
      const result = await uploadPhoto(task.id, item.id, file, controller.signal), photo = result.photo;
      if (!alive.current || controller.signal.aborted) return;
      ++generation.current;
      setPhotos(current => current.some(existing => existing.id === photo.id) ? current.map(existing => existing.id === photo.id ? photo : existing) : [...current, photo]);
      save(result.task); setPending(items => items.filter(existing => existing.id !== item.id)); clearPreview(preview);
    } catch (cause) {
      if (!controller.signal.aborted) updatePending(item.id, { stage: 'error', error: cause instanceof Error ? cause.message : '사진을 올리지 못했어요. 다시 시도해주세요.' });
    } finally { writes.current.delete(controller); }
  }
  async function selectFiles(files: File[]) {
    if (!files.length) return;
    setSelectionError('');
    const available = Math.max(0, 3 - photos.length - pending.length);
    if (!available || files.length > available) { setSelectionError('할 일마다 사진은 최대 3장까지 첨부할 수 있어요. ' + (available ? '지금은 ' + available + '장을 더 선택할 수 있어요.' : '사진을 지운 뒤 다시 선택해주세요.')); return; }
    await action.run(async () => {
      const selected: PendingPhoto[] = [];
      for (const original of files) {
        try { validatePhotoFile(original); }
        catch (cause) { setSelectionError(cause instanceof Error ? cause.message : '사진 형식을 확인해주세요.'); continue; }
        selected.push({ id: crypto.randomUUID(), original, file: null, preview: '', stage: 'preparing', error: '' });
      }
      setPending(items => [...items, ...selected]);
      for (const item of selected) await persistPhoto(item);
    });
  }
  async function removePhoto() {
    if (!removing) return;
    await action.run(async () => {
      const result = await photoRequest<{ task?: Task | null }>('/api/photos/' + removing.id, 'DELETE');
      if (result.task) save(result.task);
      ++generation.current; setPhotos(items => items.filter(photo => photo.id !== removing.id)); setRemoving(null);
      requestAnimationFrame(() => attach.current?.focus({ preventScroll: true }));
    });
  }
  function confirmRemoval(photo: TaskPhoto) {
    removeOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRemoving(photo); requestAnimationFrame(() => removeCancel.current?.focus({ preventScroll: true }));
  }
  function cancelRemoval() {
    setRemoving(null);
    requestAnimationFrame(() => { if (removeOrigin.current?.isConnected) removeOrigin.current.focus({ preventScroll: true }); else attach.current?.focus({ preventScroll: true }); });
  }
  async function cancelPending(item: PendingPhoto) {
    await action.run(async () => {
      try {
        const result = await photoRequest<{ task?: Task | null }>('/api/photos/' + item.id, 'DELETE');
        if (result.task) save(result.task);
      } catch (cause) {
        if (!(cause instanceof RequestError && cause.status === 404)) { updatePending(item.id, { stage: 'error', error: cause instanceof Error ? cause.message : '선택 취소를 마치지 못했어요. 다시 시도해주세요.' }); return; }
      }
      ++generation.current; setPhotos(items => items.filter(photo => photo.id !== item.id));
      setPending(items => items.filter(existing => existing.id !== item.id)); if (item.preview) clearPreview(item.preview);
    });
  }
  const taskVisible = Boolean(task.shared && connection && task.shared_connection_id === connection.id);
  const photosVisible = Boolean(taskVisible && task.photos_shared && task.photo_connection_id === connection?.id);
  const canChoose = !loading && !loadError && !action.busy && photos.length + pending.length < 3;
  async function toggleSharing() {
    if (!known || !connection || !taskVisible) return;
    const expectedConnection = connection.id;
    await action.run(async () => {
      if (!await ready()) return;
      const result = await request<{ task: Task }>('/api/planner/tasks/' + task.id, 'PATCH', { action: 'photo-share', photos_shared: !photosVisible, connection_id: expectedConnection });
      save(result.task);
    });
  }
  return <div className="task-photos">
    <div className="task-photo-controls">
      <button ref={attach} type="button" className="task-photo-attach" disabled={!canChoose} onClick={() => album.current?.click()}><Paperclip size={14} aria-hidden="true"/><span>사진 첨부</span>{photos.length + pending.length > 0 && <small>{photos.length + pending.length}/3</small>}</button>
      <button type="button" className="task-photo-camera" aria-label={task.title + ' 사진 촬영'} title="사진 촬영" disabled={!canChoose} onClick={() => camera.current?.click()}><Camera size={16} aria-hidden="true"/></button>
      {loading && <span className="task-photo-load" role="status">사진 확인 중…</span>}
      <input className="photo-file-input" ref={album} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple aria-label={task.title + ' 첨부할 사진 선택'} disabled={!canChoose} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void selectFiles(files); }}/>
      <input className="photo-file-input" ref={camera} type="file" accept="image/jpeg,image/png,image/webp,image/avif" capture="environment" aria-label={task.title + ' 촬영한 사진 첨부'} disabled={!canChoose} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void selectFiles(files); }}/>
    </div>
    {photosVisible && <p className="photo-add-privacy">새 사진을 추가하면 사진 공유가 나만 보기로 바뀌어요.</p>}
    {loadError && <div className="photo-feedback"><ErrorMessage error={loadError}/><button className="text-button" type="button" disabled={action.busy || loading} onClick={reload}><RefreshCw size={13} aria-hidden="true"/>다시 불러오기</button></div>}
    <PhotoStrip photos={photos} label={task.title} remove={confirmRemoval} disabled={action.busy}/>
    {pending.length > 0 && <ul className="photo-pending-list" aria-label="아직 저장하지 못한 사진">{pending.map(item => <li className={'photo-pending-item' + (item.stage === 'error' ? ' has-error' : '')} key={item.id}>
      <div className="photo-pending-preview">{item.preview ? <Image src={item.preview} alt="선택한 사진 미리보기" width={100} height={100} unoptimized/> : <Camera size={20} aria-hidden="true"/>}<span>{item.stage === 'error' ? '저장 안 됨' : item.stage === 'preparing' ? '준비 중' : '올리는 중'}</span></div>
      <div className="photo-pending-copy">{item.stage === 'error' ? <><ErrorMessage error={item.error}/><div className="photo-pending-actions"><button type="button" className="text-button" disabled={action.busy} onClick={() => void action.run(() => persistPhoto(item))}>다시 올리기</button><button type="button" className="text-button" disabled={action.busy} onClick={() => void cancelPending(item)}>선택 취소</button></div></> : <span className="photo-progress" role="status">{item.stage === 'preparing' ? '사진 크기를 줄이고 있어요.' : '사진을 저장하고 있어요.'}</span>}</div>
    </li>)}</ul>}
    {removing && <div className="photo-delete-inline" role="group" aria-label="사진 삭제 확인"><p role="status">이 사진을 삭제할까요?</p><div><button ref={removeCancel} type="button" className="text-button" disabled={action.busy} onClick={cancelRemoval}>취소</button><button type="button" className="text-button photo-delete-confirm" disabled={action.busy} onClick={removePhoto}><Trash2 size={13} aria-hidden="true"/>{action.busy ? '삭제 중…' : '사진 삭제'}</button></div></div>}
    {photos.length > 0 && <div className="task-photo-privacy">{connection ? <><button type="button" className="photo-sharing-toggle" aria-pressed={photosVisible} disabled={!known || !taskVisible || action.busy} onClick={toggleSharing}><span className="photo-sharing-check" aria-hidden="true">{photosVisible && <Check size={11}/>}</span>사진도 함께 공유</button>{!taskVisible && <span className="photo-privacy-hint">할 일을 함께 확인하면 사진 공유도 선택할 수 있어요.</span>}</> : <span className="photo-private-label"><LockKeyhole size={12} aria-hidden="true"/>사진은 나만 보기</span>}</div>}
    <ErrorMessage error={selectionError}/><ErrorMessage error={action.error}/>
  </div>;
}
