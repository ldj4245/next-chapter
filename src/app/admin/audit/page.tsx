import type { Metadata } from 'next';
import { AdminAuditPage } from '@/components/admin';
import { uuid } from '@/lib/domain';
import { notFound } from 'next/navigation';
export const metadata: Metadata = { title: '관리자 열람 이력' };
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const user = (await searchParams).user;
  let userId: string | null = null;
  if (user) { try { userId = uuid(user); } catch { notFound(); } }
  return <AdminAuditPage key={userId ?? 'all'} userId={userId}/>;
}
