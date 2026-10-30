import { allRows, assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { object, uuid, workColumns, noteColumns, type Work } from '@/lib/domain';
import { defaultPreferences, preferenceColumns, readingDay, readingWeek, sessionColumns, type ReadingSession } from '@/lib/reading';
import { focusSessionColumns, type FocusSession } from '@/lib/focus';

export async function GET() {
  try {
    const { user, client } = await requireSession();
    const today = readingDay(), week = readingWeek(today);
    const [books, preferences, active, completed, notes] = await Promise.all([
      allRows((from, to) => client.from('works').select(workColumns).eq('user_id', user.id).eq('kind', 'book').order('updated_at', { ascending: false }).order('id').range(from, to)),
      client.from('reading_preferences').select(preferenceColumns).eq('user_id', user.id).maybeSingle(),
      client.from('reading_sessions').select(focusSessionColumns).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
      allRows((from, to) => client.from('reading_sessions').select(sessionColumns).eq('user_id', user.id).eq('status', 'completed').eq('is_reading', true).gte('reading_day', week[0]).lte('reading_day', week[6]).order('finished_at', { ascending: false }).order('id').range(from, to)),
      client.from('notes').select(noteColumns + ',works!notes_work_owner_fk!inner(title,kind)').eq('user_id', user.id).eq('works.kind', 'book').gte('created_at', week[0] + 'T00:00:00+09:00').lt('created_at', new Date(Date.parse(week[6] + 'T00:00:00+09:00') + 86400000).toISOString()).order('created_at', { ascending: false }).limit(6),
    ]);
    for (const result of [preferences, active, notes]) if (result.error) throw new Error(result.error.code);
    const entries = completed as unknown as ReadingSession[];
    const activeSession = active.data as unknown as FocusSession | null;
    const taskTimer = activeSession?.task_title ? { id: activeSession.id, task_id: activeSession.task_id, task_title: activeSession.task_title } : null;
    return json({ server_now: new Date().toISOString(), today, week, books: books as unknown as Work[],
      preferences: preferences.data ?? defaultPreferences,
      active_focus: taskTimer,
      session: (!taskTimer && activeSession?.is_reading ? activeSession : null) ?? entries.find(entry => entry.reading_day === today) ?? null, completed: entries, notes: notes.data ?? [] });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), body = object(await readBody(request));
    const id = uuid(body.id), workId = uuid(body.work_id);
    const book = await client.from('works').select('id').eq('id', workId).eq('user_id', user.id).eq('kind', 'book').in('status', ['planned', 'active']).maybeSingle();
    if (book.error) throw new Error(book.error.code);
    if (!book.data) throw new HttpError(404, '예정 또는 감상 중인 내 책을 선택해주세요.');
    const result = await client.rpc('start_reading', { p_id: id, p_work_id: workId });
    if (result.error?.code === 'P0002') throw new HttpError(404, '예정 또는 감상 중인 내 책을 선택해주세요.');
    if (result.error) throw new Error(result.error.code);
    return json({ session: result.data, server_now: new Date().toISOString() }, 201);
  } catch (error) { return failure(error); }
}
