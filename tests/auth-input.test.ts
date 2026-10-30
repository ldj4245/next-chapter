import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSignup, parseEmail, parseNewPassword, parseRecoveryToken, parseRecoverySession } from '../src/lib/auth-input.ts';
import { InputError } from '../src/lib/domain.ts';

test('회원가입은 이메일만 정규화하고 비밀번호의 공백·대소문자를 보존', () => {
  const password = ' ValidPassword!123 ';
  assert.deepEqual(parseSignup({ email: ' Reader@Example.com ', password, password_confirm: password }),
    { email: 'reader@example.com', password });
});

test('비밀번호 복구는 이메일을 정규화하고 새 비밀번호와 확인을 10~128자로 검증', () => {
  assert.equal(parseEmail(' READER@EXAMPLE.COM '), 'reader@example.com');
  const password = '  New Password!  ';
  assert.deepEqual(parseNewPassword({ password, password_confirm: password }), { password });
  for (const password of ['123456789', ' '.repeat(10), 'a'.repeat(129), null]) assert.throws(() => parseNewPassword({ password, password_confirm: password }), InputError);
  assert.throws(() => parseNewPassword({ password: 'abcdefgh10', password_confirm: 'abcdefgh11' }), InputError);
  assert.equal(parseNewPassword({ password: 'abcdefgh10', password_confirm: 'abcdefgh10' }).password.length, 10);
  for (const email of ['', null, 'a@', 'a b@example.com']) assert.throws(() => parseEmail(email), InputError);
});
test('복구 토큰은 URL·공백·과도한 길이를 허용하지 않으며 비밀번호 입력에 포함하지 않음', () => {
  const token = 'a'.repeat(64);
  assert.equal(parseRecoveryToken(token), token);
  for (const value of ['', null, 'https://outside.example/token', 'a'.repeat(513), 'a '.repeat(32)]) assert.throws(() => parseRecoveryToken(value), InputError);
  assert.deepEqual(parseNewPassword({ password: 'abcdefgh10', password_confirm: 'abcdefgh10', token_hash: token, email: 'other@example.com' }), { password: 'abcdefgh10' });
  assert.deepEqual(parseRecoverySession({ access_token: 'header.payload.signature', refresh_token: 'refresh_token', email: 'ignored@example.com' }), { access_token: 'header.payload.signature', refresh_token: 'refresh_token' });
  for (const input of [{ access_token: 'not-a-jwt', refresh_token: 'token' }, { access_token: 'a.b.c', refresh_token: '' }, { access_token: 'a.b.c', refresh_token: 'x'.repeat(513) }, { access_token: 'x'.repeat(16385) + '.b.c', refresh_token: 'x' }]) assert.throws(() => parseRecoverySession(input), InputError);
});

test('회원가입에서 잘못된 이메일·약한 길이·비밀번호 확인 불일치를 서버와 화면에서 거부', () => {
  const valid = { email: 'reader@example.com', password: 'ValidPassword!123', password_confirm: 'ValidPassword!123' };
  assert.equal(parseSignup({ ...valid, password: 'abcdefgh10', password_confirm: 'abcdefgh10' }).password.length, 10);
  for (const [changes, field] of [
    [{ email: 'not-an-email' }, 'email'], [{ email: 'a'.repeat(250)+'@example.com' }, 'email'],
    [{ password: 'a'.repeat(9) }, 'password'], [{ password: ' '.repeat(10) }, 'password'],
    [{ password: 'a'.repeat(129) }, 'password'], [{ password_confirm: 'different' }, 'password_confirm'],
    [{ password_confirm: null }, 'password_confirm'],
  ] as const) {
    assert.throws(() => parseSignup({ ...valid, ...changes }), error => error instanceof InputError && Boolean(error.issues[field]));
  }
  assert.throws(() => parseSignup(null), InputError);
});
