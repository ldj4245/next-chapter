import { createClient } from '@supabase/supabase-js';
import { assertOrigin, failure, HttpError, json, readBody } from '@/lib/api';
import { parseEmail } from '@/lib/auth-input';
import { object } from '@/lib/domain';
import { configured } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!configured()) throw new HttpError(503, '서재 연결을 준비하고 있어요. 잠시 후 다시 접속해주세요.');
    const email = parseEmail(object(await readBody(request)).email);
    // Recovery is verified with the emailed token hash, so it works on another device too.
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: new URL('/reset-password', request.url).href });
    if (error) {
      if (error.status === 429) throw new HttpError(429, '요청이 많아요. 잠시 후 다시 보내주세요.');
      if (error.code === 'email_address_not_authorized') throw new HttpError(503, '현재 이메일 발송 설정으로는 이 주소에 메일을 보낼 수 없어요. 관리자에게 문의해주세요.');
      throw new HttpError(502, '재설정 메일을 요청하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    // Supabase deliberately returns the same result for an unknown email.
    return json({ requested: true });
  } catch (error) { return failure(error); }
}
