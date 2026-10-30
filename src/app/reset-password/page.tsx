import type { Metadata } from 'next';
import { ResetPassword } from '@/components/password-recovery';
import { configured, currentUser } from '@/lib/supabase/server';
import { parseRecoveryToken } from '@/lib/auth-input';
export const metadata: Metadata = { title: '새 비밀번호 설정', referrer: 'no-referrer' };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token_hash?: string }> }) {
  const params = await searchParams;
  let token: string | null = null;
  try { token = parseRecoveryToken(params.token_hash); } catch { /* Show how to request a fresh link. */ }
  return <ResetPassword ready={configured()} token={token} authenticated={!params.token_hash && Boolean(await currentUser())}/>;
}
