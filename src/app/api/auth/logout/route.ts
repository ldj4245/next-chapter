import { assertOrigin, failure, json } from '@/lib/api';
import { serverClient } from '@/lib/supabase/server';
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const client = await serverClient(), { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new Error('SIGN_OUT_FAILED');
    return json({ signedOut: true });
  } catch (error) { return failure(error); }
}
