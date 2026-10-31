import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { ARCHIVE_SECTIONS, archiveCounts, buildArchiveDocument, parseArchiveCreate, parseArchiveEnvelope, parseArchiveOptions, type ArchiveDocument, type ArchiveKit } from '../src/lib/archive.ts';
import { archiveDigest, decryptArchive, encryptArchive } from '../src/lib/archive-crypto.ts';
import { ARCHIVE_READER_SCRIPT, recoveryHTML } from '../src/lib/archive-reader.ts';

const options = { from: '2026-10-01', to: '2026-10-31', sections: Object.keys(ARCHIVE_SECTIONS) as (keyof typeof ARCHIVE_SECTIONS)[] };
const doc = (): ArchiveDocument => buildArchiveDocument(options, { tasks: [{ day: '2026-10-31', title: '내가 작성한 비공개 기록', status: 'completed', note: '</script><img src=x onerror=alert(1)>', reason_detail: '나의 생각' }] }, '2026-10-31T12:00:00.000Z');

test('보관 범위는 실제 날짜와 허용된 종류만 받는다', () => {
  assert.deepEqual(parseArchiveOptions(options), options);
  for (const patch of [{ from: '2026-02-30' }, { to: '2026-09-30' }, { sections: [] }, { sections: ['admin'] }, { from: 'not-a-date' }]) assert.throws(() => parseArchiveOptions({ ...options, ...patch }));
});
test('선택 기간·종류와 한국 날짜 경계를 지키며 계정·공유 식별자·표지는 보관하지 않는다', () => {
  const result = buildArchiveDocument({ ...options, sections: ['days', 'library'] }, {
    works: [{ id: 'work', title: '책 제목', kind: 'book', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-30T15:00:00Z', summary: '완독 한 줄', user_id: 'owner-secret', cover_url: 'https://tracker.invalid/image', email: 'reader@example.com' }],
    notes: [{ work_id: 'work', content: '인용 원문', thought: '내 생각', created_at: '2026-10-31T14:59:59Z' }, { work_id: 'work', content: '범위 밖 문장', created_at: '2026-10-31T15:00:00Z' }],
    tasks: [{ day: '2026-10-01', title: '보관할 일', note: '개인 메모', goal_id: 'goal', work_id: 'work', shared_connection_id: 'peer-secret' }, { day: '2026-11-01', title: '범위 밖 할 일' }],
    goals: [{ id: 'goal', title: '목표 제목', motivation: '선택하지 않은 목표 본문', created_at: '2026-10-01T00:00:00Z' }],
    reviews: [{ day: '2026-10-01', document: { version: 1, blocks: [{ kind: 'heading1', text: '자유 회고', checked: false }, { kind: 'check', text: '내 생각', checked: true }] }, helped: '이전 회고 중복 금지' }],
    sessions: [{ reading_day: '2026-10-31', status: 'completed', elapsed_seconds: 305, memo: '집중하며 적은 것' }],
  });
  const encoded = JSON.stringify(result);
  for (const text of ['책 제목', '완독 한 줄', '인용 원문', '개인 메모', '목표 제목', '자유 회고', '집중하며 적은 것', '5분']) assert.ok(encoded.includes(text), text);
  for (const text of ['owner-secret', 'peer-secret', 'reader@example.com', 'tracker.invalid', '범위 밖', '선택하지 않은 목표 본문', '이전 회고 중복 금지']) assert.ok(!encoded.includes(text), text);
  assert.equal(result.entries.length, 5);
  assert.deepEqual(archiveCounts(result), { days: 3, library: 2 });
  const goal = buildArchiveDocument({ ...options, sections: ['notes'] }, { goals: [{ title: '학습 목표', metric_unit: 'minutes', metric_target: 30, created_at: '2026-10-31T00:00:00Z' }] });
  assert.equal(goal.entries[0].fields.find(f => f.label === '측정 단위')?.text, '집중 시간');
});
test('암호화는 키를 분리하고 잘못된 키·암호문·압축 방식 변경을 거부한다', async () => {
  const original = doc(), sealed = await encryptArchive(original);
  assert.equal(sealed.key.length, 43);
  assert.ok(!JSON.stringify(sealed.envelope).includes('비공개'));
  assert.deepEqual(await decryptArchive(sealed.envelope, sealed.key), original);
  await assert.rejects(decryptArchive(sealed.envelope, randomBytes(32).toString('base64url')));
  await assert.rejects(decryptArchive({ ...sealed.envelope, ciphertext: 'AAAA' + sealed.envelope.ciphertext.slice(4) }, sealed.key));
  await assert.rejects(decryptArchive({ ...sealed.envelope, compression: sealed.envelope.compression === 'gzip' ? 'none' : 'gzip' }, sealed.key));
  const again = await encryptArchive(original);
  assert.notEqual(sealed.key, again.key); assert.notEqual(sealed.envelope.iv, again.envelope.iv);
  const reordered = Object.fromEntries(Object.entries(sealed.envelope).reverse());
  assert.equal(await archiveDigest(parseArchiveEnvelope(reordered)), sealed.digest);
});
test('API 입력에 복구키나 임의 필드를 실어 보내지 못한다', async () => {
  const sealed = await encryptArchive(doc());
  const body = { id: randomUUID(), ...options, counts: archiveCounts(doc()), envelope: sealed.envelope };
  assert.equal(parseArchiveCreate(body).id, body.id);
  assert.throws(() => parseArchiveCreate({ ...body, key: sealed.key }));
  assert.throws(() => parseArchiveCreate({ ...body, envelope: { ...sealed.envelope, key: sealed.key } }));
  assert.throws(() => parseArchiveCreate({ ...body, counts: { days: -1 } }));
  assert.throws(() => parseArchiveEnvelope({ ...sealed.envelope, ciphertext: 'A'.repeat(120000) }));
});
test('복구 HTML은 자체 암호문·키와 CSP를 포함하고 외부 코드나 원문 HTML을 실행하지 않는다', async () => {
  const sealed = await encryptArchive(doc());
  const kit: ArchiveKit = { format: 'next-chapter-recovery', version: 1, archiveId: randomUUID(), ...sealed, dataId: 'A'.repeat(43) };
  const html = await recoveryHTML(kit);
  assert.ok(!html.includes('onerror=alert'));
  assert.ok(!/<script[^>]+src=/i.test(html));
  assert.ok(!html.includes('innerHTML'));
  const hash = createHash('sha256').update(ARCHIVE_READER_SCRIPT).digest('base64');
  assert.ok(html.includes("script-src 'sha256-" + hash + "'"));
  assert.equal((html.match(/<script/g) ?? []).length, 2);
  assert.ok(html.includes(kit.key));
  new vm.Script(ARCHIVE_READER_SCRIPT);
});

test('배포되는 독립 뷰어 코드로 네트워크 없이 원문을 복구한다', async () => {
  const sealed = await encryptArchive(doc());
  const kit: ArchiveKit = { format: 'next-chapter-recovery', version: 1, archiveId: randomUUID(), ...sealed, dataId: null };
  const nodes = new Map<string, { textContent: string; value: string; type: string; disabled: boolean; onclick?: () => void; oninput?: () => void }>();
  const get = (id: string) => { if (!nodes.has(id)) nodes.set(id, { textContent: '', value: '', type: 'password', disabled: false }); return nodes.get(id)!; };
  get('recovery').textContent = JSON.stringify(kit);
  const context = vm.createContext({ document: { getElementById: get }, crypto, TextEncoder, TextDecoder, Uint8Array, atob, Blob, Response, DecompressionStream });
  vm.runInContext(ARCHIVE_READER_SCRIPT, context);
  const recovered = await vm.runInContext('decrypt(kit.envelope,kit.key)', context);
  assert.deepEqual(JSON.parse(JSON.stringify(recovered)), doc());
  assert.equal(get('remote').disabled, true);
  assert.equal(await vm.runInContext('digest(kit.envelope)', context), kit.digest);
});
