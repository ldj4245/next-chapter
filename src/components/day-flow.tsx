'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { parseTask, shiftDay, type Task } from '@/lib/planner';
import { request, useAction } from './api-client';
import { useUnsavedGuard } from './editor';
import { ErrorMessage } from './ui';

export type NextTaskSource={text:string;day:string;key:string};
export function NextTask({source,save,close}:{source:NextTaskSource;save:(task:Task)=>void;close:()=>void}) {
  const [title,setTitle]=useState(source.text.trim().split('\n').find(line=>line.trim())?.slice(0,200)??''),[day,setDay]=useState(source.day<'2100-12-31'?shiftDay(source.day,1):source.day),[created,setCreated]=useState<Task|null>(null);
  const ref=useRef<HTMLInputElement>(null),id=useRef<string|null>(null),action=useAction();
  useUnsavedGuard(!created&&Boolean(title));
  useEffect(()=>{ref.current?.focus();},[]);
  return <div className="next-task-inline" aria-label="기록에서 다음 할 일 만들기">
    {created?<p role="status">할 일을 추가했어요. <Link className="text-button" href={'/?day='+created.day}>계획 보기 <ArrowRight size={14}/></Link><button className="text-button" onClick={close}>닫기</button></p>:<form onSubmit={event=>{event.preventDefault();void action.run(async()=>{
      id.current??=crypto.randomUUID();const input=parseTask({day,title,status:'planned',note:'기록에서 이어온 계획 · '+source.day});
      let result=await request<{task:Task}>('/api/planner/tasks','POST',{id:id.current,...input});
      if(JSON.stringify(parseTask(result.task))!==JSON.stringify(input))result=await request<{task:Task}>('/api/planner/tasks/'+result.task.id,'PATCH',{action:'edit',...input});
      save(result.task);setCreated(result.task);
    });}}><label>다음 할 일<input ref={ref} required aria-label="기록에서 만든 할 일 제목" value={title} maxLength={200} onChange={event=>setTitle(event.target.value)} disabled={action.busy} onKeyDown={event=>{if(event.key==='Enter'&&event.nativeEvent.isComposing)event.preventDefault();}}/></label><label>계획 날짜<input aria-label="다음 할 일 날짜" type="date" min="1900-01-01" max="2100-12-31" required value={day} onChange={event=>setDay(event.target.value)} disabled={action.busy}/></label><button className="document-button secondary" disabled={action.busy||!title.trim()}><Plus size={14}/>{action.busy?'추가 중':'계획에 추가'}</button><button className="text-button" type="button" disabled={action.busy} onClick={close}>닫기</button><p className="field-hint">원래 기록은 그대로 남아요. 실행할 내용을 짧게 정리해보세요.</p><ErrorMessage error={action.error}/></form>}
  </div>;
}
