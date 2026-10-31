import type { Metadata } from 'next';
import { AdminHome } from '@/components/admin';
export const metadata: Metadata = { title: '회원 관리' };
export default function AdminPage() { return <AdminHome/>; }
