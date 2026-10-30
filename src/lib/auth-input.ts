import { InputError, object, type Issues } from './domain.ts';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function parseEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError({ email: '올바른 이메일 주소를 입력해주세요.' });
  return email;
}
export function parseNewPassword(value: unknown) {
  const input = object(value), issues: Issues = {};
  const password = typeof input.password === 'string' ? input.password : '';
  const confirmation = typeof input.password_confirm === 'string' ? input.password_confirm : '';
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH || !password.trim()) {
    issues.password = `비밀번호는 ${MIN_PASSWORD_LENGTH}~${MAX_PASSWORD_LENGTH}자로 입력해주세요.`;
  }
  if (!confirmation || confirmation !== password) issues.password_confirm = '비밀번호가 일치하지 않아요.';
  if (Object.keys(issues).length) throw new InputError(issues);
  return { password };
}
export function parseSignup(value: unknown) {
  const input = object(value);
  return { email: parseEmail(input.email), ...parseNewPassword(input) };
}
export function parseRecoveryToken(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,512}$/.test(value)) throw new InputError({ token_hash: '재설정 링크가 올바르지 않아요. 새 링크를 받아주세요.' });
  return value;
}
export function parseRecoverySession(value: unknown) {
  const input = object(value);
  const access_token = input.access_token, refresh_token = input.refresh_token;
  if (typeof access_token !== 'string' || access_token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(access_token) || typeof refresh_token !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(refresh_token)) throw new InputError({ token_hash: '재설정 링크가 올바르지 않아요. 새 링크를 받아주세요.' });
  return { access_token, refresh_token };
}
