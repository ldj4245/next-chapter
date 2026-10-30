'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, RefreshCw } from 'lucide-react';
import { durationLabel, executionSummary, type WeekReflection } from '@/lib/day-flow';
import { type WeekData } from '@/lib/goal-metrics';
import { dayLabel, emptyReview, plannerWeek,REASONS, TASK_STATES, type DayReview } from '@/lib/planner';
import { hasReflectionContent, reflectionOf } from '@/lib/reflection';
import { request, useResource } from './api-client';
import { prepareDocumentNavigation } from './editor';
import { Reflection, ReflectionContent } from './reflection';
import { ErrorMessage } from './ui';

export function WeeklyReview({day,onTask}:{day:string;onTask:(text:string,day:string)=>void}) {
  const [open,setOpen]=useState(false);
  const anchor='week-review-'+plannerWeek(day)[0];
  useEffect(()=>{const reveal=()=>{if(window.location.hash==='#'+anchor)setOpen(true);};const timer=setTimeout(reveal,0);window.addEventListener('hashchange',reveal);return()=>{clearTimeout(timer);window.removeEventListener('hashchange',reveal);};},[anchor]);
  return <section id={anchor} className="weekly-document"><button className="weekly-toggle" aria-expanded={open} onClick={async()=>{if(!open||await prepareDocumentNavigation())setOpen(value=>!value);}}>이번 주 돌아보기 <ChevronDown size={15} className={open?'rotated':''}/></button>{open&&<WeeklyLoader day={day} onTask={onTask}/>}</section>;
}
function WeeklyLoader({day,onTask}:{day:string;onTask:(text:string,day:string)=>void}) {
  const data=useResource<WeekData>('/api/planner/week?day='+day),review=useResource<{review:WeekReflection|null}>('/api/planner/week-review?day='+day);
  if(data.error||review.error)return <div className="flow-error"><ErrorMessage error={data.error||review.error}/><button className="text-button" onClick={()=>{data.refresh();review.refresh();}}>다시 읽기</button></div>;
  if(!data.data||!review.data)return <p className="field-hint" role="status">이번 주 기록을 읽는 중…</p>;
  return <WeeklyBody data={data.data} initialReview={review.data.review} onTask={onTask}/>;
}
export function WeeklyBody({data,initialReview,onTask}:{data:WeekData;initialReview:WeekReflection|null;onTask:(text:string,day:string)=>void}) {
  const [snapshot,setSnapshot]=useState(data),[review,setReview]=useState<DayReview|null>(initialReview?{...emptyReview,...initialReview}:null),[error,setError]=useState('');
  const summary=executionSummary(snapshot.tasks,snapshot.sessions);
  async function refresh() {
    if(!await prepareDocumentNavigation())return;
    try{const result=await request<WeekData>('/api/planner/week?day='+snapshot.week[0]);setSnapshot(result);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'기록을 다시 읽지 못했어요.');}
  }
  return <div className="weekly-content">
    <div className="weekly-caption"><span>{dayLabel(snapshot.week[0],false)} — {dayLabel(snapshot.week[6],false)}</span><button className="planner-icon" onClick={refresh} aria-label="이번 주 실행 기록 새로 읽기"><RefreshCw size={14}/></button></div>
    <p className="weekly-overview">계획 {summary.total}개 · 완료 {summary.completed}개 · 실행 {durationLabel(summary.seconds)}</p>
    <div className="week-execution-lines">{snapshot.week.filter(date=>date>='1900-01-01'&&date<='2100-12-31').map(date=>{
      const tasks=snapshot.tasks.filter(task=>task.day===date),sessions=snapshot.sessions.filter(session=>session.reading_day===date),daily=snapshot.reviews.find(item=>item.day===date),seconds=sessions.reduce((sum,entry)=>sum+entry.elapsed_seconds,0);
      return <details key={date}><summary><time>{dayLabel(date)}</time><span>{tasks.length?tasks.filter(task=>task.status==='completed').length+'/'+tasks.length:'계획 없음'}</span><span>{seconds?durationLabel(seconds):'—'}</span></summary><div className="week-day-detail"><ul>{tasks.map(task=><li key={task.id}><span>{task.title}</span><small>{TASK_STATES[task.status]}</small></li>)}</ul>{sessions.filter(session=>session.memo).map(session=><p className="preserve-text" key={session.id}>{session.memo}</p>)}{daily&&hasReflectionContent(daily)&&<ReflectionContent document={reflectionOf(daily)}/>}<Link className="text-button" href={'/?day='+date}>그날 기록 열기 <ArrowRight size={14}/></Link></div></details>;
    })}</div>
    {summary.reasons.length>0&&<p className="weekly-reasons">기록한 어려움 · {summary.reasons.map(([reason,count])=>REASONS[reason as keyof typeof REASONS]+' '+count+'회').join(' / ')}</p>}
    <Reflection day={snapshot.week[0]} review={review} endpoint="/api/planner/week-review" title="이번 주에 남기고 싶은 것" headingId="weekly-review-title" save={setReview} onTask={(text)=>onTask(text,snapshot.week[6])}/>
    <ErrorMessage error={error}/>
  </div>;
}
