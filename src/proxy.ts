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
  const adminPage = path === '/admin' || path.startsWith('/admin/');
  const privatePage = path === '/' || path === '/library' || path.startsWith('/library/') || path === '/resources' || path.startsWith('/resources/') || path === '/discover' || path === '/account' || ['/search','/notes','/revisit'].includes(path);
  if ((privatePage || adminPage) && (error || !data?.claims?.sub)) {
    const destination = request.nextUrl.clone();
    destination.pathname = '/login'; destination.search = '';
    if (adminPage) destination.searchParams.set('returnTo', '/admin');
    const redirect = NextResponse.redirect(destination);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return redirect;
  }
  if (adminPage) {
    const live = await client.auth.getUser();
    const access = !live.error && live.data.user?.id === data?.claims?.sub ? await client.rpc('admin_access') : null;
    if (!access || access.error || access.data !== true) {
      const denied = new NextResponse('관리자 계정으로만 확인할 수 있어요.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0' } });
      response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
      return denied;
    }
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
