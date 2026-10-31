import { failure, json } from '@/lib/api';
import { uuid } from '@/lib/domain';
import { adminAuditCursor, adminOffset } from '@/lib/admin';
import { adminRPC, requireAdminSession } from '@/lib/admin-server';
export async function GET(request: Request) {
  try {
    const { client } = await requireAdminSession(), params = new URL(request.url).searchParams;
    return json(await adminRPC(client, 'admin_audit', { p_user: params.get('user') ? uuid(params.get('user')) : null, p_offset: adminOffset(params.get('offset')), p_before: adminAuditCursor(params.get('before')) }));
  } catch (error) { return failure(error); }
}
