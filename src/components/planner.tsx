'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CornerDownRight, LockKeyhole, Play, Plus, Star, Trash2, UsersRound } from 'lucide-react';
import { REASONS, TASK_STATES, dayLabel, parseDay, parseTask, plannerDay, shiftDay, summarizeTasks, type PlanData, type Task, type TaskInput, type TaskState } from '@/lib/planner';
import { request, useAction } from './api-client';
import { ConfirmDialog, ErrorMessage, Loading, ResourceError } from './ui';
import { prepareDocumentNavigation, DocumentTextarea, SaveStatus, useDocumentSave, useUnsavedGuard } from './editor';
import { Reflection } from './reflection';
import { DayEvidence, FocusPanel, useFocus, type FocusController } from './focus';
import { NextTask, type NextTaskSource } from './day-flow';
import { BatchPlanning } from './batch-planning';
import { Routines } from './routines';
import { WeeklyReview } from './weekly-review';
import { PartnerControls, usePartner } from './partner';
import { PeerDay } from './peer-day';
import { TaskSharingEditor } from './task-sharing';
import {TaskPhotos} from './task-photos';
import type { PartnerConnection } from '@/lib/partner';

type TaskEditor={complete:()=>Promise<boolean>;collapse:()=>void};

export function DailyPlanner({ day, goalId, initialView='mine' }: { day: string; goalId?: string;initialView?:'mine'|'peer' }) {
  const [resource,setResource]=useState<{data:PlanData|null;error:string;loading:boolean}>({data:null,error:'',loading:true}),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let stopped=false;
    async function load(){
      try{const selected=parseDay(day);if(selected>=plannerDay())await request('/api/planner/routines/apply','POST',{day:selected});const data=await request<PlanData>('/api/planner?day='+selected);if(!stopped)setResource({data,error:'',loading:false});}
      catch(cause){if(!stopped)setResource({data:null,error:cause instanceof Error?cause.message:'계획을 읽지 못했어요.',loading:false});}
    }
    void load();return()=>{stopped=true;};
  },[day,revision]);
  if (resource.loading) return <Loading/>;
  if (resource.error) return <ResourceError error={resource.error} retry={()=>{setResource({data:null,error:'',loading:true});setRevision(value=>value+1);}}/>;
  return resource.data && resource.data.day===day ? <PlannerDay key={resource.data.day} initial={resource.data} goalId={goalId} initialView={initialView}/> : <Loading/>;
}

function PlannerDay({ initial, goalId,initialView='mine' }: { initial: PlanData; goalId?: string;initialView?:'mine'|'peer' }) {
  const [data, setData] = useState(initial), [removing, setRemoving] = useState<Task | null>(null);
  const [nextTask,setNextTask]=useState<NextTaskSource|null>(null),[flowNotice,setFlowNotice]=useState('');
  const [view,setView]=useState<'mine'|'peer'>(initialView);
  const [showCompleted,setShowCompleted]=useState(false);
  const taskEditors=useRef(new Map<string,TaskEditor>());
  const registerCompletion=useCallback((id:string,editor:TaskEditor)=>{
    taskEditors.current.set(id,editor);
    return ()=>{if(taskEditors.current.get(id)===editor)taskEditors.current.delete(id);};
  },[]);
  const completeTask=useCallback((id:string)=>taskEditors.current.get(id)?.complete()??Promise.resolve(false),[]);
  const partner=usePartner(),known=!partner.loading&&!partner.error,connection=partner.data?.connection??null;
  const peerActive=view==='peer'&&Boolean(connection);
  const focus=useFocus(data.day);
  const deletion = useAction(), router = useRouter(), summary = summarizeTasks(data.tasks);
  const activeId=focus.data?.session?.task_id;
  const activeTasks=data.tasks.filter(task=>task.status!=='completed'||task.id===activeId);
  const completedTasks=data.tasks.filter(task=>task.status==='completed'&&task.id!==activeId);
  async function toggleCompleted(){
    if(showCompleted){
      if(!await prepareDocumentNavigation({preserveDrafts:true}))return;
      completedTasks.forEach(task=>taskEditors.current.get(task.id)?.collapse());
    }
    setShowCompleted(value=>!value);
  }
  function taskLine(task:Task,collapsed=false){return <TaskLine key={task.id} task={task} data={data} enabled={removing?.id !== task.id} save={saved} defer={deferred} remove={() => setRemoving(task)} focus={focus} connection={connection} sharingKnown={known} collapsed={collapsed} registerCompletion={registerCompletion} completeTask={completeTask}/>;}
  async function navigate(day: string) {
    if (day !== data.day && await prepareDocumentNavigation()) router.push('/?day=' + day+(peerActive?'&view=peer':''));
  }
  function saved(task: Task) {
    setData(previous => {
      const tasks = previous.tasks.some(item => item.id === task.id) ? previous.tasks.map(item => item.id === task.id && task.updated_at>=item.updated_at ? task : item) : [...previous.tasks, task];
      return { ...previous, tasks, weekTasks: [...previous.weekTasks.filter(item => item.day !== previous.day), ...tasks.map(({ day, status }) => ({ day, status }))] };
    });
  }
  function deferred(task: Task, carried: Task) {
    saved(task);
    setData(previous => ({ ...previous, carried: [...previous.carried.filter(item => item.carried_from_id !== task.id), carried],
      weekTasks: previous.week.includes(carried.day)&&!previous.carried.some(item=>item.id===carried.id) ? [...previous.weekTasks, { day: carried.day, status: carried.status }] : previous.weekTasks }));
  }
  function fromRecord(text:string,day:string){if(nextTask){setFlowNotice('작성 중인 다음 할 일을 먼저 추가하거나 닫아주세요.');return;}setFlowNotice('');setNextTask({text,day,key:crypto.randomUUID()});}
  async function applied(){const latest=await request<PlanData>('/api/planner?day='+data.day);setData(previous=>({...previous,tasks:[...previous.tasks,...latest.tasks.filter(task=>!previous.tasks.some(item=>item.id===task.id))],weekTasks:latest.weekTasks}));}
  async function switchView(next:'mine'|'peer') {if(next===view)return true;if(!await prepareDocumentNavigation({preserveDrafts:true}))return false;setView(next);router.replace('/?day='+data.day+(next==='peer'?'&view=peer':'')+(goalId?'&goal='+encodeURIComponent(goalId):''),{scroll:false});return true;}
  return <div className="document-page daily-document">
    <div className="document-topline"><span>하루 계획</span><Link className="text-button" href="/reading">독서 타이머 <ArrowRight size={14}/></Link></div>
    <header className="document-header daily-header-layout">
      <div>
      <h1 className="document-title">{dayLabel(data.day, false)}</h1>
      <div className="document-toolbar"><span>{data.day.slice(0, 4)}년 · {dayLabel(data.day).split(' ').at(-1)}{data.day === data.today ? ' · 오늘' : ''}</span>{!peerActive&&<span>{summary.completed} / {summary.total} 완료</span>}</div>
      </div>
    <div className="document-date-controls">
      <button className="planner-icon" disabled={data.day === '1900-01-01'} aria-label="이전 날짜" onClick={() => navigate(shiftDay(data.day, -1))}><ChevronLeft size={18}/></button>
      <label><span className="sr-only">계획 날짜 · 한국 시간</span><input type="date" min="1900-01-01" max="2100-12-31" value={data.day} onChange={event => { if (event.target.value) navigate(event.target.value); }}/></label>
      <button className="planner-icon" disabled={data.day === '2100-12-31'} aria-label="다음 날짜" onClick={() => navigate(shiftDay(data.day, 1))}><ChevronRight size={18}/></button>
      {data.day !== data.today && <button className="text-button" onClick={() => navigate(data.today)}>오늘</button>}
    </div>
    </header>
    <details className="daily-week-disclosure"><summary>이번 주 <ChevronDown size={13} aria-hidden="true"/></summary>
    <nav className="document-week" aria-label="이번 주 날짜">{data.week.filter(day => day >= '1900-01-01' && day <= '2100-12-31').map(day => {
      const entries = data.weekTasks.filter(task => task.day === day), done = entries.filter(task => task.status === 'completed').length, reviewed = data.reviewedDays.includes(day);
      return <button className={day === data.day ? 'selected' : ''} key={day} aria-current={day === data.day ? 'date' : undefined} aria-label={dayLabel(day) + (peerActive?'':(entries.length ? ' · 완료 ' + done + ' / ' + entries.length : ' · 계획 없음') + (reviewed ? ' · 회고 있음' : ''))} onClick={() => navigate(day)}>
        <span>{dayLabel(day).split(' ').at(-1)?.slice(0, 1)}</span><strong>{Number(day.slice(-2))}</strong>{!peerActive&&<small>{entries.length ? done + '/' + entries.length : '·'}{reviewed && <span className="review-dot" aria-hidden="true"/>}</small>}
      </button>;
    })}</nav></details>
    {partner.data&&<PartnerControls state={partner.data} onChange={partner.refresh}/>}
    {partner.error&&<div className="partner-read-error"><ErrorMessage error={partner.error}/><button className="text-button" onClick={partner.refresh}>연결 다시 확인</button></div>}
    {connection&&<div className="day-peer-tabs" role="tablist" aria-label="확인할 하루" onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const next=peerActive?'mine':'peer';void switchView(next).then(ready=>{if(ready)document.getElementById(next==='peer'?'peer-day-tab':'my-day-tab')?.focus();});}}}>
      <button id="my-day-tab" role="tab" aria-selected={!peerActive} aria-controls="my-day-panel" tabIndex={peerActive?-1:0} onClick={()=>switchView('mine')}>내 하루</button>
      <button id="peer-day-tab" role="tab" aria-selected={peerActive} aria-controls="peer-day-panel" tabIndex={peerActive?0:-1} onClick={()=>switchView('peer')}>{connection.nickname}의 하루</button>
    </div>}
    <div id="peer-day-panel" role={connection?'tabpanel':undefined} aria-labelledby={connection?'peer-day-tab':undefined} hidden={!peerActive}>{peerActive&&partner.data&&<PeerDay day={data.day} state={partner.data}/>}</div>
    <div id="my-day-panel" role={connection?'tabpanel':undefined} aria-labelledby={connection?'my-day-tab':undefined} hidden={peerActive}>
    <section className="document-section daily-tasks" aria-labelledby="daily-tasks-title">
      <div className="document-section-heading"><h2 id="daily-tasks-title">할 일</h2><Link className="text-button" href="/goals">목표 <ArrowRight size={14}/></Link></div>
      <TaskComposer day={data.day} data={data} goalId={goalId} save={saved} connection={connection} sharingKnown={known}/>
      {focus.notice&&<p className="document-notice" role="status">{focus.notice}</p>}
      {(!activeId||!data.tasks.some(task=>task.id===activeId))&&<FocusPanel controller={focus} onCompleteTask={data.tasks.some(task=>task.id===focus.pendingCompletion?.taskId)?completeTask:undefined}/>}
      <ul className="task-lines">{[
        ...activeTasks.map(task=>taskLine(task)),
        ...(completedTasks.length?[<li key="completed-heading" className="completed-tasks-heading"><button className="completed-tasks-toggle" type="button" aria-expanded={showCompleted} onClick={()=>void toggleCompleted()}><ChevronRight size={14} aria-hidden="true"/>완료 {completedTasks.length}개</button></li>]:[]),
        ...completedTasks.map(task=>taskLine(task,!showCompleted)),
      ]}</ul>
    </section>
    <BatchPlanning data={data} onApplied={deferred}/>
    <Routines day={data.day} goals={data.goals} works={data.works} onApplied={applied}/>
    <DayEvidence tasks={data.tasks} sessions={focus.data?.sessions??[]} day={data.day} onTask={fromRecord} onSaved={focus.refresh}/>
    <Reflection day={data.day} review={data.review} onTask={fromRecord} save={review => setData(previous => ({ ...previous, review, reviewedDays: [...new Set([...previous.reviewedDays, review.day])] }))}/>
    <div className="past-record-link"><Link href="/revisit">지난 기록 다시 보기 <ArrowRight size={14} aria-hidden="true"/></Link></div>
    {flowNotice&&<p className="document-notice" role="status">{flowNotice}</p>}
    {nextTask&&<NextTask key={nextTask.key} source={nextTask} close={()=>{setNextTask(null);setFlowNotice('');}} save={task=>{if(task.day===data.day)saved(task);else if(data.week.includes(task.day))setData(previous=>({...previous,weekTasks:[...previous.weekTasks,{day:task.day,status:task.status}]}));}}/>}
    <WeeklyReview day={data.day} onTask={fromRecord}/>
    </div>
    {removing && <ConfirmDialog title="이 할 일을 삭제할까요?" description="이 할 일의 메모와 첨부 사진이 삭제돼요. 다른 날짜로 이어간 할 일과 하루 회고는 남아요." busy={deletion.busy} error={deletion.error} cancel={() => setRemoving(null)} confirm={() => deletion.run(async () => {
      if(!await prepareDocumentNavigation())return;
      await request('/api/planner/tasks/' + removing.id, 'DELETE');
      setData(previous => { const tasks = previous.tasks.filter(task => task.id !== removing.id); return { ...previous, tasks, weekTasks: [...previous.weekTasks.filter(item => item.day !== previous.day), ...tasks.map(({ day, status }) => ({ day, status }))] }; });
      setRemoving(null);
    })}/>}
  </div>;
}

type TaskDraft = Omit<TaskInput, 'minutes'> & { minutes: string };
const draftOf = (task: TaskInput): TaskDraft => ({ ...parseTask(task), minutes: task.minutes == null ? '' : String(task.minutes) });
const blankTask = (day: string, goal_id: string | null = null): TaskDraft => ({ day, title: '', status: 'planned', important: false, minutes: '', goal_id, work_id: null, reason: '', reason_detail: '', note: '' });

function TaskComposer({ day, data, goalId, save, connection=null, sharingKnown=false }: { day: string; data: PlanData; goalId?: string; save: (task: Task) => void;connection?:PartnerConnection|null;sharingKnown?:boolean }) {
  const selected = goalId && data.goals.some(goal => goal.id === goalId) ? goalId : null;
  const [draft, setDraft] = useState<TaskDraft>(() => blankTask(day, selected));
  const id = useRef<string | null>(null), title = useRef<HTMLInputElement>(null), action = useAction();
  const [shared,setShared]=useState(false),[publicNote,setPublicNote]=useState(''),[selectedConnection,setSelectedConnection]=useState<string|null>(null);
  const visibleShared=Boolean(shared&&connection?.id===selectedConnection);
  const hasOptions=Boolean(draft.title.trim()||draft.note||draft.minutes||draft.goal_id||draft.work_id||draft.important||shared||publicNote);
  useUnsavedGuard(JSON.stringify(draft) !== JSON.stringify(blankTask(day, selected))||shared||Boolean(publicNote));
  function update<K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) { setDraft(previous => ({ ...previous, [field]: value })); }
  return <form className="task-composer" onSubmit={event => {
    event.preventDefault();
    void action.run(async () => {
      const input = parseTask(draft); id.current ??= crypto.randomUUID();
      let result = await request<{ task: Task }>('/api/planner/tasks', 'POST', { id: id.current, ...input,shared:visibleShared,public_note:publicNote,connection_id:visibleShared?selectedConnection:undefined });
      // Resolve a lost POST response with the same ID, then preserve any revised draft.
      if (JSON.stringify(parseTask(result.task)) !== JSON.stringify(input)) result = await request<{ task: Task }>('/api/planner/tasks/' + result.task.id, 'PATCH', { action: 'edit', ...input });
      if(Boolean(result.task.shared)!==visibleShared||(result.task.public_note??'')!==publicNote.trim())result=await request<{task:Task}>('/api/planner/tasks/'+result.task.id,'PATCH',{action:'share',shared:visibleShared,public_note:publicNote,connection_id:visibleShared?selectedConnection:undefined});
      save(result.task); setDraft(blankTask(day, selected));setShared(false);setPublicNote('');setSelectedConnection(null); id.current = null; requestAnimationFrame(() => title.current?.focus());
    });
  }}>
    <div className="task-composer-line"><Plus size={18} aria-hidden="true"/><input ref={title} aria-label="새 할 일" maxLength={200} required disabled={action.busy} value={draft.title} placeholder="할 일을 적고 Enter" onChange={event => update('title', event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}/><button className="document-button primary" disabled={action.busy || !draft.title.trim()}>{action.busy ? '추가 중' : '추가'}</button></div>
    <details className="task-inline-fields" hidden={!hasOptions} open={selected ? true : undefined}><summary>메모 · 목표{connection?' · 공유':''}</summary><fieldset disabled={action.busy}><DocumentTextarea aria-label="새 할 일 메모" name="note" value={draft.note} maxLength={2000} placeholder="나만 보는 메모 · 선택" onChange={event => update('note', event.target.value)}/><TaskProperties draft={draft} data={data} update={update}/>
    {(connection||publicNote)&&<div className="new-task-sharing"><button type="button" className="task-visibility" aria-pressed={visibleShared} disabled={action.busy||!sharingKnown||!connection} onClick={()=>{if(connection){setSelectedConnection(connection.id);setShared(!visibleShared);}}}>{visibleShared?<UsersRound size={14}/>:<LockKeyhole size={13}/>}<span>{visibleShared?'함께 확인':'나만 보기'}</span></button>{(visibleShared||publicNote)&&<DocumentTextarea aria-label="새 할 일 공개 문장" value={publicNote} disabled={action.busy} maxLength={1000} placeholder="상대에게 남길 한 줄 · 선택" onChange={event=>setPublicNote(event.target.value)}/>}</div>}
    </fieldset></details>
    <ErrorMessage error={action.error}/>
  </form>;
}

function TaskLine({ task, data, enabled, save, defer, remove, focus, seconds:initialSeconds=0, connection=null, sharingKnown=false, collapsed=false, registerCompletion, completeTask }: { task: Task; data: PlanData; enabled: boolean; save: (task: Task) => void; defer: (task: Task, carried: Task) => void; remove: () => void; focus:FocusController;seconds?:number;connection?:PartnerConnection|null;sharingKnown?:boolean;collapsed?:boolean;registerCompletion?:(id:string,editor:TaskEditor)=>()=>void;completeTask?:(id:string)=>Promise<boolean> }) {
  const [draft, setDraft] = useState<TaskDraft>(() => draftOf(task)), [showDefer, setShowDefer] = useState(false), [transferring, setTransferring] = useState(false);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    const reveal=()=>{if(window.location.hash==='#task-'+task.id){setExpanded(true);requestAnimationFrame(()=>document.getElementById('task-'+task.id)?.scrollIntoView({block:'center'}));}};
    const pending=setTimeout(reveal,0);window.addEventListener('hashchange',reveal);return()=>{clearTimeout(pending);window.removeEventListener('hashchange',reveal);};
  },[task.id]);
  const [seconds,setSeconds]=useState(initialSeconds);
  const note=useRef<HTMLTextAreaElement|null>(null);
  const detailsId=useId();
  const goal_id = draft.goal_id && data.goals.some(goal => goal.id === draft.goal_id) ? draft.goal_id : null;
  const work_id = draft.work_id && data.works.some(work => work.id === draft.work_id) ? draft.work_id : null;
  const value = { ...draft, goal_id, work_id };
  const saving = useDocumentSave({ value, enabled, persist: async snapshot => {
    const input = parseTask(snapshot);
    const result = await request<{ task: Task }>('/api/planner/tasks/' + task.id, 'PATCH', { action: 'edit', ...input });
    save(result.task);
  } });
  useUnsavedGuard(saving.dirty, saving.saveNow);
  useEffect(()=>registerCompletion?.(task.id,{collapse:()=>setExpanded(false),complete:async()=>{
    if(photoBusy||transferring||!enabled)return false;
    setTransferring(true);
    try {
      if(!await saving.saveNow())return false;
      const result=await request<{task:Task}>('/api/planner/tasks/'+task.id,'PATCH',{action:'state',status:'completed'});
      const next:TaskDraft={...value,status:'completed',reason:'',reason_detail:''};
      setDraft(next);saving.acknowledge(next);save(result.task);
      return true;
    } catch {return false;} finally {setTransferring(false);}
  }}));
  const carried = data.carried.find(item => item.carried_from_id === task.id);
  function update<K extends keyof TaskDraft>(field: K, next: TaskDraft[K]) { setDraft(previous => ({ ...previous, [field]: next })); }
  function status(next: TaskState) { setDraft(previous => ({ ...previous, status: next, ...(['planned', 'completed'].includes(next) ? { reason: '' as const, reason_detail: '' } : {}) })); }
  const outcome = draft.status === 'partial' || draft.status === 'not_done';
  const isActive=focus.data?.session?.task_id===task.id;
  const shared=Boolean(task.shared&&connection&&task.shared_connection_id===connection.id);
  const photosShared=Boolean(shared&&task.photos_shared&&task.photo_connection_id===connection?.id);
  const meta=[draft.status!=='planned'&&draft.status!=='completed'?TASK_STATES[draft.status]:null,data.goals.find(goal=>goal.id===goal_id)?.title,data.works.find(work=>work.id===work_id)?.title,draft.minutes?draft.minutes+'분':null].filter(Boolean);
  async function toggleDetails(){if(expanded&&(photoBusy||!await prepareDocumentNavigation({preserveDrafts:true})))return;setExpanded(value=>!value);}
  return <li id={'task-'+task.id} className={'task-line task-' + draft.status+(isActive?' task-is-active':'')} hidden={collapsed&&task.status==='completed'&&draft.status==='completed'&&!saving.dirty&&!photoBusy&&!expanded&&!isActive}>
    <fieldset className="task-line-editor" disabled={transferring}>
    <div className="task-line-main">
      <button className="task-check" aria-label={(draft.title || '할 일') + (draft.status === 'completed' ? ' 완료 취소' : ' 완료하기')} aria-pressed={draft.status === 'completed'} onClick={() => status(draft.status === 'completed' ? 'planned' : 'completed')}>{draft.status === 'completed' ? <Check size={16}/> : draft.status === 'partial' ? <span className="partial-mark"/> : null}</button>
      <DocumentTextarea className="task-line-title" aria-label="할 일 제목" name="title" value={draft.title} maxLength={200} placeholder="할 일" onChange={event => update('title', event.target.value)} onBlur={saving.flush} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); saving.flush(); event.currentTarget.blur(); } }}/>
      {draft.important && <Star className="task-important" size={14} aria-label="중요"/>}
      {draft.status!=='completed'&&<button className="planner-icon task-start" aria-label={draft.title+' 타이머 시작'} title={isActive?'타이머 진행 중':(seconds?seconds/60+'분 집중 시작':'자유 시간 측정 시작')} disabled={focus.loading||focus.busy||Boolean(focus.data?.session)||!enabled} onClick={async()=>{if(await saving.saveNow())await focus.start(task.id,seconds);}}><Play size={15}/></button>}
      <button className="planner-icon task-more" type="button" aria-label={(draft.title||'할 일')+(expanded?' 상세 접기':' 상세 펼치기')} aria-expanded={expanded} aria-controls={detailsId} disabled={expanded&&photoBusy} onClick={()=>void toggleDetails()}><ChevronDown size={16}/></button>
    </div>
    {!expanded&&(meta.length>0||shared||task.shared&&!sharingKnown)&&<p className="task-meta-summary">{meta.length>0&&<span>{meta.join(' · ')}</span>}{task.shared&&!sharingKnown?<span>공유 상태 확인 중</span>:shared&&<span><UsersRound size={12} aria-hidden="true"/>{connection?.nickname}에게 공유 중 · 사진{photosShared?'도 공유 중':'은 비공개'}</span>}</p>}
    {!expanded&&draft.note&&<button type="button" className="task-note-preview" aria-label={(draft.title||'할 일')+' 메모 편집'} onClick={()=>{setExpanded(true);requestAnimationFrame(()=>note.current?.focus({preventScroll:true}));}}><span>{draft.note}</span></button>}
    </fieldset>
    {isActive&&<FocusPanel controller={focus} onCompleteTask={completeTask}/>}
    <div className="task-expanded" id={detailsId} hidden={!expanded}>
    <fieldset className="task-line-editor" disabled={transferring}>
    <div className="task-line-toolbar"><label><span className="sr-only">{draft.title || '할 일'} 실행 상태</span><select aria-label={(draft.title || '할 일') + ' 실행 상태'} value={draft.status} onBlur={saving.flush} onChange={event => status(event.target.value as TaskState)}>{Object.entries(TASK_STATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {carried ? <Link className="text-button" href={'/?day=' + carried.day}>{dayLabel(carried.day, false)}에 이어짐 <ArrowRight size={14}/></Link> : draft.status !== 'completed' && task.day < '2100-12-31' && <button className="text-button" disabled={photoBusy} aria-expanded={showDefer} onClick={() => setShowDefer(previous => !previous)}><CornerDownRight size={14}/>다른 날로</button>}
      {task.carried_from_id && <span className="field-hint">이어서 하는 일</span>}
      <button className="planner-icon task-remove" disabled={saving.status === 'saving' || showDefer || photoBusy} aria-label={(draft.title || '할 일') + ' 삭제'} onClick={remove}><Trash2 size={16}/></button>
    </div>
    <div className="task-note-editor"><DocumentTextarea inputRef={element=>{note.current=element;}} className="task-note-inline" aria-label={(draft.title || '할 일') + ' 메모'} name="note" value={draft.note} maxLength={2000} placeholder="나만 보는 메모" onChange={event => update('note', event.target.value)} onBlur={saving.flush}/></div>
    <details className="task-inline-fields"><summary>목표 · 예상 시간{value.goal_id ? ' · 연결됨' : ''}{draft.minutes ? ' · ' + draft.minutes + '분' : ''}</summary><TaskProperties draft={value} data={data} update={update} flush={saving.flush}/></details>
    {draft.status!=='completed'&&<details className="task-inline-fields"><summary>타이머 · {seconds?seconds/60+'분 집중':'자유 시간 측정'}</summary><div className="focus-mode"><label>시작할 시간<select aria-label={draft.title+' 타이머 방식'} value={seconds} onChange={event=>setSeconds(Number(event.target.value))}><option value={0}>자유 시간 측정</option><option value={300}>5분 집중</option><option value={1500}>25분 집중</option><option value={3000}>50분 집중</option></select></label></div></details>}
    {outcome && <details className="task-inline-fields"><summary>{draft.reason||draft.reason_detail?'남긴 이유 보기':'오늘 돌아보기 · 선택'}</summary><div className="task-reason-inline"><label><span className="sr-only">{draft.title || '할 일'} 지키지 못한 이유</span><select value={draft.reason} onBlur={saving.flush} onChange={event => update('reason', event.target.value as TaskInput['reason'])}><option value="">이유 선택 (선택)</option>{Object.entries(REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><DocumentTextarea aria-label={(draft.title || '할 일') + ' 지키지 못한 이유 메모'} value={draft.reason_detail} maxLength={2000} placeholder="어떤 점에서 어려웠는지" onChange={event => update('reason_detail', event.target.value)} onBlur={saving.flush}/></div></details>}
    <TaskSharingEditor task={task} connection={connection} known={sharingKnown} ready={saving.saveNow} save={save}/>
    </fieldset>
    <TaskPhotos task={task} connection={connection} known={sharingKnown} ready={saving.saveNow} save={save} onBusyChange={setPhotoBusy} initialPhotos={data.photos?.filter(photo=>photo.task_id===task.id)}/>
    {showDefer && !carried && <InlineDefer task={task} draft={draft} ready={saving.saveNow} lock={setTransferring} complete={(updated, carried) => { const next = draftOf(updated); setDraft(next); saving.acknowledge(next); defer(updated, carried); setShowDefer(false); }} cancel={() => setShowDefer(false)}/>}
    </div>
    {saving.status!=='idle'&&saving.status!=='saved'&&<SaveStatus status={saving.status} error={saving.error} retry={saving.retry}/>}
  </li>;
}

function TaskProperties({ draft, data, update, flush }: { draft: TaskDraft; data: PlanData; update: <K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) => void; flush?: () => void }) {
  return <div className="task-properties">
    <label>목표<select value={draft.goal_id ?? ''} onBlur={flush} onChange={event => update('goal_id', event.target.value || null)}><option value="">연결 없음</option>{data.goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
    <label>작품<select value={draft.work_id ?? ''} onBlur={flush} onChange={event => update('work_id', event.target.value || null)}><option value="">연결 없음</option>{data.works.map(work => <option key={work.id} value={work.id}>{work.title}</option>)}</select></label>
    <label>예상 시간<input type="number" name="minutes" min={1} max={1440} step={1} inputMode="numeric" placeholder="분" value={draft.minutes} onChange={event => update('minutes', event.target.value)} onBlur={flush}/></label>
    <label className="task-important-field"><input type="checkbox" checked={draft.important} onChange={event => update('important', event.target.checked)} onBlur={flush}/>중요</label>
  </div>;
}

function InlineDefer({ task, draft, ready, lock, complete, cancel }: { task: Task; draft: TaskDraft; ready: () => Promise<boolean>; lock: (busy: boolean) => void; complete: (task: Task, carried: Task) => void; cancel: () => void }) {
  const [day, setDay] = useState(shiftDay(task.day, 1)), id = useRef<string | null>(null), action = useAction();
  const dateId = useId();
  return <form className="inline-defer" onSubmit={event => {
    event.preventDefault();
    void action.run(async () => {
      lock(true);
      try {
        if (!await ready()) throw new Error('작성 중인 내용을 먼저 저장해주세요.');
        id.current ??= crypto.randomUUID();
        const result = await request<{ task: Task; carried: Task }>('/api/planner/tasks/' + task.id, 'PATCH', { action: 'defer', new_id: id.current, day, reason: draft.reason, reason_detail: draft.reason_detail });
        complete(result.task, result.carried);
      } finally { lock(false); }
    });
  }}><label htmlFor={dateId}>이어갈 날짜</label><input id={dateId} type="date" min={shiftDay(task.day, 1)} max="2100-12-31" required value={day} disabled={action.busy} onChange={event => setDay(event.target.value)}/><button className="document-button" disabled={action.busy}>{action.busy ? '저장 중' : '이 날짜에 추가'}</button><button className="text-button" type="button" disabled={action.busy} onClick={cancel}>취소</button><p className="field-hint">오늘 기록은 남고, 선택한 날짜에 할 일이 추가돼요.</p><ErrorMessage error={action.error}/></form>;
}
