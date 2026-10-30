'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, X } from 'lucide-react';
import { RECORD_TYPES, SEARCH_KINDS, type SearchKind, type SearchResponse, type SearchResult } from '@/lib/record-search';
import { request } from './api-client';

export function RecordSearch({ initialQuery = '', initialKind = 'all', initialError = '' }: { initialQuery?: string; initialKind?: SearchKind; initialError?: string }) {
  const [query, setQuery] = useState(initialQuery), [kind, setKind] = useState<SearchKind>(initialKind);
  const [submitted, setSubmitted] = useState<{ q: string; kind: SearchKind; revision: number } | null>(initialQuery && !initialError ? { q: initialQuery, kind: initialKind, revision: 0 } : null);
  const [error, setError] = useState(initialError);
  const field = useRef<HTMLInputElement>(null), revision = useRef(0);
  function submit(nextKind = kind) {
    const q = query.trim();
    setError('');
    setSubmitted(q ? { q, kind: nextKind, revision: ++revision.current } : null);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (nextKind !== 'all') params.set('kind', nextKind);
    window.history.replaceState(window.history.state, '', '/search' + (params.size ? '?' + params.toString() : ''));
  }
  return <div className="document-page record-search-page">
    <header className="document-header">
      <h1 className="document-title">기록 검색</h1>
      <p className="record-search-intro">남겨둔 문장과 생각을 찾아보세요.</p>
    </header>
    <form className="record-search-form" role="search" onSubmit={event => { event.preventDefault(); submit(); }}>
      <label className="sr-only" htmlFor="record-search-query">내 기록에서 검색</label>
      <div className="record-search-field">
        <Search size={21} aria-hidden="true" />
        <input ref={field} id="record-search-query" type="search" name="q" autoFocus autoComplete="off" enterKeyHint="search" maxLength={80} value={query} onChange={event => { setQuery(event.target.value); setSubmitted(null); setError(''); }} placeholder="기억나는 단어나 문장" />
        {query && <button type="button" className="record-search-clear" aria-label="검색어 지우기" onClick={() => { setQuery(''); setSubmitted(null); setError(''); field.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}
      </div>
      <button type="submit" className="button primary">검색</button>
    </form>
    <div className="record-search-filters" role="group" aria-label="검색 범위">
      {Object.entries(SEARCH_KINDS).map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { const next = value as SearchKind; setKind(next); submit(next); }}>{label}</button>)}
    </div>
    {error && <p className="record-search-error" role="alert">{error}</p>}
    {submitted ? <SearchResults key={submitted.revision + ':' + submitted.q + ':' + submitted.kind} query={submitted.q} kind={submitted.kind} /> : !error && <p className="record-search-hint">{query.trim() ? '검색을 누르면 내 기록에서 찾아요.' : '할 일, 메모, 회고, 서재, 목표에서 검색해요.'}</p>}
  </div>;
}

function SearchResults({ query, kind }: { query: string; kind: SearchKind }) {
  const [data, setData] = useState<SearchResponse | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null), busy = useRef(false);
  const load = useCallback(async (offset: number) => {
    if (busy.current) return;
    busy.current = true;
    const active = new AbortController();
    controller.current?.abort(); controller.current = active;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ q: query, kind, offset: String(offset) });
      const response = await request<SearchResponse>('/api/search?' + params.toString(), 'GET', undefined, active.signal);
      if (!active.signal.aborted) setData(previous => ({ ...response, results: offset && previous ? [...previous.results, ...response.results] : response.results }));
    } catch (cause) {
      if (!active.signal.aborted) { setData(null); setError(cause instanceof Error ? cause.message : '검색하지 못했어요. 다시 시도해주세요.'); }
    } finally {
      if (!active.signal.aborted) { busy.current = false; setLoading(false); }
    }
  }, [query, kind]);
  useEffect(() => {
    const start = setTimeout(() => void load(0), 0);
    return () => { clearTimeout(start); controller.current?.abort(); busy.current = false; };
  }, [load]);
  const grouped = data ? Object.entries(SEARCH_KINDS).filter(([value]) => value !== 'all').map(([value, label]) => ({ value, label, results: data.results.filter(result => result.group === value) })).filter(group => group.results.length) : [];
  return <section className="record-search-results" aria-label="검색 결과" aria-busy={loading}>
    <p className="record-search-status" role="status" aria-live="polite">{loading ? '기록을 찾고 있어요…' : error ? '' : data?.results.length ? '“' + query + '” 검색 결과' : '“' + query + '”이 들어간 기록이 없어요.'}</p>
    {error && <div className="record-search-error" role="alert"><p>{error}</p><button className="text-button" type="button" onClick={() => void load(0)}>다시 검색</button></div>}
    {grouped.map(group => <section key={group.value} className="record-search-group" aria-labelledby={'search-group-' + group.value}>
      <h2 id={'search-group-' + group.value}>{group.label}</h2>
      <ul>{group.results.map(result => <ResultLine key={result.recordType + ':' + result.id} result={result} />)}</ul>
    </section>)}
    {data?.hasMore && <button className="text-button record-search-more" type="button" disabled={loading} onClick={() => void load(data.nextOffset!)}>{loading ? '불러오는 중…' : '기록 더 보기'}</button>}
  </section>;
}

function ResultLine({ result }: { result: SearchResult }) {
  return <li><Link className="record-search-line" href={result.href}>
    <span className="record-search-meta"><span>{RECORD_TYPES[result.recordType]}</span><time dateTime={result.date}>{result.date.replaceAll('-', '.')}</time></span>
    <span className="record-search-title">{result.title}<ArrowRight size={15} aria-hidden="true" /></span>
    <span className="record-search-excerpt">{result.excerpt}</span>
  </Link></li>;
}
