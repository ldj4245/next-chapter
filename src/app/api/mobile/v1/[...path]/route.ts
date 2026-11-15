import { failure, HttpError, json } from '@/lib/api';
import { authenticateMobileRequest } from '@/lib/mobile-auth';
import { withMobileSession } from '@/lib/mobile-context';
import { resolveMobileRoute, type MobileRoute } from '@/lib/mobile-routes';
import * as planner from '@/app/api/planner/route';
import * as tasks from '@/app/api/planner/tasks/route';
import * as tasksBatch from '@/app/api/planner/tasks/batch/route';
import * as task from '@/app/api/planner/tasks/[id]/route';
import * as taskPhotos from '@/app/api/planner/tasks/[id]/photos/route';
import * as review from '@/app/api/planner/review/route';
import * as routines from '@/app/api/planner/routines/route';
import * as applyRoutines from '@/app/api/planner/routines/apply/route';
import * as routine from '@/app/api/planner/routines/[id]/route';
import * as week from '@/app/api/planner/week/route';
import * as weekReview from '@/app/api/planner/week-review/route';
import * as dayPreferences from '@/app/api/planner/day-preferences/route';
import * as focus from '@/app/api/focus/route';
import * as focusItem from '@/app/api/focus/[id]/route';
import * as photo from '@/app/api/photos/[id]/route';
import * as photoImage from '@/app/api/photos/[id]/image/route';
import * as partner from '@/app/api/partner/route';
import * as partnerInvite from '@/app/api/partner/invite/route';
import * as partnerAccept from '@/app/api/partner/accept/route';
import * as partnerProfile from '@/app/api/partner/profile/route';
import * as partnerDay from '@/app/api/partner/day/route';
import * as goals from '@/app/api/goals/route';
import * as goal from '@/app/api/goals/[id]/route';
import * as works from '@/app/api/works/route';
import * as work from '@/app/api/works/[id]/route';
import * as workNotes from '@/app/api/works/[id]/notes/route';
import * as workSummary from '@/app/api/works/[id]/summary/route';
import * as note from '@/app/api/notes/[id]/route';
import * as catalog from '@/app/api/catalog/route';
import * as catalogDiscover from '@/app/api/catalog/discover/route';
import * as catalogImport from '@/app/api/catalog/import/route';
import * as reading from '@/app/api/reading/route';
import * as readingPreferences from '@/app/api/reading/preferences/route';
import * as readingItem from '@/app/api/reading/[id]/route';
import * as resources from '@/app/api/resources/route';
import * as resourcesPreview from '@/app/api/resources/preview/route';
import * as resource from '@/app/api/resources/[id]/route';
import * as resourceBookmarks from '@/app/api/resources/[id]/bookmarks/route';
import * as resourceBookmark from '@/app/api/resources/[id]/bookmarks/[bookmarkId]/route';
import * as memos from '@/app/api/memos/route';
import * as memo from '@/app/api/memos/[id]/route';
import * as memoConvert from '@/app/api/memos/[id]/convert/route';
import * as search from '@/app/api/search/route';
import * as revisit from '@/app/api/revisit/route';
import * as revisitItem from '@/app/api/revisit/[id]/route';
import * as account from '@/app/api/account/route';
import * as accountPassword from '@/app/api/account/password/route';
import * as accountDelete from '@/app/api/account/delete/route';
import * as exportData from '@/app/api/export/route';
import * as archives from '@/app/api/archives/route';
import * as archivesSnapshot from '@/app/api/archives/snapshot/route';
import * as archiveItem from '@/app/api/archives/[id]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Context = { params: Promise<{ path: string[] }> };

function dispatch(request: Request, route: MobileRoute): Promise<Response> {
  const params = { params: Promise.resolve({ id: route.id! }) };
  const bookmarkParams = { params: Promise.resolve({ id: route.id!, bookmarkId: route.bookmarkId! }) };
  const method = request.method;
  switch (route.name) {
    case 'planner': return planner.GET(request);
    case 'tasks': return tasks.POST(request);
    case 'tasksBatch': return tasksBatch.POST(request);
    case 'task': return method === 'PATCH' ? task.PATCH(request, params) : task.DELETE(request, params);
    case 'taskPhotos': return method === 'GET' ? taskPhotos.GET(request, params) : taskPhotos.POST(request, params);
    case 'review': return method === 'GET' ? review.GET(request) : review.PUT(request);
    case 'routines': return method === 'GET' ? routines.GET() : routines.POST(request);
    case 'applyRoutines': return applyRoutines.POST(request);
    case 'routine': return method === 'PATCH' ? routine.PATCH(request, params) : routine.DELETE(request, params);
    case 'week': return week.GET(request);
    case 'weekReview': return method === 'GET' ? weekReview.GET(request) : weekReview.PUT(request);
    case 'dayPreferences': return dayPreferences.PUT(request);

    case 'focus': return method === 'GET' ? focus.GET(request) : focus.POST(request);
    case 'focusItem': return focusItem.PATCH(request, params);
    case 'photo': return photo.DELETE(request, params);
    case 'photoImage': return photoImage.GET(request, params);

    case 'partner': return method === 'GET' ? partner.GET() : partner.DELETE(request);
    case 'partnerInvite': return method === 'GET' ? partnerInvite.GET(request) : method === 'POST' ? partnerInvite.POST(request) : partnerInvite.DELETE(request);
    case 'partnerAccept': return partnerAccept.POST(request);
    case 'partnerProfile': return partnerProfile.POST(request);
    case 'partnerDay': return partnerDay.GET(request);

    case 'goals': return method === 'GET' ? goals.GET() : goals.POST(request);
    case 'goal': return method === 'PATCH' ? goal.PATCH(request, params) : goal.DELETE(request, params);

    case 'works': return method === 'GET' ? works.GET() : works.POST(request);
    case 'work': return method === 'GET' ? work.GET(request, params) : method === 'PATCH' ? work.PATCH(request, params) : work.DELETE(request, params);
    case 'workNotes': return workNotes.POST(request, params);
    case 'workSummary': return workSummary.PATCH(request, params);
    case 'note': return method === 'PATCH' ? note.PATCH(request, params) : note.DELETE(request, params);
    case 'catalog': return catalog.GET(request);
    case 'catalogDiscover': return catalogDiscover.GET(request);
    case 'catalogImport': return catalogImport.POST(request);

    case 'reading': return method === 'GET' ? reading.GET() : reading.POST(request);
    case 'readingPreferences': return readingPreferences.PATCH(request);
    case 'readingItem': return readingItem.PATCH(request, params);

    case 'resources': return method === 'GET' ? resources.GET() : resources.POST(request);
    case 'resourcesPreview': return resourcesPreview.POST(request);
    case 'resource': return method === 'GET' ? resource.GET(request, params) : method === 'PATCH' ? resource.PATCH(request, params) : resource.DELETE(request, params);
    case 'resourceBookmarks': return resourceBookmarks.POST(request, params);
    case 'resourceBookmark': return resourceBookmark.DELETE(request, bookmarkParams);

    case 'memos': return method === 'GET' ? memos.GET() : memos.POST(request);
    case 'memo': return method === 'PATCH' ? memo.PATCH(request, params) : memo.DELETE(request, params);
    case 'memoConvert': return memoConvert.POST(request, params);
    case 'search': return search.GET(request);
    case 'revisit': return method === 'GET' ? revisit.GET(request) : revisit.POST(request);
    case 'revisitItem': return revisitItem.DELETE(request, params);

    case 'account': return account.GET();
    case 'accountPassword': return accountPassword.POST(request);
    case 'accountDelete': return accountDelete.POST(request);
    case 'exportData': return exportData.GET();
    case 'archives': return method === 'GET' ? archives.GET() : archives.POST(request);
    case 'archivesSnapshot': return archivesSnapshot.POST(request);
    case 'archiveItem': return method === 'GET' ? archiveItem.GET(request, params) : archiveItem.POST(request, params);
  }
}

async function handle(request: Request, context: Context) {
  try {
    const route = resolveMobileRoute((await context.params).path);
    if (!route) throw new HttpError(404, '요청한 기능을 찾을 수 없어요.');
    if (!route.methods.includes(request.method)) {
      const response = json({ error: '지원하지 않는 요청 방식이에요.' }, 405);
      response.headers.set('Allow', route.methods.join(', '));
      return response;
    }
    const session = await authenticateMobileRequest(request);
    return await withMobileSession(session, () => dispatch(request, route));
  } catch (error) { return failure(error); }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
