'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { filterWorks, STATUSES, type Kind, type Work } from '@/lib/domain';
import { useResource } from './api-client';
import { CatalogExplorer, KindTabs } from './catalog';
import { Empty, Loading, PageHeader, ResourceError, WorkCard } from './ui';

export function Library() {
  const resource=useResource<{works:Work[]}>('/api/works');
  const [query,setQuery]=useState(''),[kind,setKind]=useState<Kind|''>(''),[status,setStatus]=useState(''),[tags,setTags]=useState<string[]>([]),[sort,setSort]=useState<'updated'|'title'>('updated'),[showTags,setShowTags]=useState(false);
  const works=resource.data?.works??[],allTags=[...new Set(works.flatMap(work=>work.tags))].sort((a,b)=>a.localeCompare(b,'ko')),visible=filterWorks(works,{query,kind,status,tags,sort});
  function reset(){setQuery('');setKind('');setStatus('');setTags([]);setSort('updated');}
  return <>
    <PageHeader eyebrow="나의 아카이브" title="내 서재" description="읽고, 보고, 다시 꺼내고 싶은 작품들."><div className="library-header-actions"><Link className="button primary" href="/library/new">작품 추가<Plus size={17}/></Link></div></PageHeader>
    <div className="library-controls"><KindTabs kind={kind} setKind={setKind} all/><div className="library-total">{works.length}개의 작품</div></div>
    <section className="library-filterbar" aria-label="검색과 필터">
      <label className="library-search"><span className="sr-only">내 작품 제목과 감상 검색</span><Search size={18}/><input type="search" placeholder="내 서재 검색" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <label><span className="sr-only">상태</span><select value={status} onChange={event=>setStatus(event.target.value)}><option value="">모든 상태</option>{Object.entries(STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label><span className="sr-only">정렬</span><select value={sort} onChange={event=>setSort(event.target.value as 'updated'|'title')}><option value="updated">최근 수정순</option><option value="title">제목순</option></select></label>
      <button className={'filter-toggle '+(showTags?'selected':'')} aria-expanded={showTags} onClick={()=>setShowTags(!showTags)}><SlidersHorizontal size={17}/><span>태그{tags.length?' '+tags.length:''}</span></button>
    </section>
    {showTags&&<fieldset className="library-tags"><legend>선택한 태그를 모두 포함</legend><div className="choice-row">{allTags.length?allTags.map(tag=><label className="choice" key={tag}><input type="checkbox" checked={tags.includes(tag)} onChange={()=>setTags(tags.includes(tag)?tags.filter(x=>x!==tag):[...tags,tag])}/><span>#{tag}</span></label>):<p className="muted">작품에 태그를 입력하면 여기에 표시됩니다.</p>}</div></fieldset>}
    {(query||kind||status||tags.length>0)&&<div className="filter-summary"><p>{visible.length}개 검색됨</p><button className="text-button" onClick={reset}>조건 초기화<XIcon/></button></div>}
    {resource.loading?<Loading/>:resource.error?<ResourceError error={resource.error} retry={resource.refresh}/>:visible.length?<div className="work-grid library-grid">{visible.map(work=><WorkCard key={work.id} work={work}/>)}</div>:works.length?<Empty title="조건에 맞는 작품이 없어요"><p className="muted">검색어나 필터를 바꿔보세요.</p><button className="button secondary" onClick={reset}>조건 해제</button></Empty>:<><div className="library-onboarding"><div><h2>좋아하는 작품부터 담아보세요.</h2><p>표지와 소개는 검색으로 가져오고,<br/>감상과 진행 상황은 내 방식대로 기록하세요.</p><Link className="button primary" href="/discover">작품 찾아보기<ArrowUpRight size={18}/></Link></div><span className="onboarding-symbol" aria-hidden="true">+</span></div><CatalogExplorer compact/></>}
  </>;
}
function XIcon(){return <span aria-hidden="true">×</span>;}
