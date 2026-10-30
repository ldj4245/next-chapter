import { createClient } from '@supabase/supabase-js';
import { parseDeleteAccount } from '@/lib/account';
import { requireAccountSession, verifyAccountPassword } from '@/lib/account-server';
import { assertOrigin, failure, HttpError, json, readBody } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

function deletionFailure(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === 'P0001' && error.message === 'ACCOUNT_PHOTO_BUSY') {
    throw new HttpError(409, '사진 처리가 아직 끝나지 않았어요. 업로드가 끝난 뒤 다시 시도해주세요. 중단된 업로드가 있다면 최대 10분이 걸릴 수 있어요.');
  }
  if (['40P01', '40001'].includes(error.code ?? '')) throw new HttpError(409, '다른 변경을 마무리하고 있어요. 잠시 후 다시 시도해주세요.');
  throw new HttpError(503, '탈퇴 준비를 마치지 못했어요. 계정은 유지되며 같은 화면에서 다시 시도할 수 있어요.');
}

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireAccountSession();
    const input = parseDeleteAccount(await readBody(request));
    await verifyAccountPassword(user.id, user.email, input.current_password);
    const key = process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY, url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!key || !url) throw new HttpError(503, '계정 삭제 연결을 준비하고 있어요. 잠시 후 다시 시도해주세요.');
    // The privileged client never accepts an identity or a storage path from
    // request input. Both come from a fresh user session and owner-bound RPC.
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const prepared = await client.rpc('prepare_own_account_deletion');
    deletionFailure(prepared.error);
    if (prepared.data !== true) throw new HttpError(503, '탈퇴 준비를 확인하지 못했어요. 다시 시도해주세요.');
    const inventory = await client.rpc('own_account_photo_paths');
    deletionFailure(inventory.error);
    const paths: unknown = inventory.data;
    if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string' || !path.startsWith(user.id + '/')
      || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(image|thumb)\.webp$/.test(path))) {
      throw new HttpError(503, '사진 정리 범위를 확인하지 못했어요. 계정은 유지되며 다시 시도할 수 있어요.');
    }
    for (let offset = 0; offset < paths.length; offset += 100) {
      const removed = await admin.storage.from('task-photos').remove(paths.slice(offset, offset + 100) as string[]);
      if (removed.error) throw new HttpError(503, '사진 정리를 마치지 못했어요. 계정은 유지되며 같은 화면에서 탈퇴를 다시 시도할 수 있어요.');
    }
    // Cleanup success is a precondition, including Storage metadata. Never
    // delete Auth while an object still exists under this exact owner prefix.
    // The inventory also includes metadata/outbox for already absent files.
    // Check actual Storage objects via a marker-bound owner-only SQL boolean.
    const objects = await client.rpc('own_account_has_photo_objects');
    if (objects.error || objects.data !== false) throw new HttpError(503, '사진 정리를 확인하지 못했어요. 계정은 유지되며 다시 시도할 수 있어요.');
    const removed = await admin.auth.admin.deleteUser(user.id, false);
    if (removed.error) {
      // A timeout may follow a successful Auth commit. Only a definitive
      // user_not_found result is accepted as completion; uncertainty retries.
      const checked = await admin.auth.admin.getUserById(user.id);
      if (checked.error?.code !== 'user_not_found') throw new HttpError(503, '계정 삭제를 마치지 못했어요. 같은 화면에서 탈퇴를 다시 시도해주세요.');
    }
    // FK deletion queues contain only already-removed objects. Failure here
    // cannot undo Auth deletion or make private files readable.
    const queue = await admin.from('task_photo_deletions').delete().eq('user_id', user.id);
    if (queue.error) console.error('Deleted account photo queue cleanup deferred');
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* Auth deletion already invalidated the identity. */ }
    return json({ deleted: true });
  } catch (error) { return failure(error); }
}
