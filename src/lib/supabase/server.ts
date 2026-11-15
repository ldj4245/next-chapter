import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { mobileSession } from '../mobile-context';

export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export async function serverClient() {
  const mobile = mobileSession();
  if (mobile) return mobile.client;
  if (!configured()) throw new Error('SUPABASE_NOT_CONFIGURED');
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: items => {
        try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); }
        catch { /* Server Components use the refreshed cookies passed by proxy. */ }
      },
    },
  });
}
export async function currentUser() {
  const mobile = mobileSession();
  if (mobile) return mobile.user;
  if (!configured()) return null;
  const client = await serverClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: typeof data.claims.email === 'string' ? data.claims.email : '' };
}
