import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser, configured } from '@/lib/supabase/server';
import { AuthForm } from '@/components/login';
import { authReturnPath } from '@/lib/auth-return';

export const metadata: Metadata = { title: '회원가입' };
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = authReturnPath((await searchParams).returnTo);
  if (await currentUser()) redirect(returnTo);
  return <AuthForm ready={configured()} mode="signup" returnTo={returnTo}/>;
}
