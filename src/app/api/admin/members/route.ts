import { failure, json } from '@/lib/api';
import { adminMemberQuery } from '@/lib/admin';
import { adminRPC, requireAdminSession } from '@/lib/admin-server';
export async function GET(request: Request) {
  try { const { client } = await requireAdminSession(); return json(await adminRPC(client, 'admin_members', adminMemberQuery(new URL(request.url).searchParams))); }
  catch (error) { return failure(error); }
}
