import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell';
import { hasAdminAccess } from '@/lib/admin-server';
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser(); if (!user) redirect('/login');
  return <AppShell email={user.email ?? ''} admin={await hasAdminAccess()}>{children}</AppShell>;
}
