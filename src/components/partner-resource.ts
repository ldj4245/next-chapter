'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PartnerState } from '@/lib/partner';
import { request, RequestError } from './api-client';

export function usePartnerResource<T>(path: string | null, poll = false, clearOnError = true) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string; loading: boolean }>({ path, data: null, error: '', loading: Boolean(path) });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setRevision(value => value + 1); }, []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    request<T>(path, 'GET', undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ path, data, error: '', loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({ path, data: !clearOnError && previous.path === path && (!(error instanceof RequestError) || error.status === 0 || error.status >= 500) ? previous.data : null, error: error.message, loading: false }));
    });
    return () => controller.abort();
  }, [path, revision, clearOnError]);
  useEffect(() => {
    if (!path || !poll) return;
    const update = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [path, poll, refresh]);
  return { ...(path === null ? { data: null, error: '', loading: false } : state.path === path ? state : { data: null, error: '', loading: true }), refresh };
}

export function usePartner() { return usePartnerResource<PartnerState>('/api/partner', true, false); }
