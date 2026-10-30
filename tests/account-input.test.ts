import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurrentPassword, parseDeleteAccount, parsePasswordChange } from '../src/lib/account.ts';
import { InputError } from '../src/lib/domain.ts';

test('계정 현재 비밀번호는 이전 정책의 짧은 값과 유니코드·공백을 그대로 보존', () => {
  for (const password of ['a', ' ', '  예전 비밀번호 😀  ', 'a'.repeat(128)]) assert.equal(parseCurrentPassword(password), password);
  for (const password of [undefined, null, '', 12345, 'a'.repeat(129)]) {
    assert.throws(() => parseCurrentPassword(password), error => error instanceof InputError && Boolean(error.issues.current_password));
  }
});

test('계정 비밀번호 변경은 새 비밀번호 10~128자와 확인을 검증하며 값은 정규화하지 않음', () => {
  const password = '  새 비밀번호 한글 😀  ';
  assert.deepEqual(parsePasswordChange({ current_password: ' old ', password, password_confirm: password }), { current_password: ' old ', password });
  for (const password of ['가'.repeat(10), 'a'.repeat(128)]) {
    assert.equal(parsePasswordChange({ current_password: 'old', password, password_confirm: password }).password, password);
  }
  for (const password of ['a'.repeat(9), ' '.repeat(10), 'a'.repeat(129), null]) {
    assert.throws(() => parsePasswordChange({ current_password: 'old', password, password_confirm: password }), error => error instanceof InputError && Boolean(error.issues.password));
  }
  assert.throws(() => parsePasswordChange({ current_password: 'old', password: 'abcdefgh10', password_confirm: 'abcdefgh11' }), error => error instanceof InputError && Boolean(error.issues.password_confirm));
  assert.throws(() => parsePasswordChange({ current_password: '', password: 'short', password_confirm: '' }), error => error instanceof InputError && Boolean(error.issues.current_password && error.issues.password && error.issues.password_confirm));
});

test('계정 변경과 탈퇴는 임의 사용자·이메일·세션 값을 입력 결과에 포함하지 않음', () => {
  const otherIdentity = { user_id: 'another-user', email: 'other@example.com', access_token: 'other-token', deletion_pending: false };
  assert.deepEqual(parsePasswordChange({ ...otherIdentity, current_password: 'old', password: 'abcdefgh10', password_confirm: 'abcdefgh10' }), { current_password: 'old', password: 'abcdefgh10' });
  assert.deepEqual(parseDeleteAccount({ ...otherIdentity, current_password: ' old ', confirmation: '탈퇴' }), { current_password: ' old ', confirmation: '탈퇴' });
});

test('회원 탈퇴는 현재 비밀번호와 명시적인 탈퇴 문구를 모두 요구', () => {
  for (const confirmation of ['', '탈퇴 ', ' 탈퇴', 'delete', true, null, undefined]) {
    assert.throws(() => parseDeleteAccount({ current_password: 'old', confirmation }), error => error instanceof InputError && Boolean(error.issues.confirmation));
  }
  assert.throws(() => parseDeleteAccount({ current_password: '', confirmation: '' }), error => error instanceof InputError && Boolean(error.issues.current_password && error.issues.confirmation));
  for (const body of [null, [], '탈퇴']) {
    assert.throws(() => parseDeleteAccount(body), InputError);
    assert.throws(() => parsePasswordChange(body), InputError);
  }
});
