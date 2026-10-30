import type { Metadata } from 'next';
import { ForgotPassword } from '@/components/password-recovery';
import { configured } from '@/lib/supabase/server';
export const metadata: Metadata = { title: '비밀번호 재설정', referrer: 'no-referrer' };
export default function ForgotPasswordPage() { return <ForgotPassword ready={configured()}/>; }
