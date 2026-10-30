'use client';
import { useId,useState } from 'react';
import Link from 'next/link';
import { parseBatchPlanning } from '@/lib/batch-planning';
import { shiftDay,type PlanData,type Task } from '@/lib/planner';
import { request,useAction } from './api-client';
import { prepareDocumentNavigation,useUnsavedGuard } from './editor';
import { ErrorMessage } from './ui';
export function BatchPlanning({data,onApplied}:{data:PlanData;onApplied:(task:Task,carried:Task)=>void}){
  const id=useId(),action=useAction(),[selected,setSelected]=useState<string[]>([]),[day,setDay]=useState(data.day<'2100-12-31'?shiftDay(data.day,1):data.day),[notice,setNotice]=useState('');
  const candidates=data.tasks.filter(task=>task.status!=='completed'&&!data.carried.some(item=>item.carried_from_id===task.id));
  const validSelected=selected.filter(id=>candidates.some(task=>task.id===id));
  useUnsavedGuard(validSelected.length>0||action.busy);
  if(!candidates.length&& !notice)return null;
  return <details className="batch-planning"><summary>남은 할 일 정리</summary><form onSubmit={event=>{event.preventDefault();void action.run(async()=>{
    if(!await prepareDocumentNavigation({preserveDrafts:true}))return;
    const input=parseBatchPlanning({ids:validSelected,day,source_day:data.day}),result=await request<{items:{task:Task;carried:Task}[]}>('/api/planner/tasks/batch','POST',input);
    for(const item of result.items)onApplied(item.task,item.carried);setSelected([]);setNotice(result.items.length+'개를 '+day+' 계획으로 이어갔어요.');
  });}}><p>선택한 할 일을 다른 날짜로 이어가요. 원래 날짜의 메모와 실행 기록은 남아요.</p><fieldset disabled={action.busy} aria-label="이어갈 할 일">{candidates.map(task=><label className="batch-task-option" key={task.id}><input type="checkbox" checked={selected.includes(task.id)} onChange={event=>{setSelected(ids=>event.target.checked?[...ids,task.id]:ids.filter(value=>value!==task.id));setNotice('');}}/><span>{task.title}</span></label>)}</fieldset><div className="batch-controls"><label htmlFor={id}>이어갈 날짜</label><input id={id} type="date" min={data.day<'2100-12-31'?shiftDay(data.day,1):data.day} max="2100-12-31" value={day} disabled={action.busy} onChange={event=>setDay(event.target.value)}/><button className="document-button secondary" disabled={action.busy||!validSelected.length||data.day==='2100-12-31'}>{action.busy?'이어가는 중…':validSelected.length?validSelected.length+'개 이어가기':'할 일을 선택해주세요'}</button></div><ErrorMessage error={action.error}/>{notice&&<p className="batch-notice" role="status">{notice} <Link href={'/?day='+day}>그날 계획 보기</Link></p>}</form></details>;
}
