import { failure, HttpError, json } from '@/lib/api';
import { authenticateMobileRequest } from '@/lib/mobile-auth';
import { withMobileSession } from '@/lib/mobile-context';
import { resolveMobileRoute, type MobileRoute } from '@/lib/mobile-routes';
import * as planner from '@/app/api/planner/route';
import * as tasks from '@/app/api/planner/tasks/route';
import * as task from '@/app/api/planner/tasks/[id]/route';
import * as review from '@/app/api/planner/review/route';
import * as applyRoutines from '@/app/api/planner/routines/apply/route';
import * as goals from '@/app/api/goals/route';
import * as goal from '@/app/api/goals/[id]/route';
import * as account from '@/app/api/account/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

function dispatch(request: Request, route: MobileRoute): Promise<Response> {
  const params = { params: Promise.resolve({ id: route.id! }) };
  switch (route.name) {
    case 'planner': return planner.GET(request);
    case 'tasks': return tasks.POST(request);
    case 'task': return request.method === 'PATCH' ? task.PATCH(request, params) : task.DELETE(request, params);
    case 'review': return request.method === 'GET' ? review.GET(request) : review.PUT(request);
    case 'applyRoutines': return applyRoutines.POST(request);
    case 'goals': return request.method === 'GET' ? goals.GET() : goals.POST(request);
    case 'goal': return request.method === 'PATCH' ? goal.PATCH(request, params) : goal.DELETE(request, params);
    case 'account': return account.GET();
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
