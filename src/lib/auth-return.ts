export function authReturnPath(value: unknown): string {
  if (value === '/admin' || value === '/admin/audit') return value;
  if (typeof value !== 'string' || !/^\/connect\?token=[a-f0-9]{64}$/.test(value)) return '/';
  return value;
}

export function authModePath(mode: 'login' | 'signup', returnTo: unknown): string {
  const path = authReturnPath(returnTo);
  return '/' + mode + (path === '/' ? '' : '?returnTo=' + encodeURIComponent(path));
}
