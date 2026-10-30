'use client';
import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Plus, Check, ArrowRight, X, ExternalLink, ArrowUpRight } from 'lucide-react';
import { KINDS, type Kind, type Work } from '@/lib/domain';
import { SOURCES, type CatalogItem, type CatalogResponse } from '@/lib/catalog-types';
import { request, useAction, useResource } from './api-client';
import { Cover, ErrorMessage, PageHeader, ResourceError, useModal, closeOnBackdrop } from './ui';
type Saved = Record<string, string>;
function identity(item: CatalogItem) { return item.source + ':' + item.source_id; }

export function KindTabs({ kind, setKind, all }: { kind: string; setKind: (kind: Kind | '') => void; all?: boolean }) {
  return <div className="kind-tabs" role="group" aria-label="작품 종류">
    {all && <button className={!kind ? 'selected' : ''} aria-pressed={!kind} onClick={() => setKind('')}>전체</button>}
    {Object.entries(KINDS).map(([key,label]) => <button key={key} className={kind === key ? 'selected' : ''} aria-pressed={kind === key} onClick={() => setKind(key as Kind)}>{label}</button>)}
  </div>;
}
export function PosterSkeletons() { return <div className="poster-grid skeletons" role="status" aria-label="작품 불러오는 중">{Array.from({length:6},(_,i)=><div key={i}><div className="skeleton-art"/><div className="skeleton-line"/><div className="skeleton-line short"/></div>)}</div>; }

export function CatalogExplorer({ initialQuery = '', initialKind = 'book', embedded = false, compact = false, owned, onImported }: { initialQuery?: string; initialKind?: Kind; embedded?: boolean; compact?: boolean; owned?: Work[]; onImported?: () => void }) {
  const [kind,setKind] = useState<Kind>(initialKind), [query,setQuery] = useState(initialQuery), [submitted,setSubmitted] = useState(initialQuery), [selected,setSelected] = useState<CatalogItem | null>(null), [saved,setSaved] = useState<Saved>({});
  const path = submitted ? '/api/catalog?kind=' + kind + '&q=' + encodeURIComponent(submitted) : '/api/catalog/discover?kind=' + kind;
  const resource = useResource<CatalogResponse>(path), action = useAction();
  const library = useResource<{works:Work[]}>(owned === undefined ? '/api/works' : null);
  const ownedIds: Saved = Object.fromEntries((owned ?? library.data?.works ?? []).filter(work => work.source && work.source_id).map(work => [work.source+':'+work.source_id,work.id]));
  const savedIds = { ...ownedIds,...saved };
  async function importItem(item: CatalogItem) {
    const result = await request<{work:Work;existing:boolean}>('/api/catalog/import','POST',{source:item.source,source_id:item.source_id,kind:item.kind});
    setSaved(previous=>({...previous,[identity(item)]:result.work.id}));
    onImported?.();
  }
  return <section className={'catalog-explorer ' + (compact ? 'catalog-compact' : '')}>
    {!embedded && !compact && <PageHeader eyebrow="작품 찾기" title="발견" description="제목으로 찾고, 표지와 작품 정보를 함께 가져오세요."><Link className="button secondary" href="/library/new?mode=manual"><Plus size={16}/>직접 등록</Link></PageHeader>}
    {compact ? <div className="section-heading"><div><p className="eyebrow">다음에 만나볼 작품</p><h2>{kind==='book'?'예스24 베스트셀러':'취향의 발견'}</h2></div><Link href="/discover">더 찾아보기<ArrowUpRight size={17}/></Link></div> : null}
    <div className="catalog-controls"><KindTabs kind={kind} setKind={value=>{setKind(value as Kind);}}/>
      {!compact && <form className="catalog-search" onSubmit={event=>{event.preventDefault();setSubmitted(query.trim());}}>
        <Search size={19}/><label className="sr-only" htmlFor="catalog-query">작품 제목 또는 작가 검색</label><input id="catalog-query" type="search" value={query} onChange={event=>setQuery(event.target.value)} minLength={2} maxLength={100} placeholder={kind==='book'?'책 제목 또는 작가 이름':kind==='movie'?'영화 제목':'드라마 제목'} required/>
        <button className="button primary">검색<ArrowRight size={16}/></button>
      </form>}
    </div>
    {!compact && <div className="catalog-results-label"><p>{submitted ? '“'+submitted+'” 검색 결과' : kind==='book'?'예스24 종합 베스트셀러':'먼저 둘러보기'}</p>{submitted && <button className="text-button" onClick={()=>{setQuery('');setSubmitted('');}}>검색 초기화</button>}</div>}
    <ErrorMessage error={action.error}/>
    {resource.loading ? <PosterSkeletons/> : resource.error ? <ResourceError error={resource.error} retry={resource.refresh}/> : resource.data && <>
      {resource.data.notice && <p className="catalog-notice" role="status">{resource.data.notice}</p>}
      {resource.data.items.length ? <div className="poster-grid">{resource.data.items.slice(0,compact?6:24).map(item=><article className="catalog-card" key={identity(item)}>
        <button className="poster-open" onClick={()=>setSelected(item)} aria-label={item.title+' 작품 정보 보기'}><Cover url={item.cover_url} title={item.title} kind={item.kind}/><div className="poster-copy"><p className="work-category">{KINDS[item.kind]}{item.year?' · '+item.year:''}{item.source==='yes24'?' · 예스24':''}</p><h3>{item.title}</h3><p>{item.creator || SOURCES[item.source]}</p></div></button>
        {savedIds[identity(item)] ? <Link href={'/library/'+savedIds[identity(item)]} className="save-button saved" aria-label={item.title+' 내 기록 열기'}><Check size={17}/></Link> : <button className="save-button" aria-label={item.title+' 서재에 가져오기'} disabled={action.busy} onClick={()=>action.run(()=>importItem(item))}><Plus size={18}/></button>}
      </article>)}</div> : <div className="search-empty"><Search size={26}/><h3>검색 결과가 없어요</h3><p>제목을 짧게 입력하거나 원제를 사용해보세요.</p><Link className="button secondary" href="/library/new?mode=manual">직접 등록</Link></div>}
      <p className="catalog-attribution">작품 정보: {kind==='book'?<a href="https://www.yes24.com" target="_blank" rel="noreferrer">예스24</a>:<a href="https://ko.wikipedia.org" target="_blank" rel="noreferrer">위키백과</a>}{kind==='drama'&&<> · <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">TVmaze</a></>}<span>작품 카드에서 원문 출처를 확인할 수 있어요.</span></p>
    </>}
    {selected && <CatalogDialog item={selected} savedId={savedIds[identity(selected)]} busy={action.busy} error={action.error} close={()=>setSelected(null)} save={()=>action.run(()=>importItem(selected))}/>}
  </section>;
}
function CatalogDialog({ item,savedId,busy,error,close,save }: {item:CatalogItem;savedId?:string;busy:boolean;error:string;close:()=>void;save:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null),titleId=useId();
  useModal(ref);
  return <dialog ref={ref} className="catalog-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!busy)close();}} onClick={event=>closeOnBackdrop(event,close,busy)}>
    <button className="dialog-close" autoFocus aria-label="작품 정보 닫기" disabled={busy} onClick={close}><X size={21}/></button>
    <div className="catalog-dialog-art"><Cover url={item.cover_url} title={item.title} kind={item.kind}/></div>
    <div className="catalog-dialog-copy"><p className="eyebrow">{KINDS[item.kind]}{item.year?' · '+item.year:''}</p><h2 id={titleId}>{item.title}</h2>{item.creator&&<p className="dialog-creator">{item.creator}</p>}<p className="dialog-synopsis preserve-text">{item.description||'상세 소개가 제공되지 않은 작품입니다. 서재에 가져온 뒤 직접 기록을 남길 수 있어요.'}</p>
      <a className="source-link" href={item.source_url} target="_blank" rel="noreferrer">{SOURCES[item.source]}에서 작품 정보 보기<ExternalLink size={13}/></a>
      <div className="dialog-import"><ErrorMessage error={error}/>{savedId?<><p className="success"><Check size={17}/>내 컬렉션에 담았어요</p><Link className="button primary wide" href={'/library/'+savedId}>내 기록 열기<ArrowRight size={17}/></Link></>:<button className="button primary wide" disabled={busy} onClick={save}>{busy?'가져오는 중':'내 컬렉션에 담기'}<Plus size={18}/></button>}<p className="field-hint">표지·소개·출처를 가져오며, 감상은 직접 작성합니다.</p></div>
    </div>
  </dialog>;
}
