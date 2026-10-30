'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Issues } from '@/lib/domain';
export class RequestError extends Error {
  constructor(message: string, public issues: Issues = {}, public status = 0) { super(message); }
}
export async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new RequestError('연결을 확인하고 다시 시도해주세요. 작성한 내용은 유지돼요.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Reads discard expired private UI; failed writes keep the user's form input.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (response.status === 401 && method === 'GET' && !path.startsWith('/api/auth/')) window.location.assign('/login');
    throw new RequestError(data.error ?? '요청을 처리하지 못했어요. 다시 시도해주세요.', data.issues ?? {}, response.status);
  }
  return data as T;
}
export function useResource<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string; loading: boolean }>({ path, data: null, error: '', loading: Boolean(path) });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    request<T>(path, 'GET', undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ path, data, error: '', loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ path, data: null, error: error.message, loading: false });
    });
    return () => controller.abort();
  }, [path, revision]);
  const refresh = useCallback(() => { setState({ path, data: null, error: '', loading: true }); setRevision(x => x + 1); }, [path]);
  return { ...(path === null ? { data: null, error: '', loading: false } : state.path === path ? state : { data: null, error: '', loading: true }), refresh };
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '다시 시도해주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return { busy, error, run };
}
