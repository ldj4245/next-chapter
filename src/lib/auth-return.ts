// An invitation is the only public page that needs to survive signing in.
export function authReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !/^\/connect\?token=[a-f0-9]{64}$/.test(value)) return '/';
  return value;
}

export function authModePath(mode: 'login' | 'signup', returnTo: unknown): string {
  const path = authReturnPath(returnTo);
  return '/' + mode + (path === '/' ? '' : '?returnTo=' + encodeURIComponent(path));
}
