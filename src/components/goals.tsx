'use client';
import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { GOAL_PERIODS, GOAL_STATES, REASONS, TASK_STATES, dayLabel, goalTaskIds, parseGoal, type Goal, type GoalInput, type GoalsData } from '@/lib/planner';
import { request, useAction, useResource } from './api-client';
import { DocumentTextarea, SaveStatus, useDocumentSave, useUnsavedGuard } from './editor';
import { ConfirmDialog, ErrorMessage, Loading, ResourceError } from './ui';
import { hasReflectionContent } from '@/lib/reflection';
import { ReflectionContent } from './reflection';
import { GOAL_METRIC_UNITS, goalAmount, goalProgress, type GoalMetricUnit } from '@/lib/goal-metrics';

const blankGoal: GoalInput = { title: '', period: 'short', status: 'active', motivation: '', target_day: null, parent_id: null, metric_unit: null, metric_target: null, metric_start_day: null };

export function Goals() {
  const resource = useResource<GoalsData>('/api/goals');
  if (resource.loading) return <Loading />;
  if (resource.error) return <ResourceError error={resource.error} retry={resource.refresh} />;
  return resource.data ? <GoalsBody initial={resource.data} /> : null;
}

function GoalsBody({ initial }: { initial: GoalsData }) {
  const [data, setData] = useState(initial);
  const [removing, setRemoving] = useState<Goal | null>(null);
  const [notice, setNotice] = useState('');
  const deletion = useAction();
  function save(goal: Goal) {
    setData(previous => ({
      ...previous,
      goals: previous.goals.some(item => item.id === goal.id)
        ? previous.goals.map(item => item.id === goal.id ? goal : item)
        : [...previous.goals, goal],
    }));
  }
  return <div className="document-page goals-document planner-goals">
    <header className="document-header">
      <p className="document-kicker">단기 · 장기</p>
      <h1 className="document-title">목표</h1>
      <div className="document-toolbar">
        <span>{data.goals.length}개의 목표</span>
        <Link className="text-button" href="/">오늘의 계획 <ArrowRight size={15} /></Link>
      </div>
    </header>
    {notice && <p className="document-notice" role="status">{notice}<button className="text-button" onClick={() => setNotice('')}>닫기</button></p>}
    <div className="goal-document-list">
      {data.goals.map(goal => <GoalRow key={goal.id} goal={goal} data={data} enabled={removing?.id !== goal.id} save={save} remove={() => setRemoving(goal)} />)}
    </div>
    {!data.goals.length && <p className="document-empty">첫 목표를 아래에 적어보세요.</p>}
    <GoalComposer goals={data.goals} save={save} />
    {removing && <ConfirmDialog title="이 목표를 삭제할까요?" description="하루의 할 일과 회고는 남아요. 연결된 할 일과 단기 목표의 연결만 해제돼요." busy={deletion.busy} error={deletion.error} cancel={() => setRemoving(null)} confirm={() => deletion.run(async () => {
      await request('/api/goals/' + removing.id, 'DELETE');
      setData(previous => ({
        ...previous,
        goals: previous.goals.filter(goal => goal.id !== removing.id).map(goal => goal.parent_id === removing.id ? { ...goal, parent_id: null } : goal),
        tasks: previous.tasks.map(task => task.goal_id === removing.id ? { ...task, goal_id: null } : task),
      }));
      setRemoving(null);
      setNotice('목표를 삭제했어요.');
    })} />}
  </div>;
}

function GoalComposer({ goals, save }: { goals: Goal[]; save: (goal: Goal) => void }) {
  const [draft, setDraft] = useState<GoalInput>(blankGoal);
  const id = useRef<string | null>(null);
  const title = useRef<HTMLInputElement>(null);
  const action = useAction();
  useUnsavedGuard(JSON.stringify(draft) !== JSON.stringify(blankGoal));
  function update<K extends keyof GoalInput>(field: K, value: GoalInput[K]) {
    setDraft(previous => ({ ...previous, [field]: value }));
  }
  return <form className="goal-composer" onSubmit={event => {
    event.preventDefault();
    void action.run(async () => {
      const input = parseGoal(draft);
      id.current ??= crypto.randomUUID();
      let result = await request<{ goal: Goal }>('/api/goals', 'POST', { id: id.current, ...input });
      // A retry may find the goal created by a response that never reached us.
      // Preserve edits made since that request instead of clearing newer input.
      if (JSON.stringify(parseGoal(result.goal)) !== JSON.stringify(input)) {
        result = await request<{ goal: Goal }>('/api/goals/' + id.current, 'PATCH', input);
      }
      save(result.goal);
      setDraft(blankGoal);
      id.current = null;
      requestAnimationFrame(() => title.current?.focus());
    });
  }}>
    <div className="goal-document-heading">
      <Plus size={18} aria-hidden="true" />
      <input ref={title} className="goal-composer-title" name="title" aria-label="새 목표 제목" maxLength={160} required value={draft.title} disabled={action.busy} onChange={event => update('title', event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} placeholder="새 목표를 적고 Enter" />
      <button className="document-button goal-composer-submit" disabled={action.busy || !draft.title.trim()}>{action.busy ? '추가 중' : '추가'}</button>
    </div>
    <details className="goal-composer-options">
      <summary>기간 · 날짜 · 측정 기준 · 메모</summary>
      <fieldset disabled={action.busy}>
        <div className="goal-document-properties">
          <label className="goal-document-property">기간<select value={draft.period} onChange={event => setDraft(previous => ({ ...previous, period: event.target.value as Goal['period'], parent_id: null }))}>{Object.entries(GOAL_PERIODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="goal-document-property">목표 날짜<input type="date" min="1900-01-01" max="2100-12-31" value={draft.target_day ?? ''} onChange={event => update('target_day', event.target.value || null)} /></label>
          {draft.period === 'short' && <label className="goal-document-property">장기 목표<select value={draft.parent_id ?? ''} onChange={event => update('parent_id', event.target.value || null)}><option value="">연결 없음</option>{goals.filter(goal => goal.period === 'long').map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>}
        </div>
        <GoalMetricFields value={draft} update={update} />
        <DocumentTextarea className="goal-document-motivation" aria-label="새 목표 메모" rows={2} maxLength={3000} value={draft.motivation} onChange={event => update('motivation', event.target.value)} placeholder="얻고 싶은 것, 중요한 이유를 적어두세요." />
      </fieldset>
    </details>
    <ErrorMessage error={action.error} />
  </form>;
}

function GoalRow({ goal, data, enabled, save, remove }: { goal: Goal; data: GoalsData; enabled: boolean; save: (goal: Goal) => void; remove: () => void }) {
  const headingId = useId();
  const [draft, setDraft] = useState<GoalInput>(() => parseGoal(goal));
  const hasChildren = data.goals.some(child => child.parent_id === goal.id);
  const parentId = draft.parent_id && data.goals.some(item => item.id === draft.parent_id && item.period === 'long') ? draft.parent_id : null;
  const value = useMemo(() => ({ ...draft, parent_id: draft.period === 'short' ? parentId : null }), [draft, parentId]);
  const saving = useDocumentSave<GoalInput>({ value, enabled, persist: async snapshot => {
    const input = parseGoal(snapshot);
    const result = await request<{ goal: Goal }>('/api/goals/' + goal.id, 'PATCH', input);
    save(result.goal);
  } });
  useUnsavedGuard(saving.dirty, saving.saveNow);
  function update<K extends keyof GoalInput>(field: K, next: GoalInput[K]) {
    setDraft(previous => ({ ...previous, [field]: next }));
  }
  return <article id={'goal-' + goal.id} className="goal-document-row" aria-labelledby={headingId}>
    <h2 id={headingId} className="sr-only">{draft.title || '제목 없는 목표'}</h2>
    <div className="goal-document-heading">
      <DocumentTextarea className="goal-document-title" rows={1} aria-label="목표 제목" value={draft.title} maxLength={160} onChange={event => update('title', event.target.value)} onBlur={saving.flush} onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); saving.flush(); event.currentTarget.blur(); }
      }} placeholder="목표 제목" />
      <button className="document-icon planner-icon" aria-label={draft.title + ' 삭제'} disabled={saving.status === 'saving'} onClick={remove}><Trash2 size={16} /></button>
    </div>
    <div className="goal-document-properties">
      <label className="goal-document-property">기간<select value={draft.period} disabled={hasChildren} onBlur={saving.flush} onChange={event => setDraft(previous => ({ ...previous, period: event.target.value as Goal['period'], parent_id: null }))}>{Object.entries(GOAL_PERIODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="goal-document-property">상태<select value={draft.status} onBlur={saving.flush} onChange={event => update('status', event.target.value as Goal['status'])}>{Object.entries(GOAL_STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="goal-document-property">목표 날짜<input type="date" min="1900-01-01" max="2100-12-31" value={draft.target_day ?? ''} onChange={event => update('target_day', event.target.value || null)} onBlur={saving.flush} /></label>
      {draft.period === 'short' && <label className="goal-document-property">장기 목표<select value={parentId ?? ''} onChange={event => update('parent_id', event.target.value || null)} onBlur={saving.flush}><option value="">연결 없음</option>{data.goals.filter(item => item.period === 'long' && item.id !== goal.id).map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}
    </div>
    {hasChildren && <p className="field-hint">연결된 단기 목표를 분리하면 기간을 바꿀 수 있어요.</p>}
    <GoalMeasurement goal={{ ...goal, ...value }} data={data} />
    <details className="goal-metric-options">
      <summary>{draft.metric_unit ? '측정 기준 바꾸기' : '측정 기준 추가'}</summary>
      <GoalMetricFields value={draft} update={update} flush={saving.flush} />
      <p className="field-hint">연결된 할 일의 완료 횟수와 저장한 집중 기록을 합산해요. 장기 목표에는 연결된 단기 목표의 기록도 포함돼요.</p>
    </details>
    <DocumentTextarea className="goal-document-motivation" aria-label="목표 메모" rows={2} maxLength={3000} value={draft.motivation} onChange={event => update('motivation', event.target.value)} onBlur={saving.flush} placeholder="얻고 싶은 것, 중요한 이유를 적어두세요." />
    <div className="goal-document-footer">
      <SaveStatus status={saving.status} error={saving.error} retry={saving.retry} />
      <Link className="text-button" href={'/?goal=' + goal.id}>오늘 할 일에 연결 <ArrowRight size={14} /></Link>
    </div>
    <GoalHistory goal={goal} data={data} />
  </article>;
}

function GoalMetricFields({ value, update, flush }: { value: GoalInput; update: <K extends keyof GoalInput>(field: K, next: GoalInput[K]) => void; flush?: () => void }) {
  function setUnit(unit: GoalMetricUnit | null) {
    update('metric_unit', unit);
    update('metric_target', null);
    if (unit === null) update('metric_start_day', null);
  }
  return <div className="goal-document-properties goal-metric-fields">
    <label className="goal-document-property">측정 기준<select aria-label="목표 측정 기준" value={value.metric_unit ?? ''} onBlur={flush} onChange={event => setUnit(event.target.value as GoalMetricUnit || null)}><option value="">측정 안 함</option>{Object.entries(GOAL_METRIC_UNITS).map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}</select></label>
    {value.metric_unit && <>
      <label className="goal-document-property">목표량<span className="goal-metric-target-input"><input type="number" inputMode="numeric" min={1} max={10000000} step={1} aria-label="목표량" value={value.metric_target ?? ''} onBlur={flush} onChange={event => update('metric_target', event.target.value === '' ? null : Number(event.target.value))} placeholder="선택 사항" /><span>{value.metric_unit === 'minutes' ? '분' : value.metric_unit === 'tasks' ? '개' : '쪽'}</span></span></label>
      <label className="goal-document-property">시작 날짜<input type="date" aria-label="목표 측정 시작 날짜" min="1900-01-01" max={value.target_day ?? '2100-12-31'} value={value.metric_start_day ?? ''} onBlur={flush} onChange={event => update('metric_start_day', event.target.value || null)} /></label>
    </>}
  </div>;
}

function GoalMeasurement({ goal, data }: { goal: Goal; data: GoalsData }) {
  const progress = goalProgress(goal, data.goals, data.tasks, data.sessions ?? []);
  if (!progress.unit) return null;
  return <div className="goal-measurement">
    <p><span>{GOAL_METRIC_UNITS[progress.unit]}</span><span className="goal-measurement-amount">{goalAmount(progress.unit, progress.current)}{progress.target !== null && <span> / {goalAmount(progress.unit, progress.target)}</span>}</span></p>
    {progress.percent !== null && <div className="goal-measurement-track" role="progressbar" aria-label={goal.title + ' 진행률'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress.percent)} aria-valuetext={`${goalAmount(progress.unit, progress.current)} / ${goalAmount(progress.unit, progress.target!)}`}><span style={{ width: progress.percent + '%' }} /></div>}
    {(goal.metric_start_day || goal.target_day) && <small>{goal.metric_start_day ? dayLabel(goal.metric_start_day, false) : '전체 기록'}{goal.target_day ? ' ~ ' + dayLabel(goal.target_day, false) : '부터'}</small>}
  </div>;
}

function GoalHistory({ goal, data }: { goal: Goal; data: GoalsData }) {
  const [limit, setLimit] = useState(8);
  const ids = goalTaskIds(data.goals, goal.id);
  const tasks = data.tasks.filter(task => task.goal_id && ids.has(task.goal_id));
  const children = data.goals.filter(item => item.parent_id === goal.id);
  const completed = tasks.filter(task => task.status === 'completed').length;
  const days = new Set(tasks.map(task => task.day));
  const reviews = data.reviews.filter(review => days.has(review.day) && hasReflectionContent(review));
  const reviewFields = { helped: '도움이 된 점', hindered: '어려웠던 점', gained: '얻은 것', next_step: '다음에 해볼 것' } as const;
  return <details className="goal-history">
    <summary>실행 기록 {tasks.length}개 · 완료 {completed}개</summary>
    {children.length > 0 && <div className="goal-children"><h3>연결된 단기 목표</h3>{children.map(child => <p key={child.id}>{child.title}<small>{GOAL_STATES[child.status]}</small></p>)}</div>}
    {tasks.length ? <><ul>{tasks.slice(0, limit).map(task => <li key={task.id}>
      <Link href={'/?day=' + task.day}><time>{dayLabel(task.day, false)}</time><strong>{task.title}</strong><span className={'history-state state-' + task.status}>{TASK_STATES[task.status]}</span></Link>
      {(task.reason || task.reason_detail) && <p className="field-hint preserve-text">{task.reason && REASONS[task.reason]}{task.reason && task.reason_detail ? ' · ' : ''}{task.reason_detail}</p>}
      {task.note && <p className="field-hint preserve-text">{task.note}</p>}
    </li>)}</ul></> : <p className="muted">연결된 하루 할 일이 없어요.</p>}
    {reviews.length > 0 && <div className="goal-review-list"><h3>하루 회고</h3><p className="field-hint">이 목표와 연결된 날의 전체 회고예요.</p>{reviews.slice(0, limit).map(review => <article key={review.day}>
      <Link className="text-button" href={'/?day=' + review.day + '#daily-review-title'}>{dayLabel(review.day, false)} <ArrowRight size={14} /></Link>
      {review.document ? <ReflectionContent document={review.document}/> : <dl>{Object.entries(reviewFields).map(([field, label]) => review[field as keyof typeof reviewFields] ? <div key={field}><dt>{label}</dt><dd className="preserve-text">{review[field as keyof typeof reviewFields]}</dd></div> : null)}</dl>}
    </article>)}</div>}
    {(tasks.length > limit || reviews.length > limit) && <button className="text-button" onClick={() => setLimit(previous => previous + 8)}>기록 더 보기</button>}
  </details>;
}
