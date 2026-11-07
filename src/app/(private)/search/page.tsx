import type { Metadata } from 'next';
import { RecordSearch } from '@/components/record-search';
import { parseRecordSearch, type SearchKind } from '@/lib/record-search';

export const metadata: Metadata = { title: '기록 검색' };
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams, params = new URLSearchParams();
  for (const key of ['q', 'kind']) {
    const value = values[key];
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  let initialQuery = '', initialKind: SearchKind = 'all', initialError = '';
  try { const input = parseRecordSearch(params); initialQuery = input.q; initialKind = input.kind; }
  catch (error) { initialError = error instanceof Error ? error.message : '검색 조건을 확인해주세요.'; }
  return <RecordSearch initialQuery={initialQuery} initialKind={initialKind} initialError={initialError} />;
}
