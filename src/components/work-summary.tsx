'use client';
import { useId,useRef,useState } from 'react';
import type { Detail,Work } from '@/lib/domain';
import { request,RequestError } from './api-client';
import { DocumentTextarea,SaveStatus,useDocumentSave,useUnsavedGuard } from './editor';
import { ErrorMessage } from './ui';

export function WorkSummary({work,saved}:{work:Work;saved:(work:Work)=>void}){
  const id=useId(),baseline=useRef(work.summary);
  const [summary,setSummary]=useState(work.summary),[conflict,setConflict]=useState(false),[latest,setLatest]=useState<Work|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
  const saving=useDocumentSave({value:summary,enabled:!conflict,persist:async value=>{
    try{const response=await request<{work:Work}>('/api/works/'+work.id+'/summary','PATCH',{summary:value,expected_summary:baseline.current});baseline.current=response.work.summary;saved(response.work);}
    catch(cause){if(cause instanceof RequestError&&cause.status===409){setConflict(true);setLatest(null);}throw cause;}
  }});
  useUnsavedGuard(saving.dirty,saving.saveNow);
  async function check(){if(checking)return;setChecking(true);setError('');try{const result=await request<Detail>('/api/works/'+work.id);setLatest(result.work);}catch(cause){setError(cause instanceof Error?cause.message:'최신 한줄평을 확인하지 못했어요.');}finally{setChecking(false);}}
  const completedBook=work.kind==='book'&&work.status==='completed';
  return <section className="panel summary-panel work-summary-editor" aria-labelledby={id+'-heading'}>
    <h2 id={id+'-heading'}>{completedBook?'완독 한줄평':'한 줄 감상'}</h2>
    <label className="sr-only" htmlFor={id}>작품 전체에 대한 한줄평</label><DocumentTextarea id={id} maxLength={300} rows={2} value={summary} onChange={event=>setSummary(event.target.value)} onBlur={saving.flush} placeholder={completedBook?'다 읽고 난 뒤의 감상을 짧게 남겨보세요.':'이 작품에 대한 짧은 감상을 남겨보세요.'} aria-describedby={id+'-count'}/>
    <div className="work-summary-footer"><span id={id+'-count'}>{summary.length} / 300 · 선택</span><SaveStatus status={saving.status} error={saving.error} retry={saving.retry}/></div>
    {conflict&&<div className="work-summary-conflict" role="alert"><p>다른 곳에서 한줄평이 바뀌었어요. 작성 중인 글은 그대로 남아 있어요.</p><button type="button" className="document-button" disabled={checking} onClick={()=>void check()}>{checking?'확인 중…':'저장된 한줄평 확인'}</button>{latest&&<><p className="work-summary-latest preserve-text">{latest.summary||'저장된 한줄평 없음'}</p><div className="work-summary-choices"><button className="document-button" type="button" onClick={()=>{baseline.current=latest.summary;saving.acknowledge(latest.summary);setSummary(latest.summary);saved(latest);setLatest(null);setConflict(false);}}>저장된 글 사용</button><button className="document-button secondary" type="button" onClick={()=>{baseline.current=latest.summary;setConflict(false);setLatest(null);}}>내 글로 바꾸기</button></div></>}</div>}
    <ErrorMessage error={error}/>
  </section>;
}
