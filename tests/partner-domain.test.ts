import assert from 'node:assert/strict';
import test from 'node:test';
import { InputError } from '../src/lib/domain.ts';
import { parseInviteToken, parseNickname, parseTaskSharing } from '../src/lib/partner.ts';
import { authModePath, authReturnPath } from '../src/lib/auth-return.ts';

test('공유 이름은 Unicode 글자 수를 기준으로 검증하고 줄바꿈·제어문자·마크업을 거부', () => {
  assert.equal(parseNickname('  나의 이름  '), '나의 이름');
  assert.equal(parseNickname('📚'.repeat(24)), '📚'.repeat(24));
  for (const nickname of [null, true, [], '', ' ', '가', '가'.repeat(25), '📚'.repeat(25), '나\n이름', '나\t이름', '나\u0085이름', '<이름>', '나\u0000이름']) {
    assert.throws(() => parseNickname(nickname), InputError);
  }
});

test('초대 토큰은 정확한 256비트 소문자 16진수이며 URL·공백·대소문자 변형을 허용하지 않음', () => {
  const token = '0123456789abcdef'.repeat(4);
  assert.equal(parseInviteToken(token), token);
  for (const value of [null, 123, '', token.slice(1), token + '0', token.toUpperCase(), ' ' + token, token + ' ', token + '\n', 'https://example.test/?token=' + token, 'g'.repeat(64)]) {
    assert.throws(() => parseInviteToken(value), InputError);
  }
});

test('공개 여부는 명시적 boolean만 허용하며 공개 문장 길이를 제한하고 클라이언트 소유권·완료시각을 제거', () => {
  assert.deepEqual(parseTaskSharing({ shared: false }), { shared: false, public_note: '' });
  assert.deepEqual(parseTaskSharing({ shared: true, public_note: '  공개할 생각\n다음 문장  ', shared_connection_id: 'forged-connection', user_id: 'forged-owner', completed_at: '1900-01-01' }), { shared: true, public_note: '공개할 생각\n다음 문장' });
  assert.equal(parseTaskSharing({ shared: true, public_note: '가'.repeat(1000) }).public_note.length, 1000);
  for (const shared of [undefined, null, 'true', 1, {}, []]) assert.throws(() => parseTaskSharing({ shared }), InputError);
  for (const public_note of [false, 123, {}, [], '가'.repeat(1001), '📚'.repeat(501)]) assert.throws(() => parseTaskSharing({ shared: true, public_note }), InputError);
});

test('로그인·가입 왕복은 유효한 내부 초대만 보존하고 외부 URL이나 다른 경로로 이동시키지 않음', () => {
  const path = '/connect?token=' + 'a'.repeat(64);
  assert.equal(authReturnPath(path), path);
  for (const mode of ['login', 'signup'] as const) {
    const destination = new URL(authModePath(mode, path), 'https://library.example');
    assert.equal(destination.pathname, '/' + mode);
    assert.equal(destination.searchParams.get('returnTo'), path);
    assert.equal(authModePath(mode, '//outside.example'), '/' + mode);
  }
  for (const path of [null, [], {}, '', '/', '/library', '//outside.example', 'https://outside.example', '/%63onnect?token=' + 'a'.repeat(64), '/connect?token=' + 'a'.repeat(63), '/connect?token=' + 'A'.repeat(64), '/connect?token=' + 'a'.repeat(64) + '&next=https://outside.example', '/connect?token=' + 'a'.repeat(64) + '#fragment', '/connect?token=' + 'a'.repeat(64) + '\n']) {
    assert.equal(authReturnPath(path), '/');
  }
});
