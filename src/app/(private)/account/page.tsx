import { AccountHome } from '@/components/account';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { hasAdminAccess } from '@/lib/admin-server';

export default async function AccountPage() { return <>{await hasAdminAccess() && <Link href="/admin" className="account-admin-link">관리 화면 열기<ArrowUpRight size={15}/></Link>}<AccountHome/></>; }
