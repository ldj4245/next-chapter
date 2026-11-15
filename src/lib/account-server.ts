import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError, requireSession } from './api';
import { InputError } from './domain';
import { mobileConfiguration } from './mobile-auth';
import { mobileSession } from './mobile-context';

export async function requireAccountSession() {
  const { user: claimedUser, client } = await requireSession();
  const mobile = mobileSession();
  // Account actions must see a live Auth user, including deletion and email
  // changes, rather than relying on an otherwise valid cached JWT alone.
  const { data, error } = mobile?.token ? await client.auth.getUser(mobile.token) : await client.auth.getUser();
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

function mapPasswordUpdateFailure(status: number | undefined, code: string | undefined): never {
  if (code === 'weak_password') throw new InputError({ password: '추측하기 어려운 비밀번호로 다시 입력해주세요.' });
  if (code === 'same_password') throw new InputError({ password: '이전 비밀번호와 다른 비밀번호를 입력해주세요.' });
  if (status === 429 || code === 'over_request_rate_limit') throw new HttpError(429, '요청이 많아요. 잠시 후 다시 저장해주세요.');
  if (status === 401 || status === 403) throw new HttpError(401, '다시 로그인한 뒤 비밀번호를 변경해주세요.');
  throw new HttpError(502, '비밀번호를 변경하지 못했어요. 입력 내용은 유지되니 다시 저장해주세요.');
}

export async function updateAccountPassword(client: SupabaseClient, password: string): Promise<void> {
  const mobile = mobileSession();
  if (mobile) {
    if (!mobile.token) throw new HttpError(401, '다시 로그인한 뒤 비밀번호를 변경해주세요.');
    const { supabaseUrl, publishableKey } = mobileConfiguration();
    let response: Response;
    try {
      response = await fetch(new URL('/auth/v1/user', supabaseUrl), {
        method: 'PUT',
        headers: {
          apikey: publishableKey,
          Authorization: 'Bearer ' + mobile.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new HttpError(502, '비밀번호를 변경하지 못했어요. 입력 내용은 유지되니 다시 저장해주세요.');
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { code?: unknown; error_code?: unknown };
      const code = typeof payload.error_code === 'string' ? payload.error_code : typeof payload.code === 'string' ? payload.code : undefined;
      mapPasswordUpdateFailure(response.status, code);
    }
    return;
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) mapPasswordUpdateFailure(error.status, error.code);
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
