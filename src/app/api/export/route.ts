import { requireSession, failure, json, allRows } from '@/lib/api';
import { backup, workColumns, noteColumns, type Work, type Note } from '@/lib/domain';
import { preferenceColumns } from '@/lib/reading';
import { focusSessionColumns } from '@/lib/focus';
import { routineColumns } from '@/lib/recurrence';
import { goalColumns,taskColumns,reviewColumns } from '@/lib/planner';
import { partnerState } from '@/lib/partner-server';
import {photoColumns,publicPhoto,type PhotoRow} from '@/lib/photo-server';
import {resourceColumns,bookmarkColumns} from '@/lib/resources';
import { ARCHIVE_COLUMNS } from '@/lib/archive';
export async function GET() {
  try {
    const { user, client } = await requireSession();
    const [works, notes, sessions, preferences,goals,tasks,reviews,routines,occurrences,dayPreferences,weekReviews,partner,photos,quickMemos,recordRevisits,learningResources,resourceBookmarks,recordArchives] = await Promise.all([
      allRows((from, to) => client.from('works').select(workColumns).eq('user_id', user.id).order('created_at').order('id').range(from, to)),
      allRows((from, to) => client.from('notes').select(noteColumns).eq('user_id', user.id).order('created_at').order('id').range(from, to)),
      allRows((from, to) => client.from('reading_sessions').select(focusSessionColumns).eq('user_id', user.id).order('started_at').order('id').range(from, to)),
      client.from('reading_preferences').select(preferenceColumns).eq('user_id', user.id).maybeSingle(),
      allRows((from,to)=>client.from('planner_goals').select(goalColumns).eq('user_id',user.id).order('created_at').order('id').range(from,to)),
      allRows((from,to)=>client.from('daily_tasks').select(taskColumns).eq('user_id',user.id).order('day').order('created_at').order('id').range(from,to)),
      allRows((from,to)=>client.from('daily_reviews').select(reviewColumns).eq('user_id',user.id).order('day').range(from,to)),
      allRows((from,to)=>client.from('planner_routines').select(routineColumns).eq('user_id',user.id).order('created_at').order('id').range(from,to)),
      allRows((from,to)=>client.from('routine_occurrences').select('routine_id,day,task_id,created_at').eq('user_id',user.id).order('day').order('routine_id').range(from,to)),
      allRows((from,to)=>client.from('planner_day_preferences').select('day,available_minutes').eq('user_id',user.id).order('day').range(from,to)),
      allRows((from,to)=>client.from('planner_week_reviews').select('day,document,created_at,updated_at').eq('user_id',user.id).order('day').range(from,to)),
      partnerState(client),
      allRows((from,to)=>client.from('task_photos').select(photoColumns).eq('user_id',user.id).eq('state','ready').order('created_at').order('id').range(from,to)),
      allRows((from,to)=>client.from('quick_memos').select('id,content,revision,converted_kind,converted_id,converted_day,converted_at,created_at,updated_at').eq('user_id',user.id).order('created_at').order('id').range(from,to)),
      allRows((from,to)=>client.from('record_revisits').select('id,source_kind,source_id,source_day,source_work_id,source_date,source_title,source_text,thought,created_at,updated_at').eq('user_id',user.id).order('created_at').order('id').range(from,to)),
      allRows((from,to)=>client.from('learning_resources').select(resourceColumns).eq('user_id',user.id).order('created_at').order('id').range(from,to)),
      allRows((from,to)=>client.from('resource_bookmarks').select(bookmarkColumns).eq('user_id',user.id).order('created_at').order('id').range(from,to)),
      allRows((from,to)=>client.from('record_archives').select(ARCHIVE_COLUMNS).eq('user_id',user.id).order('created_at').order('id').range(from,to)),
    ]);
    if (preferences.error) throw new Error(preferences.error.code);
    const payload = { ...backup(works as unknown as Work[], notes as unknown as Note[]), schemaVersion: 3, reading: { sessions, preferences: preferences.data },planner:{goals,tasks,reviews,routines,occurrences,dayPreferences,weekReviews},partner,photos:(photos as PhotoRow[]).map(publicPhoto),quickMemos,recordRevisits,learning:{resources:learningResources,bookmarks:resourceBookmarks},recordArchives };
    const response = json(payload);
    response.headers.set('Content-Disposition', 'attachment; filename="next-chapter-' + payload.exportedAt.slice(0, 10) + '.json"');
    return response;
  } catch (error) { return failure(error); }
}
