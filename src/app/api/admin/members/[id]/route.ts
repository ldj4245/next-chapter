import { assertOrigin, failure, json, readBody } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { adminTestFlag } from '@/lib/admin';
import { adminRPC, requireAdminSession } from '@/lib/admin-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { const { client } = await requireAdminSession(); return json(await adminRPC(client, 'admin_member', { p_user: uuid((await context.params).id) })); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request); const { client } = await requireAdminSession();
    return json(await adminRPC(client, 'admin_set_test_account', { p_user: uuid((await context.params).id), p_is_test: adminTestFlag(await readBody(request)) }));
  } catch (error) { return failure(error); }
}
