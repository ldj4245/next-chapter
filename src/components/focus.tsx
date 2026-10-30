'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Pause, Play, RefreshCw, Timer, X } from 'lucide-react';
import type { FocusData, FocusSession } from '@/lib/focus';
import { elapsedSeconds } from '@/lib/reading';
import { activityTitle, durationLabel } from '@/lib/day-flow';
import { request, useAction } from './api-client';
import { DocumentTextarea, SaveStatus, useDocumentSave, useUnsavedGuard } from './editor';
import { ErrorMessage } from './ui';

type Response = {session:FocusSession|null;server_now:string};
type CompleteTask = (taskId:string)=>Promise<boolean>;
type PendingCompletion = {taskId:string;title:string;error:string};
export function useFocus(day:string) {
  const [data,setData] = useState<FocusData|null>(null), [loading,setLoading] = useState(true), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [pendingCompletions,setPendingCompletions]=useState<PendingCompletion[]>([]);
  const pendingCompletion=pendingCompletions[0]??null;
  const action=useAction(), startIds=useRef(new Map<string,string>()), sequence=useRef(0), busy=useRef(false),memoGuard=useRef<()=>Promise<boolean>>(()=>Promise.resolve(true));
  const refresh=useCallback(async () => {
    if(busy.current)return;
    const revision=++sequence.current;
    try {if(!await memoGuard.current())return;if(revision!==sequence.current||busy.current)return;const result=await request<FocusData>('/api/focus?day='+day);if(revision===sequence.current){if(!result.session)memoGuard.current=()=>Promise.resolve(true);setData(result);setError('');setLoading(false);}}
    catch(cause){if(revision===sequence.current){setError(cause instanceof Error?cause.message:'실행 기록을 읽지 못했어요.');setLoading(false);}}
  },[day]);
  useEffect(()=>{const first=setTimeout(()=>void refresh(),0);const visible=()=>{if(window.document.visibilityState==='visible')void refresh();};window.document.addEventListener('visibilitychange',visible);return()=>{clearTimeout(first);window.document.removeEventListener('visibilitychange',visible);};},[refresh]);
  function receive(result:Response) {
    if(result.session?.status!=='active')memoGuard.current=()=>Promise.resolve(true);
    setData(previous=>{
      const sessions=(previous?.sessions??[]).filter(entry=>entry.id!==result.session?.id);
      if(result.session?.status==='completed' && result.session.reading_day===day)sessions.unshift(result.session);
      return {day,server_now:result.server_now,session:result.session?.status==='active'?result.session:null,sessions};
    });
  }
  async function start(taskId:string,seconds:number) {
    await action.run(async()=>{
      busy.current=true;sequence.current++;setNotice('');
      try {
        const id=startIds.current.get(taskId)??crypto.randomUUID();startIds.current.set(taskId,id);
        const result=await request<Response>('/api/focus','POST',{id,task_id:taskId,target_seconds:seconds});receive(result);startIds.current.delete(taskId);
        if(result.session?.status==='completed'){
          const current=await request<FocusData>('/api/focus?day='+day);setData(current);setNotice('이미 마친 실행 기록을 확인했어요. 다시 시작하려면 시작 버튼을 눌러주세요.');
        }else if(result.session?.task_id!==taskId)setNotice('먼저 시작한 타이머가 있어요. 진행 중인 할 일에서 이어가거나 마쳐주세요.');
      } finally {busy.current=false;}
    });
  }
  async function completeTask(pending:PendingCompletion,save:CompleteTask) {
    try {
      if(!await save(pending.taskId))throw new Error('완료 표시를 저장하지 못했어요. 다시 시도하거나 나중에 체크해주세요.');
      setPendingCompletions(previous=>previous.filter(item=>item.taskId!==pending.taskId));setNotice('시간을 기록하고 할 일도 완료했어요.');
    }catch(cause){const error=cause instanceof Error?cause.message:'완료 표시를 저장하지 못했어요. 다시 시도해주세요.';setPendingCompletions(previous=>previous.map(item=>item.taskId===pending.taskId?{...item,error}:item));}
  }
  async function change(kind:'pause'|'resume'|'complete'|'cancel',saveMemo:()=>Promise<boolean>,onCompleteTask?:CompleteTask) {
    if(!data?.session)return false;
    const session=data.session,id=session.id;
    let changed=false;
    await action.run(async()=>{
      busy.current=true;sequence.current++;setNotice('');
      try {
        if(!await saveMemo())return;
        const result=await request<Response>('/api/focus/'+id,'PATCH',{action:kind});
        const pending=kind==='complete'&&onCompleteTask&&session.task_id?{taskId:session.task_id,title:activityTitle(session),error:''}:null;
        if(pending)setPendingCompletions(previous=>[...previous.filter(item=>item.taskId!==pending.taskId),pending]);
        receive(result);changed=true;
        if(pending&&onCompleteTask)await completeTask(pending,onCompleteTask);
        else if(kind==='complete')setNotice('실행 시간을 저장했어요.');
      }finally{busy.current=false;}
    });
    return changed;
  }
  async function retryTaskCompletion(save:CompleteTask) {
    if(!pendingCompletion)return;
    await action.run(async()=>{busy.current=true;try{await completeTask(pendingCompletion,save);}finally{busy.current=false;}});
  }
  return {data,loading,error,notice,pendingCompletion,busy:action.busy,actionError:action.error,refresh,start,change,retryTaskCompletion,dismissTaskCompletion:()=>{setPendingCompletions(previous=>previous.slice(1));setNotice('실행 시간을 저장했어요. 할 일은 나중에 체크할 수 있어요.');},registerMemo:(save:()=>Promise<boolean>)=>{memoGuard.current=save;},memoSaved:(id:string,memo:string)=>{setData(previous=>previous?{...previous,session:previous.session?.id===id?{...previous.session,memo}:previous.session,sessions:previous.sessions.map(item=>item.id===id?{...item,memo}:item)}:previous);}};
}
export type FocusController=ReturnType<typeof useFocus>;
export function FocusPanel({controller,onCompleteTask}:{controller:FocusController;onCompleteTask?:CompleteTask}) {
  const session=controller.data?.session, flush=useRef<()=>Promise<boolean>>(()=>Promise.resolve(true));
  const [cancelSession,setCancelSession]=useState<string|null>(null);
  const cancel=Boolean(session&&cancelSession===session.id);
  const completion=controller.pendingCompletion&&<section className="focus-document focus-completion" aria-label="할 일 완료 확인" aria-busy={controller.busy}>
    <p role="status">시간은 저장됐어요. {controller.busy?'할 일을 완료하는 중이에요.':'‘'+controller.pendingCompletion.title+'’의 완료 표시가 아직 남아 있어요.'}</p>
    <ErrorMessage error={controller.pendingCompletion.error}/>
    <div className="focus-actions">{onCompleteTask&&<button className="document-button primary focus-complete" disabled={controller.busy} onClick={()=>controller.retryTaskCompletion(onCompleteTask)}><Check size={15}/>완료 표시 다시 시도</button>}<button className="text-button" disabled={controller.busy} onClick={controller.dismissTaskCompletion}>나중에 체크</button></div>
  </section>;
  if(!session)return <>{completion}{controller.error&&<div className="flow-error"><ErrorMessage error={controller.error}/><button className="text-button" onClick={()=>controller.refresh()}><RefreshCw size={14}/>다시 읽기</button></div>}{controller.actionError&&<ErrorMessage error={controller.actionError}/>}</>;
  return <>{completion}<section className="focus-document" id="focus" aria-labelledby="focus-title" aria-busy={controller.busy}>
    <div className="focus-topline"><span><Timer size={15}/>{session.running_since?'진행 중':'잠깐 쉬는 중'}</span><FocusClock session={session} serverNow={controller.data!.server_now}/></div>
    <h3 id="focus-title"><span id={'session-'+session.id}>{activityTitle(session)}</span></h3>
    {session.work_id&&<Link className="focus-work-link" href={'/library/'+session.work_id}>연결된 작품 보기</Link>}
    <div className="focus-actions">
      <button className="document-button focus-pause" disabled={controller.busy} onClick={()=>controller.change(session.running_since?'pause':'resume',flush.current)}>{session.running_since?<Pause size={15}/>:<Play size={15}/>} {session.running_since?'잠깐 쉬기':'이어 하기'}</button>
      <button className="document-button secondary focus-time-only" disabled={controller.busy} onClick={()=>controller.change('complete',flush.current)}><Timer size={15}/>시간만 기록</button>
      {session.task_id&&onCompleteTask&&<button className="document-button primary focus-complete" disabled={controller.busy} onClick={()=>controller.change('complete',flush.current,onCompleteTask)}><Check size={15}/>할 일도 완료</button>}
      <button className="planner-icon" aria-label="이 타이머 취소" disabled={controller.busy} onClick={()=>setCancelSession(value=>value===session.id?null:session.id)}><X size={15}/></button>
    </div>
    {cancel&&<div className="focus-cancel"><p>이번 실행 시간과 메모를 삭제할까요?</p><button className="text-button" disabled={controller.busy} onClick={()=>controller.change('cancel',flush.current)}>삭제하고 종료</button><button className="text-button" onClick={()=>setCancelSession(null)}>계속하기</button></div>}
    <FocusMemo key={session.id} session={session} disabled={controller.busy} register={save=>{flush.current=save;controller.registerMemo(save);}} saved={controller.memoSaved}/>
    <ErrorMessage error={controller.actionError}/>
    <ErrorMessage error={controller.error}/>
    <button className="text-button focus-refresh" disabled={controller.busy} onClick={()=>controller.refresh()}><RefreshCw size={13}/>다른 기기에서 바꿨다면 다시 확인</button>
  </section></>;
}
export function FocusClock({session,serverNow}:{session:FocusSession;serverNow:string}) {
  const [seconds,setSeconds]=useState(()=>elapsedSeconds(session,Date.parse(serverNow)));
  useEffect(()=>{const offset=Date.parse(serverNow)-Date.now();const tick=()=>setSeconds(elapsedSeconds(session,Date.now()+offset));tick();if(!session.running_since)return;const interval=setInterval(tick,1000);return()=>clearInterval(interval);},[session,serverNow]);
  const target=session.target_seconds??300, filled=target>0&&seconds>=target;
  return <div className="focus-clock"><strong role="timer" aria-live="off">{Math.floor(seconds/60).toString().padStart(2,'0')}<span>:</span>{(seconds%60).toString().padStart(2,'0')}</strong>{target>0&&<small>{filled?'설정한 시간을 채웠어요':durationLabel(target)+' 집중'}</small>}</div>;
}
function FocusMemo({session,register,saved,disabled}:{session:FocusSession;register:(save:()=>Promise<boolean>)=>void;saved:(id:string,memo:string)=>void;disabled:boolean}) {
  const [memo,setMemo]=useState(session.memo??''),lastServer=useRef(session.memo??'');
  const saving=useDocumentSave({value:memo,persist:async snapshot=>{await request('/api/focus/'+session.id,'PATCH',{action:'memo',memo:snapshot});saved(session.id,snapshot);}});
  useUnsavedGuard(saving.dirty,saving.saveNow);
  useEffect(()=>{register(saving.saveNow);},[register,saving.saveNow]);
  useEffect(()=>{const current=session.memo??'';if(current===lastServer.current)return;const update=setTimeout(()=>{lastServer.current=current;if(!saving.dirty){saving.acknowledge(current);setMemo(current);}},0);return()=>clearTimeout(update);},[session.memo,saving]);
  return <div className="focus-memo"><DocumentTextarea aria-label="진행 중 메모" value={memo} disabled={disabled} maxLength={20000} placeholder="하는 동안 떠오른 생각을 여기에…" onChange={event=>setMemo(event.target.value)} onBlur={saving.flush}/><SaveStatus status={saving.status} error={saving.error} retry={saving.retry}/></div>;
}
export function DayEvidence({tasks,sessions,day,onTask,onSaved}:{tasks:import('@/lib/planner').Task[];sessions:FocusSession[];day:string;onTask:(text:string,day:string)=>void;onSaved:()=>Promise<void>}) {
  if(!sessions.length&&!tasks.some(task=>task.reason||task.reason_detail||task.note))return null;
  const total=sessions.reduce((sum,entry)=>sum+entry.elapsed_seconds,0);
  return <details className="day-evidence"><summary>회고할 때 펼쳐보기 <span>{sessions.length?durationLabel(total)+' 실행':''}</span></summary><div className="evidence-lines">
    {sessions.map(session=><article id={'session-'+session.id} key={session.id}><div><strong>{activityTitle(session)}</strong><time>{durationLabel(session.elapsed_seconds)}</time></div>{session.memo&&<p className="preserve-text">{session.memo}</p>}{session.memo&&<button className="text-button" onClick={()=>onTask(session.memo,day)}>이 메모에서 다음 할 일 만들기</button>}{session.is_reading&&session.work_id&&<SessionPages session={session} saved={onSaved}/>}</article>)}
    {tasks.filter(task=>task.reason||task.reason_detail||task.note).map(task=><article key={task.id}><strong>{task.title}</strong>{(task.reason||task.reason_detail)&&<p className="field-hint">{task.reason&&({time:'시간 부족',energy:'피로·컨디션',overload:'계획 과다',difficulty:'예상보다 어려움',priority:'우선순위 변경',other:'다른 이유'}[task.reason])}{task.reason&&task.reason_detail?' · ':''}{task.reason_detail}</p>}{task.note&&<p className="preserve-text">{task.note}</p>}</article>)}
  </div></details>;
}
function SessionPages({session,saved}:{session:FocusSession;saved:()=>Promise<void>}) {
  const [page,setPage]=useState(session.end_page==null?'':String(session.end_page));
  const saving=useDocumentSave({value:page,persist:async snapshot=>{
    const value=Number(snapshot);if(!snapshot.trim()||!Number.isInteger(value)||value<0||value>2147483647)throw new Error('읽은 마지막 쪽수를 0 이상의 정수로 적어주세요.');
    await request('/api/reading/'+session.id,'PATCH',{action:'details',progress:value});await saved();
  }});
  useUnsavedGuard(saving.dirty,saving.saveNow);
  return <details className="evidence-pages"><summary>쪽수 기록{session.start_page!=null?' · '+session.start_page+'쪽에서 시작':''}</summary><label>읽은 마지막 쪽수<input aria-label={activityTitle(session)+' 읽은 마지막 쪽수'} value={page} type="number" min={0} max={2147483647} inputMode="numeric" onChange={event=>setPage(event.target.value)} onBlur={saving.flush}/></label><SaveStatus status={saving.status} error={saving.error} retry={saving.retry}/></details>;
}
