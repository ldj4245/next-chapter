'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { useRouter } from 'next/navigation';
import { DocumentSaver, type SaveReport, type SaveState } from '@/lib/document-save';
import { ErrorMessage } from './ui';

export function useDocumentSave<T>({ value, enabled = true, persist, delay = 800 }: { value: T; enabled?: boolean; persist: (snapshot: T) => Promise<void>; delay?: number }) {
  const [state, setState] = useState<SaveReport>({ status: 'idle', error: '', dirty: false });
  const persistRef = useRef(persist);
  const saver = useRef<DocumentSaver<T> | null>(null);
  const valueKey = JSON.stringify(value);
  useEffect(() => { persistRef.current = persist; });
  useEffect(() => {
    const instance = new DocumentSaver(value, snapshot => persistRef.current(snapshot), setState, delay);
    saver.current = instance;
    return () => { instance.close(); saver.current = null; };
    // Each editor owns its initial baseline; later values are drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { saver.current?.update(JSON.parse(valueKey) as T, enabled); }, [valueKey, enabled]);
  const saveNow = () => { const instance = saver.current; if (!instance) return Promise.resolve(false); instance.update(value, enabled); return instance.flush(); };
  return { ...state, flush: () => { void saveNow(); }, retry: () => { void saveNow(); }, saveNow, acknowledge: (snapshot: T) => saver.current?.acknowledge(snapshot) };
}

export function SaveStatus({ status, error, retry }: { status: SaveState; error: string; retry: () => void }) {
  if (status === 'error') return <div className="save-error"><ErrorMessage error={error}/><button className="text-button" type="button" onClick={retry}>다시 저장</button></div>;
  return <span className="save-status" role="status">{status === 'saving' ? '저장 중…' : status === 'pending' ? '저장 대기' : status === 'saved' ? '저장됨' : ''}</span>;
}

const unsaved = new Map<string, { save?: () => Promise<boolean> }>();
export async function prepareDocumentNavigation({preserveDrafts=false}:{preserveDrafts?:boolean}={}) {
  const visited = new Set<string>();
  for (;;) {
    const entries = [...unsaved.entries()].filter(([id, entry]) => entry.save && !visited.has(id));
    if (!entries.length) break;
    const results = await Promise.all(entries.map(async ([id, entry]) => { visited.add(id); return entry.save!().catch(() => false); }));
    if (results.some(saved => !saved)) return false;
  }
  return preserveDrafts || ![...unsaved.values()].some(entry => !entry.save) || window.confirm('아직 추가하지 않은 내용이 있어요. 이동할까요?');
}
export function useUnsavedGuard(dirty: boolean, saveNow?: () => Promise<boolean>) {
  const id = useId(), router = useRouter(), saveRef = useRef(saveNow), canSave = Boolean(saveNow);
  useEffect(() => { saveRef.current = saveNow; });
  useEffect(() => {
    if (dirty) unsaved.set(id, { save: canSave ? () => saveRef.current!() : undefined }); else unsaved.delete(id);
    return () => { unsaved.delete(id); };
  }, [dirty, id, canSave]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (unsaved.size) { event.preventDefault(); event.returnValue = ''; } };
    const guard = (event: MouseEvent) => {
      if (!unsaved.size || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(element instanceof HTMLAnchorElement) || element.target === '_blank' || element.hasAttribute('download')) return;
      const url = new URL(element.href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.origin === window.location.origin) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void prepareDocumentNavigation().then(ready => { if (ready) { if (url.origin === window.location.origin) router.push(url.pathname + url.search + url.hash); else window.location.assign(url.href); } });
    };
    if (!guards++) { window.addEventListener('beforeunload', warn); document.addEventListener('click', guard, true); globalWarn = warn; globalGuard = guard; }
    return () => { if (!--guards) { window.removeEventListener('beforeunload', globalWarn!); document.removeEventListener('click', globalGuard!, true); globalWarn = undefined; globalGuard = undefined; } };
  }, [router]);
}
let guards = 0, globalWarn: ((event: BeforeUnloadEvent) => void) | undefined, globalGuard: ((event: MouseEvent) => void) | undefined;

function resizeDocumentTextarea(element: HTMLTextAreaElement | null) {
  if (!element?.offsetWidth) return;
  const border = element.offsetHeight - element.clientHeight;
  const contentHeight = element.scrollHeight;
  if (contentHeight > element.clientHeight) {
    // Grow directly when the text already overflows. Collapsing the box first
    // would move the scroll position of a long draft on every keystroke.
    element.style.height = `${contentHeight + border}px`;
    return;
  }
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight + border}px`;
}

export function DocumentTextarea({ inputRef, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: (element: HTMLTextAreaElement | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => resizeDocumentTextarea(ref.current), [props.value]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let width = element.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth === width) return;
      width = element.offsetWidth;
      resizeDocumentTextarea(element);
    });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  return <textarea {...props} ref={element => { ref.current = element; inputRef?.(element); }} rows={props.rows ?? 1} className={'document-textarea ' + (props.className ?? '')} onInput={event => {
    if (props.value === undefined) resizeDocumentTextarea(event.currentTarget);
    props.onInput?.(event);
  }}/>;
}
