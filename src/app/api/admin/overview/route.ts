import { failure, json } from '@/lib/api';
import { adminRPC, requireAdminSession } from '@/lib/admin-server';
export async function GET() {
  try { const { client } = await requireAdminSession(); return json(await adminRPC(client, 'admin_overview')); }
  catch (error) { return failure(error); }
}
