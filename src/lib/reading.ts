import { InputError, object, parseNote, uuid, type Note, type Work } from './domain.ts';

export const READING_GOAL_SECONDS = 300;
export const READING_ZONE = 'Asia/Seoul';
export type ReadingSession = {
  id: string; work_id: string | null; work_title: string; cover_url: string;
  status: 'active' | 'completed'; started_at: string; finished_at: string | null;
  running_since: string | null; elapsed_seconds: number; reading_day: string | null;
  end_page: number | null; note_id: string | null;
};
export type ReadingPreferences = { work_id: string | null; cue: string; reminder_time: string };
export type WeeklyNote = Note & { works: { title: string; kind: string } };
export type ReadingData = {
  server_now: string; today: string; week: string[]; books: Work[];
  preferences: ReadingPreferences; session: ReadingSession | null;
  completed: ReadingSession[]; notes: WeeklyNote[];
  active_focus?: { id: string; task_id: string | null; task_title: string } | null;
};
export const sessionColumns = 'id,work_id,work_title,cover_url,status,started_at,finished_at,running_since,elapsed_seconds,reading_day,end_page,note_id';
export const preferenceColumns = 'work_id,cue,reminder_time';
export const defaultPreferences: ReadingPreferences = { work_id: null, cue: '자기 전에', reminder_time: '22:00' };

export function readingDay(now: Date | string | number = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: READING_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function readingWeek(day: string): string[] {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => new Date(date.getTime() + index * 86400000).toISOString().slice(0, 10));
}
export function elapsedSeconds(session: ReadingSession, now: number): number {
  const extra = session.running_since ? Math.max(0, Math.floor((now - Date.parse(session.running_since)) / 1000)) : 0;
  return Math.min(86400, session.elapsed_seconds + extra);
}
export function remainingClock(seconds: number): string {
  const remaining = Math.max(0, READING_GOAL_SECONDS - seconds);
  return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
}
export function parseReadingDetails(value: unknown) {
  const input = object(value);
  let progress: number | null = null;
  if (input.progress != null && input.progress !== '') {
    progress = typeof input.progress === 'number' ? input.progress : typeof input.progress === 'string' ? Number(input.progress) : NaN;
    if (!Number.isInteger(progress) || progress < 0 || progress > 2147483647) throw new InputError({ progress: '페이지는 0 이상의 정수로 입력해주세요.' });
  }
  const note = input.content == null || input.content === '' ? null : parseNote({ content: input.content, thought: input.thought });
  if (!note && input.thought) throw new InputError({ content: '생각과 함께 남길 문장을 입력해주세요.' });
  return { progress, content: note?.content ?? null, thought: note?.thought ?? null };
}
export function parsePreferences(value: unknown): ReadingPreferences {
  const input = object(value);
  const cue = typeof input.cue === 'string' ? input.cue.trim() : '';
  if (!cue || cue.length > 80) throw new InputError({ cue: '독서할 순간을 80자 이내로 적어주세요.' });
  if (typeof input.reminder_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reminder_time)) throw new InputError({ reminder_time: '알림 시간을 확인해주세요.' });
  return { work_id: input.work_id == null || input.work_id === '' ? null : uuid(input.work_id), cue, reminder_time: input.reminder_time };
}
// Calendar files contain a generic reminder, never private book titles or notes.
export function reminderCalendar(time: string, now: Date = new Date()): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new InputError({ reminder_time: '알림 시간을 확인해주세요.' });
  let day = readingDay(now);
  if (now.getTime() >= Date.parse(day + 'T' + time + ':00+09:00')) day = readingDay(now.getTime() + 86400000);
  const local = day.replaceAll('-', '') + 'T' + time.replace(':', '') + '00';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Next Chapter//Reading Routine//KO', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', 'UID:reading-routine-' + time.replace(':', '') + '@next-chapter', 'DTSTAMP:' + now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'),
    'DTSTART;TZID=Asia/Seoul:' + local, 'DURATION:PT5M', 'RRULE:FREQ=DAILY', 'SUMMARY:5분 독서', 'DESCRIPTION:다음 장에서 읽던 책을 이어 읽어요.',
    'URL:https://next-chapter-steel-three.vercel.app/reading', 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:5분만 읽어볼까요?', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
