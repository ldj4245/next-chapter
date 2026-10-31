import assert from 'node:assert/strict';
import test from 'node:test';
import { adminAuditCursor, adminDate, adminMemberQuery, adminOffset, adminRecordQuery, adminTestFlag } from '../src/lib/admin.ts';
import { authReturnPath } from '../src/lib/auth-return.ts';

test('관리 조회 조건은 허용한 종류·날짜·페이지로 제한한다', () => {
  assert.deepEqual(adminMemberQuery(new URLSearchParams('q=reader&kind=test&sort=activity&offset=25')), { p_search: 'reader', p_kind: 'test', p_sort: 'activity', p_offset: 25 });
  assert.throws(() => adminMemberQuery(new URLSearchParams('kind=admin')));
  assert.throws(() => adminMemberQuery(new URLSearchParams('sort=email;delete')));
  for (const offset of ['-1', '1.5', '1e2', '1000001', 'Infinity']) assert.throws(() => adminOffset(offset));
  assert.equal(adminRecordQuery(new URLSearchParams('section=photos&from=2026-10-01&to=2026-10-31')).p_section, 'photos');
  assert.throws(() => adminRecordQuery(new URLSearchParams('section=auth')));
  assert.throws(() => adminRecordQuery(new URLSearchParams('from=2026-02-30')));
  assert.throws(() => adminRecordQuery(new URLSearchParams('from=2026-11-01&to=2026-10-01')));
  assert.throws(() => adminRecordQuery(new URLSearchParams({ q: '가'.repeat(121) })));
  assert.equal(adminTestFlag({ is_test: false }), false);
  assert.throws(() => adminTestFlag({ is_test: 'true' }));
  assert.equal(adminAuditCursor('9223372036854775807'), '9223372036854775807');
  for (const cursor of ['0', '-1', '1.5', '9223372036854775808']) assert.throws(() => adminAuditCursor(cursor));
});
test('관리 화면 복귀는 고정 경로만 허용하고 시간은 한국 기준으로 표시한다', () => {
  assert.equal(authReturnPath('/admin'), '/admin');
  assert.equal(authReturnPath('/admin/audit'), '/admin/audit');
  for (const path of ['//evil.example/admin', '/admin?next=https://evil.example', '/admin/members/abc', '/admin/../api/export']) assert.equal(authReturnPath(path), '/');
  assert.match(adminDate('2026-10-30T16:05:00Z'), /2026\. 10\. 31\./);
  assert.match(adminDate('2026-10-30T16:05:00Z'), /01:05/);
  assert.equal(adminDate(null), '기록 없음');
});
