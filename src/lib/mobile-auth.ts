import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './api';
import type { MobileSession } from './mobile-context';

export function mobileConfiguration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new HttpError(503, '계정 연결을 준비하고 있어요. 잠시 후 다시 확인해주세요.');
  let publicKey = publishableKey.startsWith('sb_publishable_');
  if (!publicKey) {
    try {
      const payload = JSON.parse(Buffer.from(publishableKey.split('.')[1] ?? '', 'base64url').toString('utf8'));
      publicKey = payload.role === 'anon';
    } catch { /* Only a publishable key or the legacy anon key may be exposed. */ }
  }
  if (!publicKey) throw new HttpError(503, '계정 연결 설정을 확인하고 있어요. 잠시 후 다시 확인해주세요.');
  return { supabaseUrl, publishableKey };
}

export function mobileBearer(request: Request): string {
  const header = request.headers.get('authorization');
  if (!header || header.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(header)) {
    throw new HttpError(401, '로그인이 필요해요.');
  }
  return header.slice(7);
}

export async function authenticateMobileRequest(request: Request): Promise<MobileSession> {
  const token = mobileBearer(request), { supabaseUrl, publishableKey } = mobileConfiguration();
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) {
    if (error.status === 429) throw new HttpError(429, '요청이 많아요. 잠시 후 다시 확인해주세요.');
    if (error.status === 401 || error.status === 403 || (error.status === 400 && error.code !== 'request_timeout')) {
      throw new HttpError(401, '다시 로그인해주세요.');
    }
    throw new HttpError(502, '로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  if (!data.user || !data.user.id || !data.user.email || data.user.is_anonymous) throw new HttpError(401, '다시 로그인해주세요.');
  return { client, request, user: { id: data.user.id, email: data.user.email } };
}
