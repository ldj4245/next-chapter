'use client';
import { useRef, useState } from 'react';
import { ChevronRight, Pause, Play, Plus, Repeat2, Trash2 } from 'lucide-react';
import type { Goal, WorkOption } from '@/lib/planner';
import { plannerDay } from '@/lib/planner';
import { parseRoutine, routineWeekday, WEEKDAYS, type Routine, type RoutineInput } from '@/lib/recurrence';
import { request, useAction, useResource } from './api-client';
import { DocumentTextarea, SaveStatus, useDocumentSave, useUnsavedGuard } from './editor';
import { ErrorMessage } from './ui';

type Props = { day: string; goals: Goal[]; works: WorkOption[]; onApplied: () => Promise<void> };
type RoutineDraft = Omit<RoutineInput, 'minutes'> & { minutes: string };
const blank = (day: string): RoutineDraft => ({ title: '', weekdays: [routineWeekday(day)], start_day: day, end_day: null,
  active: true, minutes: '', important: false, goal_id: null, work_id: null, note: '' });
const draftOf = (routine: RoutineInput): RoutineDraft => ({ ...routine, minutes: routine.minutes == null ? '' : String(routine.minutes) });

export function Routines(props: Props) {
  const resource = useResource<{ routines: Routine[] }>('/api/planner/routines');
  return <details className="routine-section document-section">
    <summary className="routine-section-heading"><Repeat2 size={17} aria-hidden="true"/><span>반복 계획</span><ChevronRight className="routine-chevron" size={16} aria-hidden="true"/></summary>
    <p className="routine-description">매번 하는 일은 정한 요일의 할 일에 담겨요. 그날의 계획은 따로 수정할 수 있어요.</p>
    {resource.loading ? <p className="routine-loading" role="status">반복 계획을 불러오는 중…</p> : resource.error ? <div className="routine-error"><ErrorMessage error={resource.error}/><button className="text-button" onClick={resource.refresh}>다시 불러오기</button></div> :
      resource.data && <RoutineList {...props} initial={resource.data.routines}/>}
  </details>;
}

function RoutineList({ initial, ...props }: Props & { initial: Routine[] }) {
  const [routines, setRoutines] = useState(initial);
  function saved(routine: Routine) { setRoutines(previous => previous.some(item => item.id === routine.id) ? previous.map(item => item.id === routine.id ? routine : item) : [...previous, routine]); }
  async function apply(input: RoutineInput) {
    if (input.active && props.day >= plannerDay()) {
      await request('/api/planner/routines/apply', 'POST', { day: props.day });
      await props.onApplied();
    }
  }
  return <div className="routine-document">
    <ul className="routine-lines">{routines.map(routine => <RoutineLine key={routine.id} routine={routine} {...props} saved={saved} apply={apply} removed={() => setRoutines(previous => previous.filter(item => item.id !== routine.id))}/>)}</ul>
    <RoutineComposer {...props} saved={saved} apply={apply}/>
  </div>;
}

function RoutineComposer({ day, goals, works, saved, apply }: Props & { saved: (routine: Routine) => void; apply: (input: RoutineInput) => Promise<void> }) {
  const [draft, setDraft] = useState<RoutineDraft>(() => blank(day)), id = useRef<string | null>(null), title = useRef<HTMLInputElement>(null), action = useAction();
  useUnsavedGuard(JSON.stringify(draft) !== JSON.stringify(blank(day)));
  function update<K extends keyof RoutineDraft>(field: K, value: RoutineDraft[K]) { setDraft(previous => ({ ...previous, [field]: value })); }
  return <form className="routine-composer" onSubmit={event => {
    event.preventDefault();
    void action.run(async () => {
      const input = parseRoutine(draft); id.current ??= crypto.randomUUID();
      let result = await request<{ routine: Routine }>('/api/planner/routines', 'POST', { id: id.current, ...input });
      if (JSON.stringify(parseRoutine(result.routine)) !== JSON.stringify(input)) result = await request<{ routine: Routine }>('/api/planner/routines/' + result.routine.id, 'PATCH', input);
      // Complete generation before clearing the draft; a failed response can retry the same ID.
      await apply(input); saved(result.routine); setDraft(blank(day)); id.current = null;
      requestAnimationFrame(() => title.current?.focus());
    });
  }}>
    <fieldset disabled={action.busy}>
      <div className="routine-title-line"><Plus size={18} aria-hidden="true"/><input ref={title} className="routine-title-input" aria-label="새 반복 계획" value={draft.title} maxLength={200} required placeholder="매번 하는 일을 적어보세요" onChange={event => update('title', event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}/><button className="document-button" disabled={!draft.title.trim()}>{action.busy ? '추가 중' : '추가'}</button></div>
      <WeekdayFields weekdays={draft.weekdays} name="새 반복 계획" update={weekdays => update('weekdays', weekdays)}/>
      <details className="routine-options"><summary>기간 · 목표 · 시간 · 메모</summary><RoutineProperties draft={draft} goals={goals} works={works} update={update}/></details>
    </fieldset>
    <ErrorMessage error={action.error}/>
  </form>;
}

function RoutineLine({ routine, goals, works, saved, apply, removed, onApplied }: Props & { routine: Routine; saved: (routine: Routine) => void; apply: (input: RoutineInput) => Promise<void>; removed: () => void }) {
  const [draft, setDraft] = useState<RoutineDraft>(() => draftOf(routine)), [confirm, setConfirm] = useState(false), [deletedOnServer, setDeletedOnServer] = useState(false), action = useAction(), deleted = useRef(false);
  const value = { ...draft, goal_id: draft.goal_id && goals.some(goal => goal.id === draft.goal_id) ? draft.goal_id : null,
    work_id: draft.work_id && works.some(work => work.id === draft.work_id) ? draft.work_id : null };
  const saving = useDocumentSave({ value, persist: async snapshot => {
    const input = parseRoutine(snapshot);
    const result = await request<{ routine: Routine }>('/api/planner/routines/' + routine.id, 'PATCH', input);
    await apply(input); saved(result.routine);
  } });
  useUnsavedGuard(saving.dirty, saving.saveNow);
  function update<K extends keyof RoutineDraft>(field: K, next: RoutineDraft[K]) { setDraft(previous => ({ ...previous, [field]: next })); }
  async function flush() { if (!await saving.saveNow()) throw new Error('작성한 내용을 먼저 저장해주세요. 입력은 그대로 남아 있어요.'); }
  return <li className={'routine-line' + (draft.active ? '' : ' routine-paused')}>
    <fieldset disabled={action.busy || confirm}>
      <div className="routine-title-line"><DocumentTextarea className="routine-title-input" aria-label="반복 계획 제목" value={draft.title} maxLength={200} onChange={event => update('title', event.target.value)} onBlur={saving.flush} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); saving.flush(); event.currentTarget.blur(); } }}/></div>
      <WeekdayFields weekdays={draft.weekdays} name={draft.title || '반복 계획'} update={weekdays => update('weekdays', weekdays)} flush={saving.flush}/>
      <details className="routine-options"><summary>기간 · 목표 · 시간 · 메모{draft.minutes ? ' · ' + draft.minutes + '분' : ''}</summary><RoutineProperties draft={value} goals={goals} works={works} update={update} flush={saving.flush}/></details>
    </fieldset>
    <div className="routine-footer">
      <span className="routine-state">{draft.active ? '반복 중' : '잠시 멈춤'}</span>
      <SaveStatus status={saving.status} error={saving.error} retry={saving.retry}/>
      <div className="routine-actions"><button type="button" className="text-button" disabled={action.busy || confirm} onClick={() => action.run(async () => {
        await flush();
        const next = { ...value, active: !draft.active }, input = parseRoutine(next);
        const result = await request<{ routine: Routine }>('/api/planner/routines/' + routine.id, 'PATCH', input);
        setDraft(next); saved(result.routine);
        await apply(input); saving.acknowledge(next);
      })}>{draft.active ? <Pause size={14} aria-hidden="true"/> : <Play size={14} aria-hidden="true"/>}{draft.active ? '멈추기' : '다시 시작'}</button>
      <button type="button" className="planner-icon" aria-label={(draft.title || '반복 계획') + ' 반복 삭제'} disabled={action.busy || confirm} onClick={() => action.run(async () => { await flush(); setConfirm(true); })}><Trash2 size={15}/></button></div>
    </div>
    {confirm && <div className="routine-delete-confirm"><p>{deletedOnServer ? '반복 계획은 삭제됐어요. 목록을 다시 불러오면 마무리돼요.' : '반복 계획을 삭제할까요? 이미 담긴 할 일과 기록은 남아요.'}</p><div>{!deletedOnServer && <button type="button" className="text-button" disabled={action.busy} onClick={() => setConfirm(false)}>취소</button>}<button type="button" className="text-button" disabled={action.busy} onClick={() => action.run(async () => {
      await flush();
      if (!deleted.current) { await request('/api/planner/routines/' + routine.id, 'DELETE'); deleted.current = true; setDeletedOnServer(true); }
      await onApplied(); removed();
    })}>{action.busy ? '처리 중' : deletedOnServer ? '다시 불러오기' : '반복 삭제'}</button></div></div>}
    <ErrorMessage error={action.error}/>
  </li>;
}

function WeekdayFields({ weekdays, name, update, flush }: { weekdays: number[]; name: string; update: (weekdays: number[]) => void; flush?: () => void }) {
  return <div className="routine-weekdays" role="group" aria-label={name + ' 반복 요일'}>{Object.entries(WEEKDAYS).map(([key, label]) => {
    const day = Number(key), selected = weekdays.includes(day);
    return <button type="button" key={day} aria-label={label + '요일'} aria-pressed={selected} onBlur={flush} onClick={() => update(selected ? weekdays.filter(value => value !== day) : [...weekdays, day].sort((a, b) => a - b))}>{label}</button>;
  })}</div>;
}

function RoutineProperties({ draft, goals, works, update, flush }: { draft: RoutineDraft; goals: Goal[]; works: WorkOption[]; update: <K extends keyof RoutineDraft>(field: K, value: RoutineDraft[K]) => void; flush?: () => void }) {
  return <div className="routine-properties">
    <div className="routine-property-row">
      <label>시작일<input type="date" min="1900-01-01" max="2100-12-31" value={draft.start_day} onChange={event => update('start_day', event.target.value)} onBlur={flush}/></label>
      <label>종료일<input type="date" min={draft.start_day || '1900-01-01'} max="2100-12-31" value={draft.end_day ?? ''} onChange={event => update('end_day', event.target.value || null)} onBlur={flush}/></label>
    </div>
    <div className="routine-property-row">
      <label>목표<select value={draft.goal_id ?? ''} onChange={event => update('goal_id', event.target.value || null)} onBlur={flush}><option value="">연결 없음</option>{goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
      <label>작품<select value={draft.work_id ?? ''} onChange={event => update('work_id', event.target.value || null)} onBlur={flush}><option value="">연결 없음</option>{works.map(work => <option key={work.id} value={work.id}>{work.title}</option>)}</select></label>
      <label>예상 시간 (분)<input type="number" inputMode="numeric" min={1} max={1440} step={1} value={draft.minutes} placeholder="선택" onChange={event => update('minutes', event.target.value)} onBlur={flush}/></label>
      <label className="routine-important"><input type="checkbox" checked={draft.important} onChange={event => update('important', event.target.checked)} onBlur={flush}/>중요</label>
    </div>
    <DocumentTextarea aria-label="반복 계획 메모" maxLength={2000} value={draft.note} placeholder="매번 참고할 메모" onChange={event => update('note', event.target.value)} onBlur={flush}/>
  </div>;
}
