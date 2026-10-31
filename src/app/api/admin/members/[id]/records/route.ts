import { failure, json } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { adminRecordQuery } from '@/lib/admin';
import { adminRPC, requireAdminSession } from '@/lib/admin-server';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { client } = await requireAdminSession();
    return json(await adminRPC(client, 'admin_records', { p_user: uuid((await context.params).id), ...adminRecordQuery(new URL(request.url).searchParams) }));
  } catch (error) { return failure(error); }
}
