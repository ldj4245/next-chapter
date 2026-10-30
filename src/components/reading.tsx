'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, Check, CheckCheck, Clock3, Pause, Play, Plus, Quote, Settings2, X } from 'lucide-react';
import { STATUSES, type Note, type Work } from '@/lib/domain';
import { defaultPreferences, elapsedSeconds, parsePreferences, parseReadingDetails, readingDay, READING_GOAL_SECONDS, remainingClock, reminderCalendar, type ReadingData, type ReadingPreferences, type ReadingSession } from '@/lib/reading';
import { request, useAction, useResource } from './api-client';
import { ConfirmDialog, Cover, ErrorMessage, Loading, ResourceError, useModal, closeOnBackdrop } from './ui';
import { CatalogExplorer } from './catalog';
import { type FocusSession } from '@/lib/focus';

type SessionResponse = { session: ReadingSession | null; server_now: string };
export function ReadingHome() {
  const resource = useResource<ReadingData>('/api/reading');
  const [notice, setNotice] = useState('');
  return <>{notice && <p className="reading-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}<button className="notice-close" aria-label="저장 안내 닫기" onClick={() => setNotice('')}><X size={17}/></button></p>}{resource.loading ? <Loading/> : resource.error ? <ResourceError error={resource.error} retry={resource.refresh}/> : resource.data && <ReadingDashboard key={resource.data.server_now} data={resource.data} refresh={resource.refresh} notify={setNotice}/>}</>;
}
function ReadingDashboard({ data, refresh, notify }: { data: ReadingData; refresh: () => void; notify: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<SessionResponse>({ session: data.session, server_now: data.server_now });
  const [preferences, setPreferences] = useState(data.preferences);
  const [completed, setCompleted] = useState(data.completed);
  const [settings, setSettings] = useState(false), [canceling, setCanceling] = useState(false);
  const [pending, setPending] = useState<'start' | 'pause' | 'resume' | 'complete' | 'cancel' | null>(null);
  const action = useAction(), startId = useRef<string | null>(null);
  const eligible = data.books.filter(book => book.status === 'active' || book.status === 'planned');
  const book = eligible.find(book => book.id === preferences.work_id) ?? eligible.find(book => book.status === 'active') ?? eligible[0];
  const session = snapshot.session;
  const active = session?.status === 'active';
  const currentBook = data.books.find(book => book.id === session?.work_id);
  const displayedWorkId = session ? session.work_id : book?.id;
  const days = new Set(completed.map(entry => entry.reading_day));
  const minutes = Math.floor(completed.reduce((sum, entry) => sum + entry.elapsed_seconds, 0) / 60);
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(data.today + 'T12:00:00+09:00'));
  async function start() {
    if (!book) return;
    setPending('start'); notify('');
    startId.current ??= crypto.randomUUID();
    const result = await request<SessionResponse>('/api/reading', 'POST', { id: startId.current, work_id: book.id });
    if ((result.session as FocusSession | null)?.task_title) { startId.current = null; refresh(); return; }
    setSnapshot(result); startId.current = null;
    if (readingDay(result.server_now) !== data.today) refresh();
  }
  async function change(kind: 'pause' | 'resume' | 'complete' | 'cancel') {
    if (!session) return;
    setPending(kind); notify('');
    const result = await request<SessionResponse>('/api/reading/' + session.id, 'PATCH', { action: kind });
    setSnapshot(result);
    if (kind === 'complete' && result.session) setCompleted(entries => [result.session!, ...entries.filter(entry => entry.id !== result.session!.id)]);
    if (kind === 'cancel') setCanceling(false);
    if (readingDay(result.server_now) !== data.today) refresh();
  }
  return <>
    <header className="routine-heading"><div><p className="eyebrow">{date}</p><h1>오늘의 독서</h1><p className="muted">{preferences.cue} · 나만의 5분</p></div><button className="button secondary" onClick={() => setSettings(true)} aria-haspopup="dialog"><Settings2 size={18} aria-hidden="true"/>내 루틴</button></header>
    {data.active_focus && <p className="reading-notice"><Clock3 size={17} aria-hidden="true"/><span>‘{data.active_focus.task_title}’ 타이머가 이어지고 있어요.</span><Link href="/#focus">나의 하루에서 보기<ArrowRight size={15} aria-hidden="true"/></Link></p>}
    {settings && <RoutineSettings books={eligible} preferences={preferences} active={Boolean(active)} activeWorkId={session?.work_id ?? null} close={() => setSettings(false)} save={value => { setPreferences(value); setSettings(false); notify('독서 루틴을 저장했어요.'); }}/>}
    <div className="routine-layout">
    <section className={'reading-hero ' + (active ? 'is-reading' : session ? 'is-completed' : book ? '' : 'without-book')} aria-labelledby="reading-title">
      <div className="reading-intro"><p className="reading-kicker"><span className="tiny-dot blue"/>{active ? '지금 읽는 중' : session ? '오늘의 독서 완료' : '나의 5분 독서'}</p>
        <h2 id="reading-title">{active ? '이어서 읽는 시간' : session ? '오늘도 읽었어요.' : book ? '오늘 펼칠 책' : '어떤 책부터 읽을까요?'}</h2>
        {(session || book) ? <div className="reading-book"><div className="reading-cover"><Cover title={session?.work_title ?? book!.title} url={session?.cover_url ?? book!.cover_url} kind="book" priority/></div><div><span className="reading-book-label">{active ? '이어서 읽는 책' : session ? '오늘 읽은 책' : '준비된 책'}</span><h3>{displayedWorkId ? <Link href={'/library/' + displayedWorkId}>{session?.work_title ?? book!.title}</Link> : session?.work_title ?? book!.title}</h3>{(session ? currentBook?.creator : book?.creator) && <p>{session ? currentBook?.creator : book?.creator}</p>}<p className="bookmark"><BookOpen size={14}/>{(session ? session.end_page ?? currentBook?.progress : book?.progress) != null ? (session ? session.end_page ?? currentBook?.progress : book?.progress) + '쪽까지 읽었어요' : '첫 페이지부터 시작해요'}</p>{session?.work_id === null && <p>서재에서 삭제한 책이에요. 독서 기록은 남아 있어요.</p>}</div></div> : <div className="reading-onboarding"><BookOpen size={29}/><h3>읽고 싶은 책 한 권만 담아보세요.</h3><p>표지와 정보는 검색으로 가져올 수 있어요.</p><div className="reading-buttons"><Link className="button primary" href="/discover?kind=book">책 찾아보기<Plus size={16}/></Link><Link className="text-button" href="/library/new?mode=manual">직접 등록</Link></div></div>}
      </div>
      {(session || book) && <div className="reading-visual">{active ? <ReadingClock key={snapshot.server_now} session={session} serverNow={snapshot.server_now}/> : session ? <div className="reading-complete-mark"><CheckCheck size={40} strokeWidth={1.5}/><p role="status">독서 완료</p><span>{Math.floor(session.elapsed_seconds / 60)}분 {session.elapsed_seconds % 60}초</span></div> : <div className="reading-idle-mark"><Clock3 size={24} strokeWidth={1.5}/><strong>5<span>분</span></strong><p>오늘은 이만큼만.</p></div>}</div>}
      {(session || book) && <div className="reading-controls"><ErrorMessage error={action.error}/>
        {!active && book && <div className="reading-buttons"><button className="button primary reading-start" disabled={action.busy || Boolean(data.active_focus)} onClick={() => action.run(start)}><Play size={18} fill="currentColor"/>{action.busy ? '시작하는 중' : session ? '한 번 더 읽기' : '5분 시작'}</button>{!session && <button className="text-button" onClick={() => setSettings(true)}>읽을 책 바꾸기</button>}</div>}
        {active && <div className="reading-buttons"><button className="button primary reading-start" disabled={action.busy} onClick={() => action.run(() => change('complete'))}><Check size={19}/>{action.busy && pending === 'complete' ? '저장하는 중' : '오늘 읽었어'}</button><button className="button secondary" disabled={action.busy} onClick={() => action.run(() => change(session.running_since ? 'pause' : 'resume'))}>{session.running_since ? <Pause size={16}/> : <Play size={16}/>} {action.busy && pending === 'pause' ? '멈추는 중' : action.busy && pending === 'resume' ? '이어가는 중' : session.running_since ? '잠깐 쉬기' : '이어 읽기'}</button><button className="text-button" disabled={action.busy} onClick={() => setCanceling(true)}>취소</button></div>}
        <p className="reading-control-hint">{active ? '화면을 닫아도 이어져요. 읽은 만큼 완료하세요.' : session?.work_id ? '페이지와 문장은 아래에서 덧붙일 수 있어요.' : session ? '완료한 독서는 이번 주 기록에 남아 있어요.' : '기록은 읽고 난 뒤에 남겨도 괜찮아요.'}</p>
      </div>}
    </section>
    {session?.status === 'completed' && session.work_id && <ReadingExtras key={session.id} session={session} note={data.notes.find(note => note.id === session.note_id)} refresh={() => { notify('책갈피와 기록을 저장했어요.'); refresh(); }}/>}
    <section className="routine-week panel" aria-labelledby="week-title"><div className="section-heading"><h2 id="week-title">이번 주의 독서</h2><CalendarDays size={19} aria-hidden="true"/></div><p className="week-total"><strong>{days.size}<span>일</span></strong><span>{minutes}분 읽었어요</span></p>
      <div className="reading-calendar" role="list" aria-label="월요일부터 일요일까지 독서 기록">{data.week.map((day, index) => <div role="listitem" className={'reading-day ' + (days.has(day) ? 'read' : '') + (day === data.today ? ' today' : '') + (day > data.today ? ' future' : '')} key={day} aria-label={`${day} ${days.has(day) ? '독서 완료' : day > data.today ? '예정' : '독서 기록 없음'}${day === data.today ? ', 오늘' : ''}`}><span>{['월', '화', '수', '목', '금', '토', '일'][index]}</span><div>{days.has(day) ? <Check size={21}/> : <span>{Number(day.slice(-2))}</span>}</div><small>{day === data.today ? '오늘' : days.has(day) ? '읽음' : '·'}</small></div>)}</div>
      <p className="field-hint">{days.size ? '읽은 날마다 한 칸씩. 내 속도로 이어가요.' : '한 번의 독서부터 시작해요.'}</p>
    </section>
    </div>
    {!data.books.length && <CatalogExplorer compact onImported={refresh}/>}
    <section className="routine-quotes page-section"><div className="section-heading"><div><p className="eyebrow">이번 주의 문장</p><h2>읽고 남긴 것들</h2></div><Link href="/library">서재 보기<ArrowRight size={16}/></Link></div>{data.notes.length ? <div className="weekly-notes">{data.notes.map(note => <Link className="weekly-note" href={'/library/' + note.work_id} key={note.id}><Quote size={20} aria-hidden="true"/><div><p className="preserve-text">{note.content}</p><span>{note.works.title}</span></div><ArrowRight size={17} aria-hidden="true"/></Link>)}</div> : <div className="weekly-notes-empty"><Quote size={22} aria-hidden="true"/><div><p>기억하고 싶은 문장이 생기면.</p><span>독서 완료 후 문장을 남기면 여기에 모여요.</span></div></div>}</section>
    <div className="routine-library-link"><span>다음에 읽거나 볼 작품을 찾고 싶다면</span><Link href="/discover">작품 둘러보기<ArrowRight size={16}/></Link></div>
    {canceling && <ConfirmDialog title="이번 독서를 취소할까요?" description="진행 중인 타이머만 지워요. 이미 완료한 독서와 책·감상은 유지돼요." confirmLabel="독서 취소" busyLabel="취소 중" busy={action.busy} error={action.error} cancel={() => setCanceling(false)} confirm={() => action.run(() => change('cancel'))}/>}
  </>;
}
function ReadingClock({ session, serverNow }: { session: ReadingSession; serverNow: string }) {
  const [now, setNow] = useState(Date.parse(serverNow));
  useEffect(() => {
    if (!session.running_since) return;
    const receivedAt = Date.now(), baseline = Date.parse(serverNow);
    const timer = setInterval(() => setNow(baseline + Date.now() - receivedAt), 1000);
    return () => clearInterval(timer);
  }, [session.running_since, serverNow]);
  const seconds = elapsedSeconds(session, now), goal = seconds >= READING_GOAL_SECONDS;
  const circumference = 2 * Math.PI * 91;
  return <div className="reading-clock"><div className="timer-dial"><svg viewBox="0 0 200 200" aria-hidden="true"><circle className="timer-track" cx="100" cy="100" r="91"/><circle className="timer-progress" cx="100" cy="100" r="91" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(1, seconds / READING_GOAL_SECONDS))}/></svg><div><span>{goal ? '5분을 채웠어요' : session.running_since ? '남은 시간' : '잠깐 쉬는 중'}</span><strong role="timer" aria-live="off">{remainingClock(seconds)}</strong></div></div><p role="status">{goal ? '조금 더 읽어도 좋아요.' : session.running_since ? '지금은 읽는 시간.' : '준비되면 이어 읽어요.'}</p></div>;
}
function ReadingExtras({ session, note, refresh }: { session: ReadingSession; note?: Note; refresh: () => void }) {
  const action = useAction();
  return <details className="reading-extras panel"><summary><Plus size={17}/>책갈피·문장 남기기 <span>선택</span></summary><form onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    action.run(async () => { const input = parseReadingDetails({ progress: form.get('progress'), content: form.get('content'), thought: form.get('thought') }); await request('/api/reading/' + session.id, 'PATCH', { action: 'details', ...input }); refresh(); });
  }}><p className="field-hint">독서 완료는 이미 저장됐어요. 원하는 내용만 덧붙여요.</p><label>오늘 읽은 페이지<input name="progress" type="number" min={0} max={2147483647} step={1} defaultValue={session.end_page ?? ''} placeholder="예: 42"/></label><label>마음에 남은 문장<textarea name="content" maxLength={20000} rows={3} defaultValue={note?.content ?? ''} placeholder="오늘 기억하고 싶은 문장이나 내용"/></label><label>내 생각<textarea name="thought" maxLength={20000} rows={2} defaultValue={note?.thought ?? ''} placeholder="한 줄이면 충분해요."/></label><ErrorMessage error={action.error}/><button className="button secondary" disabled={action.busy}><Check size={16}/>{action.busy ? '저장 중' : '덧붙이기'}</button></form></details>;
}
function RoutineSettings({ books, preferences, active, activeWorkId, save, close }: { books: Work[]; preferences: ReadingPreferences; active: boolean; activeWorkId: string | null; save: (value: ReadingPreferences) => void; close: () => void }) {
  const action = useAction(), [time, setTime] = useState(preferences.reminder_time.slice(0, 5));
  const [operation, setOperation] = useState<'save' | 'calendar'>('save'), [calendarReady, setCalendarReady] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useModal(ref);
  const selectedWorkId = active ? books.some(book => book.id === activeWorkId) ? activeWorkId! : '' : books.some(book => book.id === preferences.work_id) ? preferences.work_id! : '';
  function calendar() {
    setOperation('calendar'); setCalendarReady(false);
    action.run(async () => {
      const url = URL.createObjectURL(new Blob([reminderCalendar(time)], { type: 'text/calendar;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'next-chapter-reading.ics'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCalendarReady(true);
    });
  }
  return <dialog ref={ref} className="routine-settings" aria-labelledby="routine-settings-title" onCancel={event => { event.preventDefault(); if (!action.busy) close(); }} onClick={event => closeOnBackdrop(event, close, action.busy)}><button className="dialog-close" aria-label="루틴 설정 닫기" disabled={action.busy} onClick={close}><X size={20}/></button><p className="eyebrow">하루에 한 번, 나를 위한 시간</p><h2 id="routine-settings-title">내 독서 루틴</h2><form onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setOperation('save');
    action.run(async () => { const input = parsePreferences({ work_id: form.get('work_id'), cue: form.get('cue'), reminder_time: time }); const result = await request<{ preferences: ReadingPreferences }>('/api/reading/preferences', 'PATCH', input); save(result.preferences); });
  }}><div className="form-grid"><label>언제 읽을까요?<input name="cue" autoFocus required maxLength={80} defaultValue={preferences.cue || defaultPreferences.cue} placeholder="예: 자기 전에 / 아침 커피를 마실 때"/></label><label>이어서 읽을 책<select name="work_id" defaultValue={selectedWorkId} disabled={active}><option value="">{active && !selectedWorkId ? '현재 독서는 유지해요' : '읽던 책부터 자동 선택'}</option>{books.map(book => <option key={book.id} value={book.id}>{book.title} · {STATUSES[book.status]}</option>)}</select>{active && <span className="field-hint">읽는 중에는 책을 바꿀 수 없어요.</span>}</label></div>{active && <input type="hidden" name="work_id" value={selectedWorkId}/>}<div className="routine-reminder"><label>알림 시간 · 한국 시간<input type="time" required value={time} onChange={event => { setTime(event.target.value); setCalendarReady(false); }}/></label><button className="button secondary" type="button" disabled={action.busy} onClick={calendar}><CalendarDays size={16}/>{action.busy && operation === 'calendar' ? '준비 중' : '캘린더 알림 추가'}</button></div>{calendarReady && <p className="success" role="status"><Check size={16}/>캘린더 파일을 준비했어요.</p>}<p className="field-hint">내려받은 파일을 캘린더 앱에서 불러오세요. 매일 독서 일정이 추가되며, 알림은 캘린더 앱 설정을 따라요.</p><details className="routine-home-tip"><summary>휴대폰에서 바로 열기</summary><p className="field-hint">브라우저 메뉴의 ‘홈 화면에 추가’로 바로가기를 만들 수 있어요.</p></details><ErrorMessage error={action.error}/><div className="form-actions"><button className="button primary wide" disabled={action.busy}>{action.busy && operation === 'save' ? '저장 중' : '루틴 저장'}</button></div></form></dialog>;
}
