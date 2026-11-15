import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import ts from 'typescript';

const paths = {
  context: '../src/lib/mobile-context.ts', auth: '../src/lib/mobile-auth.ts', routes: '../src/lib/mobile-routes.ts',
  accountServer: '../src/lib/account-server.ts', photoServer: '../src/lib/photo-server.ts',
  api: '../src/lib/api.ts', server: '../src/lib/supabase/server.ts',
  route: '../src/app/api/mobile/v1/[...path]/route.ts', config: '../src/app/api/mobile/v1/config/route.ts',
};
const sources = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(new URL(path, import.meta.url), 'utf8')])));
const jwt = payload => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature';
const key = jwt({ role: 'anon' }), tokenA = jwt({ sub: 'user-a' }), tokenB = jwt({ sub: 'user-b' });
const id = '11111111-1111-4111-8111-111111111111';
const bookmarkId = '22222222-2222-4222-8222-222222222222';
const request = (path = 'planner', token = tokenA, method = 'GET', extra = {}) => new Request('https://app.example/api/mobile/v1/' + path, {
  method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...extra },
});

function harness({ verify, publishableKey = key, fetchMock, removeCalls = [] } = {}) {
  const modules = {}, logs = [], creations = [], calls = [];
  let cookieReads = 0;
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://project.example', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey, SUPABASE_SERVICE_ROLE_KEY: 'private-service-key', SUPABASE_STORAGE_SERVICE_ROLE_KEY: 'private-storage-key' };
  class InputError extends Error { constructor(issues) { super('Invalid'); this.issues = issues; } }
  const handler = name => async (req, context) => {
    if (req && req.method !== 'GET') load('api').assertOrigin(req);
    const session = await load('api').requireSession();
    await Promise.resolve();
    const active = load('context').mobileSession();
    assert.equal(active.user.id, session.user.id);
    if (req) assert.equal(active.request, req);
    const resolved = context ? await context.params : undefined;
    calls.push({ name, id: resolved?.id, bookmarkId: resolved?.bookmarkId, user: session.user.id });
    return load('api').json({ handler: name, user: session.user.id, client: session.client.tag, params: resolved });
  };
  const delegates = {
    '@/app/api/planner/route': { GET: handler('planner') },
    '@/app/api/planner/tasks/route': { POST: handler('tasks') },
    '@/app/api/planner/tasks/batch/route': { POST: handler('tasks.batch') },
    '@/app/api/planner/tasks/[id]/route': { PATCH: handler('task.patch'), DELETE: handler('task.delete') },
    '@/app/api/planner/tasks/[id]/photos/route': { GET: handler('task.photos.get'), POST: handler('task.photos.post') },
    '@/app/api/planner/review/route': { GET: handler('review.get'), PUT: handler('review.put') },
    '@/app/api/planner/routines/route': { GET: handler('routines.get'), POST: handler('routines.post') },
    '@/app/api/planner/routines/apply/route': { POST: handler('routines.apply') },
    '@/app/api/planner/routines/[id]/route': { PATCH: handler('routine.patch'), DELETE: handler('routine.delete') },
    '@/app/api/planner/week/route': { GET: handler('week.get') },
    '@/app/api/planner/week-review/route': { GET: handler('weekReview.get'), PUT: handler('weekReview.put') },
    '@/app/api/planner/day-preferences/route': { PUT: handler('dayPreferences.put') },
    '@/app/api/focus/route': { GET: handler('focus.get'), POST: handler('focus.post') },
    '@/app/api/focus/[id]/route': { PATCH: handler('focus.patch') },
    '@/app/api/photos/[id]/route': { DELETE: handler('photo.delete') },
    '@/app/api/photos/[id]/image/route': { GET: handler('photo.image') },
    '@/app/api/partner/route': { GET: handler('partner.get'), DELETE: handler('partner.delete') },
    '@/app/api/partner/invite/route': { GET: handler('partnerInvite.get'), POST: handler('partnerInvite.post'), DELETE: handler('partnerInvite.delete') },
    '@/app/api/partner/accept/route': { POST: handler('partnerAccept.post') },
    '@/app/api/partner/profile/route': { POST: handler('partnerProfile.post') },
    '@/app/api/partner/day/route': { GET: handler('partnerDay.get') },
    '@/app/api/goals/route': { GET: handler('goals.get'), POST: handler('goals.post') },
    '@/app/api/goals/[id]/route': { PATCH: handler('goal.patch'), DELETE: handler('goal.delete') },
    '@/app/api/works/route': { GET: handler('works.get'), POST: handler('works.post') },
    '@/app/api/works/[id]/route': { GET: handler('work.get'), PATCH: handler('work.patch'), DELETE: handler('work.delete') },
    '@/app/api/works/[id]/notes/route': { POST: handler('workNotes.post') },
    '@/app/api/works/[id]/summary/route': { PATCH: handler('workSummary.patch') },
    '@/app/api/notes/[id]/route': { PATCH: handler('note.patch'), DELETE: handler('note.delete') },
    '@/app/api/catalog/route': { GET: handler('catalog.get') },
    '@/app/api/catalog/discover/route': { GET: handler('catalogDiscover.get') },
    '@/app/api/catalog/import/route': { POST: handler('catalogImport.post') },
    '@/app/api/reading/route': { GET: handler('reading.get'), POST: handler('reading.post') },
    '@/app/api/reading/preferences/route': { PATCH: handler('readingPreferences.patch') },
    '@/app/api/reading/[id]/route': { PATCH: handler('readingItem.patch') },
    '@/app/api/resources/route': { GET: handler('resources.get'), POST: handler('resources.post') },
    '@/app/api/resources/preview/route': { POST: handler('resourcesPreview.post') },
    '@/app/api/resources/[id]/route': { GET: handler('resource.get'), PATCH: handler('resource.patch'), DELETE: handler('resource.delete') },
    '@/app/api/resources/[id]/bookmarks/route': { POST: handler('resourceBookmarks.post') },
    '@/app/api/resources/[id]/bookmarks/[bookmarkId]/route': { DELETE: handler('resourceBookmark.delete') },
    '@/app/api/memos/route': { GET: handler('memos.get'), POST: handler('memos.post') },
    '@/app/api/memos/[id]/route': { PATCH: handler('memo.patch'), DELETE: handler('memo.delete') },
    '@/app/api/memos/[id]/convert/route': { POST: handler('memoConvert.post') },
    '@/app/api/search/route': { GET: handler('search.get') },
    '@/app/api/revisit/route': { GET: handler('revisit.get'), POST: handler('revisit.post') },
    '@/app/api/revisit/[id]/route': { DELETE: handler('revisitItem.delete') },
    '@/app/api/account/route': { GET: handler('account') },
    '@/app/api/account/password/route': { POST: handler('accountPassword.post') },
    '@/app/api/account/delete/route': { POST: handler('accountDelete.post') },
    '@/app/api/export/route': { GET: handler('export.get') },
    '@/app/api/archives/route': { GET: handler('archives.get'), POST: handler('archives.post') },
    '@/app/api/archives/snapshot/route': { POST: handler('archivesSnapshot.post') },
    '@/app/api/archives/[id]/route': { GET: handler('archiveItem.get'), POST: handler('archiveItem.post') },
  };
  const aliases = {
    './api': 'api', '@/lib/api': 'api', './supabase/server': 'server',
    './mobile-context': 'context', '../mobile-context': 'context', '@/lib/mobile-context': 'context',
    './mobile-auth': 'auth', '@/lib/mobile-auth': 'auth', '@/lib/mobile-routes': 'routes',
  };
  const deps = {
    'server-only': {}, 'node:async_hooks': { AsyncLocalStorage }, './domain': { InputError },
    './photos': { PHOTO_MAIN_BYTES: 1000000, PHOTO_MAX_PIXELS: 40000000, PHOTO_THUMB_BYTES: 100000, PHOTO_UPLOAD_BYTES: 3145728, photoURLs: pid => ({ url: pid, thumbnail_url: pid }), validatePhotoUpload: () => {} },
    sharp: () => {},
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    'next/headers': { cookies: async () => { cookieReads++; return { getAll: () => [], set() {} }; } },
    '@supabase/ssr': { createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: 'cookie-user', email: 'cookie@example.com' } }, error: null }) } }) },
    '@supabase/supabase-js': { createClient(url, publicKey, options) {
      if (publicKey === 'private-storage-key') {
        return {
          storage: { from: () => ({ remove: async paths => { removeCalls.push(paths); return { error: null }; } }) },
        };
      }
      const token = options.global.headers.Authorization.slice(7);
      creations.push({ url, publicKey, options });
      return { tag: token, auth: { async getUser(receivedToken) {
        assert.equal(receivedToken, token);
        if (verify) return verify(token);
        return { data: { user: { id: token === tokenA ? 'user-a' : 'user-b', email: 'reader@example.com', is_anonymous: false } }, error: null };
      } } };
    } },
  };
  function load(name) {
    if (modules[name]) return modules[name].exports;
    const vmModule = { exports: {} }; modules[name] = vmModule;
    vm.runInNewContext(ts.transpileModule(sources[name], { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: vmModule, exports: vmModule.exports, Request, Response, Headers, URL, Buffer, process: { env }, AbortSignal,
      fetch: fetchMock ?? (async () => { throw new Error('Unexpected fetch'); }),
      console: { error: (...values) => logs.push(values.join(' ')) },
      require(dependency) {
        if (dependency in aliases) return load(aliases[dependency]);
        if (dependency in delegates) return delegates[dependency];
        assert.ok(dependency in deps, 'Unexpected dependency: ' + dependency);
        return deps[dependency];
      },
    });
    return vmModule.exports;
  }
  return { load, env, creations, calls, logs, cookieReads: () => cookieReads,
    invoke: (path, token, method = 'GET', headers) => load('route')[method](request(path, token, method, headers), { params: Promise.resolve({ path: path.split('/') }) }),
  };
}

test('모바일 API는 허용한 경로와 메서드만 기존 처리기로 전달한다', async () => {
  const app = harness();
  const allowed = [
    ['planner', 'GET', 'planner'],
    ['planner/tasks', 'POST', 'tasks'],
    ['planner/tasks/batch', 'POST', 'tasks.batch'],
    ['planner/tasks/' + id, 'PATCH', 'task.patch'],
    ['planner/tasks/' + id, 'DELETE', 'task.delete'],
    ['planner/tasks/' + id + '/photos', 'GET', 'task.photos.get'],
    ['planner/tasks/' + id + '/photos', 'POST', 'task.photos.post'],
    ['planner/review', 'GET', 'review.get'],
    ['planner/review', 'PUT', 'review.put'],
    ['planner/routines', 'GET', 'routines.get'],
    ['planner/routines', 'POST', 'routines.post'],
    ['planner/routines/apply', 'POST', 'routines.apply'],
    ['planner/routines/' + id, 'PATCH', 'routine.patch'],
    ['planner/routines/' + id, 'DELETE', 'routine.delete'],
    ['planner/week', 'GET', 'week.get'],
    ['planner/week-review', 'GET', 'weekReview.get'],
    ['planner/week-review', 'PUT', 'weekReview.put'],
    ['planner/day-preferences', 'PUT', 'dayPreferences.put'],
    ['focus', 'GET', 'focus.get'],
    ['focus', 'POST', 'focus.post'],
    ['focus/' + id, 'PATCH', 'focus.patch'],
    ['photos/' + id, 'DELETE', 'photo.delete'],
    ['photos/' + id + '/image', 'GET', 'photo.image'],
    ['partner', 'GET', 'partner.get'],
    ['partner', 'DELETE', 'partner.delete'],
    ['partner/invite', 'GET', 'partnerInvite.get'],
    ['partner/invite', 'POST', 'partnerInvite.post'],
    ['partner/invite', 'DELETE', 'partnerInvite.delete'],
    ['partner/accept', 'POST', 'partnerAccept.post'],
    ['partner/profile', 'POST', 'partnerProfile.post'],
    ['partner/day', 'GET', 'partnerDay.get'],
    ['goals', 'GET', 'goals.get'],
    ['goals', 'POST', 'goals.post'],
    ['goals/' + id, 'PATCH', 'goal.patch'],
    ['goals/' + id, 'DELETE', 'goal.delete'],
    ['works', 'GET', 'works.get'],
    ['works', 'POST', 'works.post'],
    ['works/' + id, 'GET', 'work.get'],
    ['works/' + id, 'PATCH', 'work.patch'],
    ['works/' + id, 'DELETE', 'work.delete'],
    ['works/' + id + '/notes', 'POST', 'workNotes.post'],
    ['works/' + id + '/summary', 'PATCH', 'workSummary.patch'],
    ['notes/' + id, 'PATCH', 'note.patch'],
    ['notes/' + id, 'DELETE', 'note.delete'],
    ['catalog', 'GET', 'catalog.get'],
    ['catalog/discover', 'GET', 'catalogDiscover.get'],
    ['catalog/import', 'POST', 'catalogImport.post'],
    ['reading', 'GET', 'reading.get'],
    ['reading', 'POST', 'reading.post'],
    ['reading/preferences', 'PATCH', 'readingPreferences.patch'],
    ['reading/' + id, 'PATCH', 'readingItem.patch'],
    ['resources', 'GET', 'resources.get'],
    ['resources', 'POST', 'resources.post'],
    ['resources/preview', 'POST', 'resourcesPreview.post'],
    ['resources/' + id, 'GET', 'resource.get'],
    ['resources/' + id, 'PATCH', 'resource.patch'],
    ['resources/' + id, 'DELETE', 'resource.delete'],
    ['resources/' + id + '/bookmarks', 'POST', 'resourceBookmarks.post'],
    ['resources/' + id + '/bookmarks/' + bookmarkId, 'DELETE', 'resourceBookmark.delete'],
    ['memos', 'GET', 'memos.get'],
    ['memos', 'POST', 'memos.post'],
    ['memos/' + id, 'PATCH', 'memo.patch'],
    ['memos/' + id, 'DELETE', 'memo.delete'],
    ['memos/' + id + '/convert', 'POST', 'memoConvert.post'],
    ['search', 'GET', 'search.get'],
    ['revisit', 'GET', 'revisit.get'],
    ['revisit', 'POST', 'revisit.post'],
    ['revisit/' + id, 'DELETE', 'revisitItem.delete'],
    ['account', 'GET', 'account'],
    ['account/password', 'POST', 'accountPassword.post'],
    ['account/delete', 'POST', 'accountDelete.post'],
    ['export', 'GET', 'export.get'],
    ['archives', 'GET', 'archives.get'],
    ['archives', 'POST', 'archives.post'],
    ['archives/snapshot', 'POST', 'archivesSnapshot.post'],
    ['archives/' + id, 'GET', 'archiveItem.get'],
    ['archives/' + id, 'POST', 'archiveItem.post'],
  ];
  for (const [path, method, handler] of allowed) {
    const response = await app.invoke(path, tokenA, method);
    assert.equal(response.status, 200, path + ' ' + method);
    const body = await response.json();
    assert.equal(body.handler, handler);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  const bookmarkCall = app.calls.find(call => call.name === 'resourceBookmark.delete');
  assert.equal(bookmarkCall.id, id);
  assert.equal(bookmarkCall.bookmarkId, bookmarkId);

  for (const path of ['admin', 'admin/members', 'admin/audit', 'admin/photos/' + id, '../admin', 'goals/not-a-uuid', 'resources/' + id + '/bookmarks/not-a-uuid', 'auth/login', 'auth/signup']) {
    assert.equal((await app.invoke(path, tokenA)).status, 404, path);
  }
  const wrongMethod = await app.invoke('planner/review', tokenA, 'POST');
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET, PUT');
  const routineMethod = await app.invoke('planner/routines/apply', tokenA, 'GET');
  assert.equal(routineMethod.status, 405);
  assert.equal(routineMethod.headers.get('allow'), 'POST');
  assert.equal(app.calls.length, allowed.length);
});

test('모바일 API는 웹 쿠키로 대체 인증하지 않고 잘못된 Bearer를 거절한다', async () => {
  const app = harness();
  for (const authorization of ['', 'Basic anything', 'Bearer invalid', 'Bearer ' + tokenA + ', Bearer ' + tokenB, 'Bearer ' + 'a'.repeat(8200)]) {
    const response = await app.invoke('planner', null, 'GET', { cookie: 'sb-session=browser-session', authorization });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('location'), null);
  }
  assert.equal(app.creations.length, 0);
  assert.equal(app.cookieReads(), 0);
});

test('인증은 원격 사용자 검증을 거치고 사용자 JWT로만 데이터 클라이언트를 만든다', async () => {
  const app = harness();
  const response = await app.invoke('planner', tokenA);
  assert.equal((await response.json()).user, 'user-a');
  const made = app.creations[0];
  assert.equal(made.publicKey, key);
  assert.equal(made.options.global.headers.Authorization, 'Bearer ' + tokenA);
  assert.equal(made.options.auth.persistSession, false);
  assert.equal(made.options.auth.autoRefreshToken, false);
  assert.equal(made.options.auth.detectSessionInUrl, false);
  assert.equal(app.cookieReads(), 0);
});

test('만료·폐기 인증은 401, 일시적인 인증 서버 오류는 502 또는 429로 구분한다', async () => {
  for (const [error, status] of [[{ status: 401 }, 401], [{ status: 403 }, 401], [{ status: 400, code: 'bad_jwt' }, 401], [{ status: 503 }, 502], [{ status: 429 }, 429]]) {
    const app = harness({ verify: async () => ({ data: { user: null }, error }) });
    assert.equal((await app.invoke('planner', tokenA)).status, status);
    assert.equal(app.calls.length, 0);
  }
  for (const user of [null, { id: 'anonymous', email: 'reader@example.com', is_anonymous: true }, { id: 'missing-email' }]) {
    const app = harness({ verify: async () => ({ data: { user }, error: null }) });
    assert.equal((await app.invoke('planner', tokenA)).status, 401);
  }
});

test('동시 모바일 요청은 사용자와 클라이언트를 섞지 않고 완료·실패 후 컨텍스트를 남기지 않는다', async () => {
  const pending = [];
  const app = harness({ verify: token => new Promise(resolve => pending.push(() => resolve({ data: { user: { id: token === tokenA ? 'user-a' : 'user-b', email: 'reader@example.com' } }, error: null }))) });
  const first = app.invoke('planner', tokenA), second = app.invoke('goals', tokenB);
  while (pending.length < 2) await Promise.resolve();
  pending[1](); pending[0]();
  const a = await (await first).json(), b = await (await second).json();
  assert.equal(a.user, 'user-a'); assert.equal(a.client, tokenA);
  assert.equal(b.user, 'user-b'); assert.equal(b.client, tokenB);
  assert.equal(app.load('context').mobileSession(), undefined);
  const fake = { request: request(), user: { id: 'a', email: 'a@example.com' }, client: {} };
  await assert.rejects(app.load('context').withMobileSession(fake, async () => { await Promise.resolve(); throw new Error('test failure'); }), /test failure/);
  assert.equal(app.load('context').mobileSession(), undefined);
});

test('출처 검사 예외는 검증된 모바일 요청 객체 하나에만 적용되고 웹에는 기존 검사가 남는다', async () => {
  const app = harness(), scoped = request('planner/tasks', tokenA, 'POST', { origin: 'https://elsewhere.example', 'sec-fetch-site': 'cross-site' });
  const cloned = scoped.clone();
  assert.throws(() => app.load('api').assertOrigin(scoped), error => error.status === 403);
  await app.load('context').withMobileSession({ request: scoped, user: { id: 'a', email: 'a@example.com' }, client: {} }, async () => {
    app.load('api').assertOrigin(scoped);
    assert.throws(() => app.load('api').assertOrigin(cloned), error => error.status === 403);
    await Promise.resolve();
    app.load('api').assertOrigin(scoped);
  });
  assert.throws(() => app.load('api').assertOrigin(scoped), error => error.status === 403);
  const cookieSession = await app.load('api').requireSession();
  assert.equal(cookieSession.user.id, 'cookie-user');
  assert.ok(app.cookieReads() > 0);
});

test('공개 앱 설정은 URL과 공개 키 두 항목만 반환하고 비밀 키 설정은 노출하지 않는다', async () => {
  for (const publicKey of [key, 'sb_publishable_example']) {
    const app = harness({ publishableKey: publicKey });
    const response = await app.load('config').GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { supabaseUrl: 'https://project.example', publishableKey: publicKey });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  for (const badKey of [jwt({ role: 'service_role' }), ['sb', 'secret', 'example'].join('_'), 'not-a-public-key', '']) {
    const app = harness({ publishableKey: badKey });
    const response = await app.load('config').GET();
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes(badKey || 'private-service-key'));
  }
});

test('모바일 세션에서 계정 확인과 비밀번호 변경, 사진 파일 정리가 쿠키 없이 동작한다', async () => {
  const fetchCalls = [], removeCalls = [];
  const app = harness({
    removeCalls,
    fetchMock: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      const body = JSON.parse(init.body);
      if (body.password === 'weakpass123') return Response.json({ error_code: 'weak_password' }, { status: 422 });
      if (body.password === 'samepass1234') return Response.json({ code: 'same_password' }, { status: 422 });
      return Response.json({ id: '11111111-1111-4111-8111-111111111111' }, { status: 200 });
    },
  });
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const taskId = '22222222-2222-4222-8222-222222222222';
  const photoId = '33333333-3333-4333-8333-333333333333';
  const client = {
    auth: {
      async getUser(receivedToken) {
        assert.equal(receivedToken, tokenA);
        return { data: { user: { id: ownerId, email: 'reader@example.com' } }, error: null };
      },
      async getClaims() { throw new Error('Must not read session claims in mobile context'); },
      async updateUser() { throw new Error('Must not call cookie updateUser in mobile context'); },
    },
    from: () => ({ delete: () => ({ in: async () => ({ error: null }) }) }),
  };
  await app.load('context').withMobileSession({ request: request('account/password', tokenA, 'POST'), user: { id: ownerId, email: 'reader@example.com' }, client, token: tokenA }, async () => {
    const accountSession = await app.load('accountServer').requireAccountSession();
    assert.equal(accountSession.user.id, ownerId);
    await app.load('accountServer').updateAccountPassword(client, 'newvalidpass123');
    assert.equal(fetchCalls[0].url, 'https://project.example/auth/v1/user');
    assert.equal(fetchCalls[0].init.method, 'PUT');
    assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer ' + tokenA);
    assert.equal(fetchCalls[0].init.headers.apikey, key);
    await assert.rejects(
      app.load('accountServer').updateAccountPassword(client, 'weakpass123'),
      error => error.issues?.password?.includes('추측하기 어려운'),
    );
    await assert.rejects(
      app.load('accountServer').updateAccountPassword(client, 'samepass1234'),
      error => error.issues?.password?.includes('다른 비밀번호'),
    );
    const validPath = `${ownerId}/${taskId}/${photoId}/image.webp`;
    await app.load('photoServer').removePhotoFiles(client, [validPath]);
    assert.deepEqual(removeCalls, [[validPath]]);
    const otherOwnerPath = `99999999-9999-4999-8999-999999999999/${taskId}/${photoId}/image.webp`;
    await assert.rejects(
      app.load('photoServer').removePhotoFiles(client, [otherOwnerPath]),
      error => error.status === 404,
    );
  });
});
