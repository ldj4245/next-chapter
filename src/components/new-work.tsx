'use client';
import { useState } from 'react';
import { Search, PenLine } from 'lucide-react';
import { CatalogExplorer } from './catalog';
import { WorkForm } from './work-form';
import { PageHeader } from './ui';
export function NewWork({manual}:{manual:boolean}){
  const [direct,setDirect]=useState(manual);
  return <><PageHeader eyebrow="컬렉션에 담기" title="작품 추가" description="검색해서 가져오거나 직접 입력하세요."/>
    <div className="entry-tabs"><button className={!direct?'selected':''} aria-pressed={!direct} onClick={()=>setDirect(false)}><Search size={18}/>검색해서 가져오기</button><button className={direct?'selected':''} aria-pressed={direct} onClick={()=>setDirect(true)}><PenLine size={17}/>직접 입력</button></div>
    {direct?<WorkForm/>:<CatalogExplorer embedded/>}
  </>;
}
