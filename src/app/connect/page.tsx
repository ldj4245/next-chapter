import type { Metadata } from 'next';
import { ConnectInvite } from '@/components/partner';
import { currentUser, configured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: '하루 확인 초대', referrer: 'no-referrer', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const candidate = (await searchParams).token;
  const token = typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate) ? candidate : null;
  return <ConnectInvite token={token} authenticated={Boolean(await currentUser())} ready={configured()}/>;
}
