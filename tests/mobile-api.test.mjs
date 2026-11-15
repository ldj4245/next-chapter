import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import ts from 'typescript';

const paths = {
  context: '../src/lib/mobile-context.ts', auth: '../src/lib/mobile-auth.ts', routes: '../src/lib/mobile-routes.ts',
  api: '../src/lib/api.ts', server: '../src/lib/supabase/server.ts',
  route: '../src/app/api/mobile/v1/[...path]/route.ts', config: '../src/app/api/mobile/v1/config/route.ts',
};
const sources = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(new URL(path, import.meta.url), 'utf8')])));
const jwt = payload => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature';
const key = jwt({ role: 'anon' }), tokenA = jwt({ sub: 'user-a' }), tokenB = jwt({ sub: 'user-b' });
const id = '11111111-1111-4111-8111-111111111111';
const request = (path = 'planner', token = tokenA, method = 'GET', extra = {}) => new Request('https://app.example/api/mobile/v1/' + path, {
  method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...extra },
});

function harness({ verify, publishableKey = key } = {}) {
  const modules = {}, logs = [], creations = [], calls = [];
  let cookieReads = 0;
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://project.example', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey, SUPABASE_SERVICE_ROLE_KEY: 'private-service-key' };
  class InputError extends Error { constructor(issues) { super('Invalid'); this.issues = issues; } }
  const handler = name => async (req, context) => {
    if (req && req.method !== 'GET') load('api').assertOrigin(req);
    const session = await load('api').requireSession();
    await Promise.resolve();
    const active = load('context').mobileSession();
    assert.equal(active.user.id, session.user.id);
    if (req) assert.equal(active.request, req);
    calls.push({ name, id: context ? (await context.params).id : undefined, user: session.user.id });
    return load('api').json({ handler: name, user: session.user.id, client: session.client.tag });
  };
  const delegates = {
    '@/app/api/planner/route': { GET: handler('planner') },
    '@/app/api/planner/tasks/route': { POST: handler('tasks') },
    '@/app/api/planner/tasks/[id]/route': { PATCH: handler('task.patch'), DELETE: handler('task.delete') },
    '@/app/api/planner/review/route': { GET: handler('review.get'), PUT: handler('review.put') },
    '@/app/api/planner/routines/apply/route': { POST: handler('routines.apply') },
    '@/app/api/goals/route': { GET: handler('goals.get'), POST: handler('goals.post') },
    '@/app/api/goals/[id]/route': { PATCH: handler('goal.patch'), DELETE: handler('goal.delete') },
    '@/app/api/account/route': { GET: handler('account') },
  };
  const aliases = {
    './api': 'api', '@/lib/api': 'api', './supabase/server': 'server',
    './mobile-context': 'context', '../mobile-context': 'context', '@/lib/mobile-context': 'context',
    '@/lib/mobile-auth': 'auth', '@/lib/mobile-routes': 'routes',
  };
  const deps = {
    'server-only': {}, 'node:async_hooks': { AsyncLocalStorage }, './domain': { InputError },
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    'next/headers': { cookies: async () => { cookieReads++; return { getAll: () => [], set() {} }; } },
    '@supabase/ssr': { createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: 'cookie-user', email: 'cookie@example.com' } }, error: null }) } }) },
    '@supabase/supabase-js': { createClient(url, publicKey, options) {
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
      module: vmModule, exports: vmModule.exports, Request, Response, Headers, URL, Buffer, process: { env },
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
  for (const [path, method, handler] of [
    ['planner', 'GET', 'planner'], ['planner/tasks', 'POST', 'tasks'], ['planner/tasks/' + id, 'PATCH', 'task.patch'],
    ['planner/tasks/' + id, 'DELETE', 'task.delete'], ['planner/review', 'GET', 'review.get'], ['planner/review', 'PUT', 'review.put'],
    ['planner/routines/apply', 'POST', 'routines.apply'],
    ['goals', 'GET', 'goals.get'], ['goals', 'POST', 'goals.post'], ['goals/' + id, 'PATCH', 'goal.patch'], ['goals/' + id, 'DELETE', 'goal.delete'], ['account', 'GET', 'account'],
  ]) {
    const response = await app.invoke(path, tokenA, method);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).handler, handler);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  for (const path of ['admin', 'admin/members', 'account/delete', '../admin', 'goals/not-a-uuid', 'planner/tasks/' + id + '/photos', 'planner/routines', 'planner/routines/' + id, 'auth/login', 'export']) {
    assert.equal((await app.invoke(path, tokenA)).status, 404);
  }
  const wrongMethod = await app.invoke('planner/review', tokenA, 'POST');
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET, PUT');
  const routineMethod = await app.invoke('planner/routines/apply', tokenA, 'GET');
  assert.equal(routineMethod.status, 405);
  assert.equal(routineMethod.headers.get('allow'), 'POST');
  assert.equal(app.calls.length, 12);
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
