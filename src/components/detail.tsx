'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, Plus, Quote, Check } from 'lucide-react';
import { KINDS, STATUSES, MOODS, parseNote, formattedDate, type Detail, type Work, type Note } from '@/lib/domain';
import { request, useAction, useResource } from './api-client';
import { prepareDocumentNavigation,useUnsavedGuard } from './editor';
import { ConfirmDialog, Cover, ErrorMessage, Loading, ResourceError } from './ui';
import { SOURCES } from '@/lib/catalog-types';
import { WorkForm } from './work-form';
import { WorkSummary } from './work-summary';
export function WorkDetail({ id }: { id: string }) {
  const resource = useResource<Detail>('/api/works/' + id);
  return <><Link href="/library" className="back-link"><ArrowLeft size={16}/>내 서재로</Link>{resource.loading ? <Loading/> : resource.error ? <ResourceError error={resource.error} retry={resource.refresh}/> : resource.data && <DetailContent key={id} detail={resource.data}/>}</>;
}
function DetailContent({ detail }: { detail: Detail }) {
  const [snapshot,setSnapshot]=useState(detail),[summaryVersion,setSummaryVersion]=useState(0);
  const { work, notes } = snapshot, router = useRouter(), action = useAction();
  const [editing, setEditing] = useState(false), [deleting, setDeleting] = useState(false), [notice, setNotice] = useState('');
  function savedWork(next:Work){setSnapshot(previous=>next.updated_at>=previous.work.updated_at?{...previous,work:next}:previous);}
  function savedNote(note:Note){setSnapshot(previous=>({...previous,notes:[note,...previous.notes.filter(item=>item.id!==note.id)].sort((a,b)=>b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id))}));}
  function removedNote(id:string){setSnapshot(previous=>({...previous,notes:previous.notes.filter(note=>note.id!==id)}));}
  return <>{editing&&<WorkForm work={work} cancel={()=>setEditing(false)} onSaved={next=>{savedWork(next);setSummaryVersion(value=>value+1);setEditing(false);}}/>}<div hidden={editing} className="work-detail-content"><header className="detail-header"><div className="detail-kind">{KINDS[work.kind]}{work.year?' · '+work.year:''}<span className={'badge status-' + work.status}>{STATUSES[work.status]}</span></div><h1>{work.title}</h1>{work.creator&&<p className="detail-creator">{work.creator}</p>}<div className="detail-toolbar"><button className="button secondary" onClick={async()=>{if(await prepareDocumentNavigation({preserveDrafts:true}))setEditing(true);}}><Pencil size={16}/>정보 수정</button><button className="button subtle-danger" onClick={() => setDeleting(true)}><Trash2 size={16}/>작품 삭제</button></div></header>
    <div className="detail-columns"><section className="panel info-panel"><div className="info-cover"><Cover url={work.cover_url} title={work.title} kind={work.kind} priority/></div><div className="section-heading"><h2>작품 정보</h2></div>
      <label>{work.kind==='book'?'독서 상태':'감상 상태'}<select value={work.status} disabled={action.busy} onChange={event => { const status = event.target.value; action.run(async () => { const response=await request<{work:Work}>('/api/works/' + work.id, 'PATCH', { status });savedWork(response.work); }); }}>{Object.entries(STATUSES).map(([key,label]) => <option key={key} value={key}>{work.kind==='book'&&key==='completed'?'완독':label}</option>)}</select></label><ErrorMessage error={action.error}/>
      <dl className="metadata"><div><dt>만족도</dt><dd>{work.rating ? <span className="rating" aria-label={work.rating + '점'}>{'★'.repeat(work.rating)}</span> : '미입력'}</dd></div><div><dt>감상 시간</dt><dd>{work.minutes ? work.minutes + '분' : '미입력'}</dd></div>{work.kind !== 'movie' && <div><dt>{work.kind === 'book' ? '현재 페이지' : '현재 회차'}</dt><dd>{work.progress ?? '미입력'}</dd></div>}<div><dt>시작일</dt><dd>{formattedDate(work.started_on)}</dd></div><div><dt>완료일</dt><dd>{formattedDate(work.finished_on)}</dd></div></dl>
      <h3 className="small-heading">분위기</h3><div className="tag-list">{work.moods.length ? work.moods.map(mood => <span className="tag" key={mood}>{MOODS[mood]}</span>) : <span className="muted">미입력</span>}</div>
      <h3 className="small-heading">태그</h3><div className="tag-list">{work.tags.length ? work.tags.map(tag => <span className="tag" key={tag}>#{tag}</span>) : <span className="muted">미입력</span>}</div><p className="record-date">마지막 기록 {formattedDate(work.updated_at, true)}</p></section>
      <div><WorkSummary key={summaryVersion} work={work} saved={savedWork}/>{(work.description||work.source_url)&&<section className="panel synopsis-panel"><p className="eyebrow">작품 소개</p>{work.description&&<p className="preserve-text">{work.description}</p>}{work.source&&work.source_url&&<a className="source-link" href={work.source_url} target="_blank" rel="noreferrer">{SOURCES[work.source]} 원문 보기 ↗</a>}</section>}
      <section className="notes-section"><div className="section-heading"><h2>마음에 남은 기록 <span className="count">{notes.length}</span></h2></div><p className="muted">잊고 싶지 않은 문장, 장면, 그리고 내 생각.</p><NoteForm work={work} saved={note => { savedNote(note);setNotice('새 기록을 저장했어요.'); }}/>
        {notice && <p className="success" role="status"><Check size={16}/>{notice}</p>}{notes.length === 0 && <p className="notes-empty">아직 기록이 없어요. 첫 문장이나 장면을 남겨보세요.</p>}
        <div className="note-list">{notes.map(note => <NoteCard key={note.id} note={note} work={work} saved={savedNote} removed={()=>removedNote(note.id)}/>)}</div></section></div></div></div>
    {deleting && <ConfirmDialog title="작품을 삭제할까요?" description="이 작품에 연결된 모든 문장·장면 기록도 함께 삭제돼요. 삭제 후 되돌릴 수 없어요." busy={action.busy} error={action.error} cancel={() => setDeleting(false)} confirm={() => action.run(async () => { await request('/api/works/' + work.id, 'DELETE'); router.replace('/library'); router.refresh(); })}/>}
  </>;
}
function NoteForm({ work, note, saved, cancel }: { work: Work; note?: Note; saved: (note:Note) => void; cancel?: () => void }) {
  const id = useRef<string | null>(note?.id ?? null), action = useAction();
  const [content,setContent]=useState(note?.content??''),[thought,setThought]=useState(note?.thought??'');
  const dirty=content!==(note?.content??'')||thought!==(note?.thought??'');useUnsavedGuard(dirty||action.busy);
  return <form className="panel note-form" onSubmit={event => { event.preventDefault(); action.run(async () => { const input = parseNote({ content, thought }); id.current ??= crypto.randomUUID(); const response=await request<{note:Note}>(note ? '/api/notes/' + note.id : '/api/works/' + work.id + '/notes', note ? 'PATCH' : 'POST', { ...input, id: id.current });saved(response.note);if(!note){setContent('');setThought('');id.current=null;} }); }}>
    <fieldset disabled={action.busy}><label>문장·장면 *<textarea name="content" value={content} onChange={event=>setContent(event.target.value)} required maxLength={20000} rows={3} placeholder="마음에 남은 문장이나 장면을 적어보세요."/></label><label>내 생각 <span className="muted">선택</span><textarea name="thought" value={thought} onChange={event=>setThought(event.target.value)} maxLength={20000} rows={2} placeholder="왜 이 부분이 기억에 남았나요?"/></label></fieldset><ErrorMessage error={action.error}/>
    <div className="form-actions">{cancel && <button className="button secondary" type="button" disabled={action.busy} onClick={()=>{if(!dirty||window.confirm('수정 중인 기록을 닫을까요?'))cancel();}}>취소</button>}<button className="button primary" disabled={action.busy}><Plus size={16}/>{action.busy ? '저장 중…' : note ? '기록 수정' : '기록 남기기'}</button></div>
  </form>;
}
function NoteCard({ note, work, saved, removed }: { note: Note; work: Work; saved:(note:Note)=>void;removed:()=>void }) {
  const [editing, setEditing] = useState(false), [deleting, setDeleting] = useState(false), action = useAction();
  if (editing) return <NoteForm work={work} note={note} cancel={() => setEditing(false)} saved={next=>{saved(next);setEditing(false);}}/>;
  return <article id={'note-' + note.id} className="panel note-card"><Quote size={21}/><p className="note-content preserve-text">{note.content}</p>{note.thought && <div className="note-thought"><span>내 생각</span><p className="preserve-text">{note.thought}</p></div>}<div className="note-footer"><time dateTime={note.created_at}>{formattedDate(note.created_at, true)}</time><div><button aria-label="이 기록 수정" onClick={() => setEditing(true)}><Pencil size={16}/></button><button aria-label="이 기록 삭제" onClick={() => setDeleting(true)}><Trash2 size={16}/></button></div></div>
    {deleting && <ConfirmDialog title="이 기록을 삭제할까요?" description="선택한 문장·장면과 내 생각을 삭제해요. 작품의 다른 기록은 유지돼요." busy={action.busy} error={action.error} cancel={() => setDeleting(false)} confirm={() => action.run(async () => { await request('/api/notes/' + note.id, 'DELETE');removed(); })}/>}
  </article>;
}
