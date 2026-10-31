import { notFound, redirect } from 'next/navigation';
import { AdminNavigation } from '@/components/admin';
import { requireAdminSession } from '@/lib/admin-server';
import { HttpError } from '@/lib/api';
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try { await requireAdminSession(); }
  catch (error) { if (error instanceof HttpError && error.status === 401) redirect('/login?returnTo=%2Fadmin'); if (error instanceof HttpError && error.status === 403) notFound(); throw error; }
  return <div className="admin-shell"><a className="skip-link" href="#admin-main">본문으로 이동</a><AdminNavigation/><main id="admin-main" className="admin-main">{children}</main><footer className="admin-footer">다음 장 · 관리</footer></div>;
}
