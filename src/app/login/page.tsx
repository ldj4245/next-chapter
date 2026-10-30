import { redirect } from 'next/navigation';
import { currentUser, configured } from '@/lib/supabase/server';
import { AuthForm } from '@/components/login';
import { authReturnPath } from '@/lib/auth-return';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = authReturnPath((await searchParams).returnTo);
  if (await currentUser()) redirect(returnTo);
  return <AuthForm ready={configured()} returnTo={returnTo}/>;
}
