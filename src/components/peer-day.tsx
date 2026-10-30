'use client';

import { Check, Circle, Minus, RefreshCw, X } from 'lucide-react';
import type { PartnerDay, PartnerState } from '@/lib/partner';
import { dayLabel,TASK_STATES } from '@/lib/planner';
import { usePartnerResource } from './partner';
import { ErrorMessage } from './ui';
import {PhotoStrip} from './task-photos';

function measuredTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (!minutes) return '1분 미만';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? hours + '시간' + (rest ? ' ' + rest + '분' : '') : minutes + '분';
}

export function PeerDay({ day, state }: { day: string; state: PartnerState }) {
  const connection = state.connection;
  const result = usePartnerResource<PartnerDay>(connection ? '/api/partner/day?day=' + encodeURIComponent(day) + '&connection=' + encodeURIComponent(connection.id) : null, true);
  const data = result.data?.connection_id === connection?.id && result.data?.day === day ? result.data : null;
  if (!connection) return <section className="peer-day"><p className="document-empty">현재 연결된 상대가 없어요.</p></section>;
  const completed = data?.activities.filter(activity => activity.status === 'completed').length ?? 0;
  const partial = data?.activities.filter(activity => activity.status === 'partial').length ?? 0;
  return <section className="peer-day" aria-label={connection.nickname + '님의 공유한 하루'}>
    <div className="peer-day-heading"><div><h2>함께 확인하는 할 일</h2>{data && data.activities.length > 0 && <p className="peer-day-summary">{completed > 0 && <span>완료 {completed}</span>}{partial > 0 && <span>일부 진행 {partial}</span>}<span>전체 {data.activities.length}</span></p>}</div><button className="document-icon" type="button" aria-label="상대의 하루 새로고침" onClick={result.refresh}><RefreshCw size={16}/></button></div>
    {result.loading ? <p className="document-empty" role="status">하루를 불러오고 있어요.</p> : result.error ? <div className="peer-day-error"><ErrorMessage error={result.error}/><button className="document-button secondary" type="button" onClick={result.refresh}>다시 불러오기</button></div> : !data ? <p className="document-empty">연결 상태가 바뀌었어요. 내 하루에서 다시 확인해주세요.</p> : data.activities.length === 0 ? <div className="peer-day-empty"><p>이날 함께 확인할 계획은 아직 없어요.</p><span>상대가 공유할 할 일을 선택하면 여기에 보여요.</span></div> : <ul className="peer-activities">{data.activities.map(activity => <li className={'peer-activity peer-activity-' + activity.status} key={activity.id}><span className="peer-state-mark" aria-hidden="true">{activity.status === 'completed' ? <Check size={14}/> : activity.status === 'partial' ? <Minus size={13}/> : activity.status === 'not_done' ? <X size={13}/> : <Circle size={13}/>}</span><div className="peer-activity-copy"><div className="peer-activity-heading"><h3>{activity.title}</h3><span className="peer-state-label">{TASK_STATES[activity.status]}</span></div><div className="peer-activity-meta">{activity.day!==day&&<span>{dayLabel(activity.day,false)} 계획</span>}<span>{activity.measured_seconds === null ? '시간 미측정' : '측정 ' + measuredTime(activity.measured_seconds)}</span>{activity.pages != null && <span>{activity.pages}쪽 읽음</span>}</div>{activity.public_note && <p className="peer-public-note">{activity.public_note}</p>}{Boolean(activity.photos?.length)&&<PhotoStrip photos={activity.photos??[]} label={activity.title}/>}</div></li>)}</ul>}
    {data && <p className="peer-day-footnote">선택해 공유한 항목만 30초마다 갱신해요. 시간은 이날 마친 타이머 기록이에요.</p>}
  </section>;
}
