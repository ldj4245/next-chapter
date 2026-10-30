import { parseNewPassword, MAX_PASSWORD_LENGTH } from './auth-input.ts';
import { InputError, object, type Issues } from './domain.ts';

export type AccountData = { email: string; nickname: string; deletion_pending: boolean };

export function parseCurrentPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_PASSWORD_LENGTH) {
    throw new InputError({ current_password: '현재 비밀번호를 입력해주세요.' });
  }
  // Current credentials may predate the new-password policy. Never trim them.
  return value;
}

export function parsePasswordChange(value: unknown): { current_password: string; password: string } {
  const input = object(value), issues: Issues = {};
  let current_password = '', password = '';
  try { current_password = parseCurrentPassword(input.current_password); }
  catch (error) { if (!(error instanceof InputError)) throw error; Object.assign(issues, error.issues); }
  try { ({ password } = parseNewPassword(input)); }
  catch (error) { if (!(error instanceof InputError)) throw error; Object.assign(issues, error.issues); }
  if (Object.keys(issues).length) throw new InputError(issues);
  return { current_password, password };
}

export function parseDeleteAccount(value: unknown): { current_password: string; confirmation: '탈퇴' } {
  const input = object(value), issues: Issues = {};
  let current_password = '';
  try { current_password = parseCurrentPassword(input.current_password); }
  catch (error) { if (!(error instanceof InputError)) throw error; Object.assign(issues, error.issues); }
  if (input.confirmation !== '탈퇴') issues.confirmation = '확인란에 탈퇴를 입력해주세요.';
  if (Object.keys(issues).length) throw new InputError(issues);
  return { current_password, confirmation: '탈퇴' };
}
