import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/pick') {
    const destination = request.nextUrl.clone();
    destination.pathname = '/library'; destination.search = '';
    const redirect = NextResponse.redirect(destination);
    redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return redirect;
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: items => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data, error } = await client.auth.getClaims();
  const path = request.nextUrl.pathname;
  const privatePage = path === '/' || path === '/library' || path.startsWith('/library/') || path === '/resources' || path.startsWith('/resources/') || path === '/discover' || path === '/account' || ['/search','/notes','/revisit'].includes(path);
  if (privatePage && (error || !data?.claims?.sub)) {
    const destination = request.nextUrl.clone();
    destination.pathname = '/login'; destination.search = '';
    const redirect = NextResponse.redirect(destination);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return redirect;
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
