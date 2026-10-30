import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { HttpError, requireSession } from './api';
import { InputError } from './domain';

export async function requireAccountSession() {
  const { user: claimedUser, client } = await requireSession();
  // Account actions must see a live Auth user, including deletion and email
  // changes, rather than relying on an otherwise valid cached JWT alone.
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (error.status === 401 || error.status === 403 || error.code === 'user_not_found' || error.code === 'session_not_found') {
      throw new HttpError(401, '다시 로그인한 뒤 계정을 확인해주세요.');
    }
    if (error.status === 429) throw new HttpError(429, '요청이 많아요. 잠시 후 다시 확인해주세요.');
    throw new HttpError(502, '계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  if (!data.user || data.user.id !== claimedUser.id || !data.user.email) throw new HttpError(401, '다시 로그인한 뒤 계정을 확인해주세요.');
  return { user: { id: data.user.id, email: data.user.email }, client };
}

export async function verifyAccountPassword(userId: string, email: string, password: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(503, '계정 연결을 준비하고 있어요. 잠시 후 다시 확인해주세요.');
  // This proof uses no request cookies or persisted storage, so signing in to
  // verify a password cannot replace or sign out the user's browser session.
  const proof = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  let proofSession = false;
  try {
    const { data, error } = await proof.auth.signInWithPassword({ email, password });
    proofSession = Boolean(data.session);
    if (error) {
      if (error.status === 429 || error.code === 'over_request_rate_limit') throw new HttpError(429, '요청이 많아요. 잠시 후 다시 시도해주세요.');
      if (error.code === 'invalid_credentials' || error.status === 400) throw new InputError({ current_password: '현재 비밀번호가 맞지 않아요.' });
      throw new HttpError(502, '현재 비밀번호를 확인하지 못했어요. 입력 내용은 유지되니 다시 시도해주세요.');
    }
    if (!data.session || !data.user || data.user.id !== userId) throw new InputError({ current_password: '현재 비밀번호를 다시 확인해주세요.' });
  } finally {
    if (proofSession) {
      // Revoke only the temporary proof session; never all user sessions.
      try { await proof.auth.signOut({ scope: 'local' }); } catch { /* The non-persistent proof client is discarded. */ }
    }
  }
}
