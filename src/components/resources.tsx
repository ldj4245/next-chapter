'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, FileText, Link2, Play, Search } from 'lucide-react';
import { RESOURCE_KINDS, RESOURCE_STATES, bookmarkURL, canonicalResourceURL, formatTimestamp, guessResourceKind, mergeResourceDraft, parseResource, parseTimestamp, resourceHost, timestampFromURL, videoSource, type LearningResource, type ResourceBookmark, type ResourceDetail as Detail, type ResourceInput, type ResourceKind, type ResourceStatus } from '@/lib/resources';
import { request, RequestError } from './api-client';
import { DocumentTextarea, prepareDocumentNavigation, SaveStatus, useDocumentSave, useUnsavedGuard } from './editor';
import { usePartnerResource } from './partner-resource';
import { ErrorMessage } from './ui';

const tagsOf = (text:string) => text.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean);
const errorMessage = (error:unknown) => error instanceof Error ? error.message : '저장하지 못했어요. 작성한 내용은 유지돼요.';
type ResourceDraft = Omit<ResourceInput,'tags'> & {tagsText:string};
const draftOf = (resource:ResourceInput):ResourceDraft => ({url:resource.url,title:resource.title,kind:resource.kind,status:resource.status,memo:resource.memo,tagsText:resource.tags.join(', ')});
const inputOf = (draft:ResourceDraft) => parseResource({...draft,tags:tagsOf(draft.tagsText)});
const dayLabel = (value:string) => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(new Date(value));

export function LearningResources() {
  const resource=usePartnerResource<{resources:LearningResource[]}>('/api/resources',false,false);
  const [added,setAdded]=useState<LearningResource[]>([]),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[kind,setKind]=useState('all'),[tag,setTag]=useState('');
  const all=new Map((resource.data?.resources??[]).map(item=>[item.id,item]));for(const item of added)all.set(item.id,item);
  const items=[...all.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
  const tags=[...new Set(items.flatMap(item=>item.tags))].sort((a,b)=>a.localeCompare(b,'ko'));
  const q=query.trim().toLocaleLowerCase('ko');
  const visible=items.filter(item=>(status==='all'||item.status===status)&&(kind==='all'||item.kind===kind)&&(!tag||item.tags.includes(tag))&&(!q||[item.title,item.url,item.memo,...item.tags].join('\n').toLocaleLowerCase('ko').includes(q)));
  return <div className="document-page learning-page">
    <header className="document-header learning-header"><h1 className="document-title">학습 자료함</h1><span className="learning-total">{resource.data||added.length?items.length+'개':''}</span></header>
    <ResourceComposer saved={item=>setAdded(previous=>[item,...previous.filter(old=>old.id!==item.id)])}/>
    <div className="learning-status-tabs" role="group" aria-label="자료 열람 상태">{[['all','전체'],...Object.entries(RESOURCE_STATES)].map(([value,label])=><button type="button" key={value} aria-pressed={status===value} onClick={()=>setStatus(value)}>{label}</button>)}</div>
    <div className="learning-filters"><label className="learning-search"><Search size={17} aria-hidden="true"/><span className="sr-only">자료 검색</span><input type="search" value={query} maxLength={100} onChange={event=>setQuery(event.target.value)} placeholder="제목, 태그, 메모 검색"/></label><label><span className="sr-only">자료 종류</span><select value={kind} onChange={event=>setKind(event.target.value)}><option value="all">모든 종류</option>{Object.entries(RESOURCE_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span className="sr-only">태그로 찾기</span><select value={tag} onChange={event=>setTag(event.target.value)}><option value="">모든 태그</option>{tags.map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
    {resource.error&&<div className="learning-read-error"><ErrorMessage error={resource.error}/><button className="document-button" onClick={resource.refresh}>다시 불러오기</button></div>}
    {resource.loading&&!resource.data&&!added.length?<p className="document-empty" role="status">자료를 불러오는 중…</p>:!resource.data&&!added.length?null:visible.length?<ul className="learning-list">{visible.map(item=><li key={item.id}>
      <span className="learning-kind" aria-label={RESOURCE_KINDS[item.kind]}>{item.kind==='video'?<Play size={18} aria-hidden="true"/>:<FileText size={18} aria-hidden="true"/>}</span>
      <Link className="learning-item-link" href={'/resources/'+item.id}><span className="learning-item-title">{item.title}</span><span className="learning-item-meta"><span>{resourceHost(item.url)}</span><span>{dayLabel(item.created_at)}</span><span>{RESOURCE_STATES[item.status]}</span></span>{item.tags.length>0&&<span className="learning-item-tags">{item.tags.map(value=>'#'+value).join(' ')}</span>}</Link>
      <a className="learning-original-icon" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={item.title+' 원문 열기'}><ArrowUpRight size={19} aria-hidden="true"/></a>
    </li>)}</ul>:<p className="document-empty">{items.length?'조건에 맞는 자료가 없어요.':'읽을 글이나 강의 링크를 위에 붙여 넣어보세요.'}</p>}
  </div>;
}

function ResourceComposer({saved}:{saved:(resource:LearningResource)=>void}) {
  const fieldId=useId(),field=useRef<HTMLInputElement>(null),lock=useRef(false);
  const [url,setURL]=useState(''),[title,setTitle]=useState(''),[tags,setTags]=useState(''),[memo,setMemo]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState<{text:string;id:string}|null>(null);
  const pending=useRef<{key:string;id:string;title:string;bookmarkId:string}|null>(null);
  useUnsavedGuard(Boolean(url||title||tags||memo)||busy);
  const at=videoSource(url)?timestampFromURL(url):null;
  async function submit(event:FormEvent) {
    event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice(null);
    try {
      const canonical=canonicalResourceURL(url),key=JSON.stringify({canonical,title,tags,memo,at});
      if(!pending.current||pending.current.key!==key) {
        let resolved=title.trim();
        if(!resolved){const preview=await request<{title:string}>('/api/resources/preview','POST',{url:canonical});resolved=preview.title;}
        pending.current={key,id:crypto.randomUUID(),title:resolved,bookmarkId:crypto.randomUUID()};
      }
      const input=parseResource({url:canonical,title:pending.current.title,kind:guessResourceKind(canonical),status:'saved',tags:tagsOf(tags),memo});
      const result=await request<{resource:LearningResource;duplicate:boolean}>('/api/resources','POST',{id:pending.current.id,...input});
      if(at!==null&&result.resource.kind==='video')await request('/api/resources/'+result.resource.id+'/bookmarks','POST',{id:pending.current.bookmarkId,seconds:at,label:'저장한 위치'});
      saved(result.resource);
      if(result.duplicate){setNotice({text:at!==null?'이미 담은 자료예요. 시작 구간을 저장했어요.':'이미 담아둔 자료예요. 기존 기록을 확인할 수 있어요.',id:result.resource.id});}
      else {setURL('');setTitle('');setTags('');setMemo('');pending.current=null;setNotice({text:'자료를 담았어요.',id:result.resource.id});requestAnimationFrame(()=>field.current?.focus());}
    }catch(cause){setError(errorMessage(cause));}
    finally{lock.current=false;setBusy(false);}
  }
  return <form className="learning-composer" onSubmit={event=>void submit(event)}><fieldset disabled={busy}>
    <div className="learning-url-line"><Link2 size={19} aria-hidden="true"/><label className="sr-only" htmlFor={fieldId}>새 자료 링크</label><input ref={field} id={fieldId} type="url" required maxLength={2048} value={url} onChange={event=>{setURL(event.target.value);setNotice(null);}} placeholder="읽을 글이나 강의 링크 붙여 넣기" onKeyDown={event=>{if(event.key==='Enter'&&event.nativeEvent.isComposing)event.preventDefault();}}/><button className="document-button primary" disabled={busy||!url.trim()}>{busy?'담는 중…':'링크 저장'}</button></div>
    <details className="learning-composer-options"><summary>제목 · 태그 · 메모</summary><div className="learning-composer-fields"><label htmlFor={fieldId+'-title'}>제목<span>비워두면 링크에서 가져와요.</span></label><input id={fieldId+'-title'} value={title} maxLength={200} onChange={event=>setTitle(event.target.value)} placeholder="제목 직접 입력"/><label htmlFor={fieldId+'-tags'}>태그</label><input id={fieldId+'-tags'} value={tags} maxLength={400} onChange={event=>setTags(event.target.value)} placeholder="쉼표로 구분 · 개발, 글쓰기"/><label htmlFor={fieldId+'-memo'}>메모</label><DocumentTextarea id={fieldId+'-memo'} value={memo} maxLength={10000} onChange={event=>setMemo(event.target.value)} placeholder="이 자료를 담아둔 이유"/></div></details>
    {at!==null&&<p className="learning-hint">링크의 시작 시간 {formatTimestamp(at)}도 영상 구간으로 저장해요.</p>}
  </fieldset><ErrorMessage error={error}/>{notice&&<p className="learning-notice" role="status">{notice.text} <Link href={'/resources/'+notice.id}>자료 열기</Link>{url&&<button className="document-button" type="button" onClick={()=>{setURL('');setTitle('');setTags('');setMemo('');pending.current=null;setNotice(null);}}>입력 비우기</button>}</p>}</form>;
}

export function LearningResourceDetail({id}:{id:string}) {
  const data=usePartnerResource<Detail>('/api/resources/'+id,false,false);
  return <div className="document-page learning-page learning-detail"><Link className="learning-back" href="/resources"><ArrowLeft size={16} aria-hidden="true"/>학습 자료함</Link>{data.data?<ResourceDocument key={id} initial={data.data}/>:data.error?<><ErrorMessage error={data.error}/><button className="document-button" onClick={data.refresh}>다시 불러오기</button></>:<p className="document-empty" role="status">자료를 불러오는 중…</p>}</div>;
}

function ResourceDocument({initial}:{initial:Detail}) {
  const router=useRouter(),fieldId=useId(),revision=useRef(initial.resource.revision),baseline=useRef<ResourceInput>(parseResource(initial.resource)),deleteLock=useRef(false);
  const [resource,setResource]=useState(initial.resource),[draft,setDraft]=useState<ResourceDraft>(()=>draftOf(initial.resource)),[bookmarks,setBookmarks]=useState(initial.bookmarks),[conflict,setConflict]=useState(false),[latest,setLatest]=useState<LearningResource|null>(null),[checking,setChecking]=useState(false),[deleting,setDeleting]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),[error,setError]=useState('');
  const saving=useDocumentSave({value:draft,enabled:!conflict&&!deleting,persist:async snapshot=>{
    try {const input=inputOf(snapshot),response=await request<{resource:LearningResource}>('/api/resources/'+resource.id,'PATCH',{...input,revision:revision.current});revision.current=response.resource.revision;baseline.current=input;setResource(response.resource);}
    catch(cause){if(cause instanceof RequestError&&cause.status===409)setConflict(true);throw cause;}
  }});
  useUnsavedGuard(saving.dirty||deleting,saving.saveNow);
  function update<K extends keyof ResourceDraft>(key:K,value:ResourceDraft[K]){setDraft(previous=>({...previous,[key]:value}));}
  async function checkLatest(){if(checking)return;setChecking(true);setError('');try{const result=await request<Detail>('/api/resources/'+resource.id);setLatest(result.resource);setBookmarks(result.bookmarks);}catch(cause){setError(errorMessage(cause));}finally{setChecking(false);}}
  function merge(){if(!latest)return;try{const remote=parseResource(latest),merged=mergeResourceDraft(baseline.current,inputOf(draft),remote);revision.current=latest.revision;baseline.current=remote;saving.acknowledge(draftOf(remote));setResource(latest);setDraft(draftOf(merged));setConflict(false);setLatest(null);setError('');}catch(cause){setError(errorMessage(cause));}}
  async function remove(){if(deleteLock.current)return;deleteLock.current=true;setError('');try{if(!await prepareDocumentNavigation({preserveDrafts:true}))return;setDeleting(true);try{await request('/api/resources/'+resource.id,'DELETE',{revision:revision.current});}catch(cause){if(!(cause instanceof RequestError&&cause.status===404))throw cause;}saving.acknowledge(draft);router.replace('/resources');}catch(cause){if(cause instanceof RequestError&&cause.status===409)setConflict(true);setError(errorMessage(cause));setDeleting(false);}finally{deleteLock.current=false;}}
  const supportsBookmarks=resource.kind==='video'&&Boolean(videoSource(resource.url));
  return <article id={'resource-'+resource.id} className="learning-document">
    <h1 className="sr-only">{resource.title}</h1>
    <div className="learning-document-meta"><span>{RESOURCE_KINDS[resource.kind]} · {resourceHost(resource.url)}</span><a href={resource.url} target="_blank" rel="noopener noreferrer">원문 열기 <ArrowUpRight size={15} aria-hidden="true"/></a></div>
    <fieldset disabled={deleting||confirmDelete} className="learning-editor"><label className="sr-only" htmlFor={fieldId+'-title'}>자료 제목</label><DocumentTextarea id={fieldId+'-title'} className="learning-title-input" value={draft.title} maxLength={200} onChange={event=>update('title',event.target.value)} onBlur={saving.flush}/>
      <div className="learning-properties"><label htmlFor={fieldId+'-status'}>상태<select id={fieldId+'-status'} value={draft.status} onChange={event=>update('status',event.target.value as ResourceStatus)}>{Object.entries(RESOURCE_STATES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label htmlFor={fieldId+'-kind'}>종류<select id={fieldId+'-kind'} value={draft.kind} onChange={event=>update('kind',event.target.value as ResourceKind)}>{Object.entries(RESOURCE_KINDS).map(([value,label])=><option key={value} value={value} disabled={bookmarks.length>0&&value!=='video'}>{label}</option>)}</select></label></div>
      <label className="learning-field-label" htmlFor={fieldId+'-tags'}>태그</label><input className="learning-tags-input" id={fieldId+'-tags'} value={draft.tagsText} maxLength={400} onChange={event=>update('tagsText',event.target.value)} onBlur={saving.flush} placeholder="쉼표로 구분해서 적기"/>
      <details className="learning-address"><summary>원문 주소</summary><label className="sr-only" htmlFor={fieldId+'-url'}>자료 원문 주소</label><input id={fieldId+'-url'} type="url" value={draft.url} maxLength={2048} disabled={bookmarks.length>0} onChange={event=>update('url',event.target.value)} onBlur={saving.flush}/>{bookmarks.length>0&&<p className="learning-hint">저장한 영상 구간이 있어 주소는 유지돼요.</p>}</details>
      <div className="learning-memo"><label htmlFor={fieldId+'-memo'}>메모</label><DocumentTextarea id={fieldId+'-memo'} value={draft.memo} maxLength={10000} rows={4} onChange={event=>update('memo',event.target.value)} onBlur={saving.flush} placeholder="기억할 내용이나 내 생각을 적어두세요."/></div>
    </fieldset>
    {conflict&&<div className="learning-conflict" role="alert"><p>다른 곳에서 자료가 바뀌었어요. 이 화면의 초안은 그대로 남아 있어요.</p><button type="button" className="document-button" disabled={checking} onClick={()=>void checkLatest()}>{checking?'확인 중…':'최신 내용 확인'}</button>{latest&&<><details><summary>저장된 내용 보기</summary><p>{latest.title}</p><p>{latest.url}</p><p>{RESOURCE_STATES[latest.status]} · {latest.tags.join(', ')}</p><p className="preserve-text">{latest.memo||'메모 없음'}</p></details><p className="learning-hint">서로 수정한 메모는 둘 다 남겨요. 제목·주소·상태가 겹치면 이 화면의 선택을 유지해요.</p><button type="button" className="document-button secondary" onClick={merge}>초안과 합쳐서 저장</button></>}</div>}
    <div className="learning-save-status"><SaveStatus status={saving.status} error={saving.error} retry={saving.retry}/></div><ErrorMessage error={error}/>
    {supportsBookmarks?<BookmarkSection resource={resource} bookmarks={bookmarks} setBookmarks={setBookmarks} enabled={!deleting&&!confirmDelete&&!conflict} beforeSave={saving.saveNow}/>:resource.kind==='video'&&<p className="learning-hint">영상 구간 저장은 YouTube·Vimeo 링크를 지원해요.</p>}
    <div className="learning-delete">{confirmDelete?<><p>자료와 메모, 저장한 영상 구간을 삭제할까요?</p><button className="document-button" disabled={deleting} onClick={()=>setConfirmDelete(false)}>취소</button><button className="document-button secondary" disabled={deleting} onClick={()=>void remove()}>{deleting?'삭제 중…':'자료 삭제'}</button></>:<button className="document-button" type="button" onClick={()=>setConfirmDelete(true)}>자료 삭제</button>}</div>
  </article>;
}

function BookmarkSection({resource,bookmarks,setBookmarks,enabled,beforeSave}:{resource:LearningResource;bookmarks:ResourceBookmark[];setBookmarks:React.Dispatch<React.SetStateAction<ResourceBookmark[]>>;enabled:boolean;beforeSave:()=>Promise<boolean>}) {
  const fieldId=useId(),timeField=useRef<HTMLInputElement>(null),pending=useRef<{key:string;id:string}|null>(null),lock=useRef(false);
  const [time,setTime]=useState(''),[label,setLabel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<string|null>(null),[notice,setNotice]=useState('');
  useUnsavedGuard(Boolean(time||label)||busy);
  async function add(event:FormEvent){event.preventDefault();if(lock.current||!enabled)return;lock.current=true;setBusy(true);setError('');try{
    const seconds=parseTimestamp(time),key=JSON.stringify({seconds,label:label.trim()});if(!label.trim())throw new Error('다시 볼 구간의 내용을 적어주세요.');
    if(!await beforeSave())return;if(!pending.current||pending.current.key!==key)pending.current={key,id:crypto.randomUUID()};
    const result=await request<{bookmark:ResourceBookmark}>('/api/resources/'+resource.id+'/bookmarks','POST',{id:pending.current.id,seconds,label});
    setBookmarks(previous=>[...previous.filter(item=>item.id!==result.bookmark.id),result.bookmark].sort((a,b)=>a.seconds-b.seconds||a.id.localeCompare(b.id)));setTime('');setLabel('');pending.current=null;setNotice('구간을 저장했어요.');requestAnimationFrame(()=>timeField.current?.focus());
  }catch(cause){setError(errorMessage(cause));}finally{lock.current=false;setBusy(false);}}
  async function remove(id:string){if(lock.current||!enabled)return;lock.current=true;setBusy(true);setError('');try{try{await request('/api/resources/'+resource.id+'/bookmarks/'+id,'DELETE');}catch(cause){if(!(cause instanceof RequestError&&cause.status===404))throw cause;}setBookmarks(previous=>previous.filter(item=>item.id!==id));setConfirm(null);}catch(cause){setError(errorMessage(cause));}finally{lock.current=false;setBusy(false);}}
  return <section className="learning-bookmarks" aria-labelledby={fieldId+'-heading'}><h2 id={fieldId+'-heading'}>영상 구간</h2>{bookmarks.length>0&&<ul>{bookmarks.map(mark=><li id={'bookmark-'+mark.id} key={mark.id}><a href={bookmarkURL(resource.url,mark.seconds)??resource.url} target="_blank" rel="noopener noreferrer"><span className="learning-timestamp">{formatTimestamp(mark.seconds)}</span><span>{mark.label}</span><ArrowUpRight size={15} aria-hidden="true"/></a>{confirm===mark.id?<div className="bookmark-delete-confirm"><span>이 구간을 삭제할까요?</span><button type="button" className="document-button" disabled={busy||!enabled} onClick={()=>setConfirm(null)}>취소</button><button type="button" className="document-button" disabled={busy||!enabled} onClick={()=>void remove(mark.id)}>삭제</button></div>:<button type="button" className="document-button bookmark-remove" disabled={busy||!enabled} aria-label={mark.label+' 구간 삭제'} onClick={()=>setConfirm(mark.id)}>삭제</button>}</li>)}</ul>}
    <form onSubmit={event=>void add(event)}><fieldset disabled={busy||!enabled}><div className="learning-bookmark-composer"><label htmlFor={fieldId+'-time'}>시간<input ref={timeField} id={fieldId+'-time'} value={time} maxLength={8} inputMode="text" onChange={event=>setTime(event.target.value)} placeholder="12:35" aria-describedby={fieldId+'-hint'}/></label><label htmlFor={fieldId+'-label'}>다시 볼 내용<input id={fieldId+'-label'} value={label} maxLength={160} onChange={event=>setLabel(event.target.value)} placeholder="이 구간을 기억할 이유"/></label><button className="document-button secondary" disabled={busy||!enabled||!time.trim()||!label.trim()}>{busy?'저장 중…':'구간 저장'}</button></div></fieldset><p id={fieldId+'-hint'} className="learning-hint">시간은 12:35 또는 1:02:35로 적어요. 저장한 구간을 누르면 원래 영상이 열려요.</p><ErrorMessage error={error}/><p className="learning-hint" role="status">{notice}</p></form>
  </section>;
}
