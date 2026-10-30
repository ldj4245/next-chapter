'use client';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, UsersRound } from 'lucide-react';
import type { PartnerConnection, TaskSharing } from '@/lib/partner';
import { parseTaskSharing } from '@/lib/partner';
import type { Task } from '@/lib/planner';
import { request, useAction } from './api-client';
import { DocumentTextarea, SaveStatus, useDocumentSave, useUnsavedGuard } from './editor';
import { ErrorMessage } from './ui';

export function TaskSharingEditor({task,connection,known,ready,save}:{task:Task;connection:PartnerConnection|null;known:boolean;ready:()=>Promise<boolean>;save:(task:Task)=>void}) {
  const initial={shared:Boolean(task.shared),public_note:task.public_note??''};
  const [draft,setDraft]=useState<TaskSharing>(initial),[open,setOpen]=useState(false),[binding,setBinding]=useState(task.shared_connection_id??null);
  const lastServer=useRef(JSON.stringify({...initial,shared_connection_id:task.shared_connection_id??null})),action=useAction();
  const visible=Boolean(draft.shared&&connection&&binding===connection.id);
  const value={...draft,shared:visible,connection_id:visible?binding:null};
  const saving=useDocumentSave({value,enabled:known,persist:async snapshot=>{
    const result=await request<{task:Task}>('/api/planner/tasks/'+task.id,'PATCH',{action:'share',...parseTaskSharing(snapshot),connection_id:snapshot.connection_id??undefined});
    save(result.task);
  }});
  useUnsavedGuard(saving.dirty,saving.saveNow);
  useEffect(()=>{
    const signature=JSON.stringify({shared:Boolean(task.shared),public_note:task.public_note??'',shared_connection_id:task.shared_connection_id??null});
    if(signature===lastServer.current||saving.dirty)return;
    const rebase=setTimeout(()=>{
      lastServer.current=signature;setBinding(task.shared_connection_id??null);
      const next={shared:Boolean(task.shared),public_note:task.public_note??''};
      const shown=Boolean(next.shared&&connection&&task.shared_connection_id===connection.id);
      saving.acknowledge({...next,shared:shown,connection_id:shown?task.shared_connection_id??null:null});setDraft(next);
    },0);return()=>clearTimeout(rebase);
  },[task.shared,task.public_note,task.shared_connection_id,saving,connection]);
  async function toggle() {
    if(!connection||!known)return;
    const expectedConnection=connection.id;
    await action.run(async()=>{
      if(!await ready())return;
      // Drain the public sentence before changing who can see it.
      if(!await saving.saveNow())return;
      const next={...draft,shared:!visible};
      const result=await request<{task:Task}>('/api/planner/tasks/'+task.id,'PATCH',{action:'share',...parseTaskSharing(next),connection_id:expectedConnection});
      const accepted=parseTaskSharing(result.task),pair=result.task.shared_connection_id??null;
      setBinding(pair);lastServer.current=JSON.stringify({...accepted,shared_connection_id:pair});
      setDraft(accepted);saving.acknowledge({...accepted,connection_id:accepted.shared?pair:null});save(result.task);
    });
  }
  if(!connection&&!draft.shared&&!draft.public_note&&!open&&!saving.dirty&&!action.error)return null;
  return <div className={'task-sharing'+(visible?' is-shared':'')}>
    <div className="task-sharing-controls"><button type="button" className="task-visibility" aria-pressed={visible} aria-label={task.title+(visible?' 함께 확인 해제':' 함께 확인하기')} disabled={!connection||!known||action.busy} onClick={toggle}>{visible?<UsersRound size={14}/>:<LockKeyhole size={13}/>}<span>{visible?'함께 확인':'나만 보기'}</span></button>
      {connection&&<button className="text-button public-note-toggle" type="button" aria-expanded={open} disabled={!known||action.busy} onClick={()=>setOpen(value=>!value)}>공개 문장{draft.public_note?' · 작성됨':''}</button>}
    </div>
    {open&&<div className="task-public-note"><DocumentTextarea aria-label={task.title+' 공개 문장'} value={draft.public_note} maxLength={1000} disabled={!known||action.busy} placeholder="상대에게 남길 한 줄 · 선택" onChange={event=>setDraft(previous=>({...previous,public_note:event.target.value}))} onBlur={saving.flush}/><p className="field-hint">{visible?connection?.nickname+'에게 보이는 문장이에요.':'이 할 일을 함께 확인하기로 선택하면 상대에게 보여요.'}</p></div>}
    {(saving.status!=='idle'||action.error)&&<div className="task-sharing-save"><SaveStatus status={saving.status} error={saving.error} retry={saving.retry}/><ErrorMessage error={action.error}/></div>}
  </div>;
}
