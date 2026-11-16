import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { InputError, object, uuid } from '../src/lib/domain.ts';
import { parseTask, parseDay, taskColumns } from '../src/lib/planner.ts';
import { parseTaskSharing } from '../src/lib/partner.ts';
import { parseReadingDetails } from '../src/lib/reading.ts';
import { parseMemoConversion } from '../src/lib/memory.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function loadRoute(relPath, stubs) {
  const source = await readFile(new URL('../' + relPath, import.meta.url), 'utf8');
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: mod,
    exports: mod.exports,
    require: name => { assert.ok(name in stubs, `${relPath} unexpected import: ${name}`); return stubs[name]; },
    Request, Response, URL, Date, Map, Set, Promise, Error, Object,
  });
  return mod.exports;
}

const commonApiStub = (overrides = {}) => ({
  HttpError,
  assertOrigin(req) { if (req.headers.get('origin') === 'https://evil.example') throw new HttpError(403, '요청 출처를 확인해주세요.'); },
  failure(error) {
    if (error instanceof InputError) return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  },
  json: (value, status = 200) => Response.json(value, { status }),
  readBody: req => req.json(),
  ...overrides,
});

test('/api/planner/tasks POST는 원자적 공유 생성과 중복 ID 멱등성을 보장한다', async () => {
  const stored = new Map();
  let shareCalls = 0;
  const fakeClient = {
    from(table) {
      assert.equal(table, 'daily_tasks');
      return {
        upsert(row) {
          if (!stored.has(row.id)) stored.set(row.id, { ...row });
          return {
            select() {
              return {
                async maybeSingle() { return { data: stored.get(row.id), error: null }; },
              };
            },
          };
        },
        select() {
          let filterId = null;
          const q = {
            eq(col, val) { if (col === 'id') filterId = val; return q; },
            async maybeSingle() { return { data: stored.get(filterId) ?? null, error: null }; },
          };
          return q;
        },
      };
    },
  };
  const route = await loadRoute('src/app/api/planner/tasks/route.ts', {
    '@/lib/api': commonApiStub({ requireSession: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, client: fakeClient }) }),
    '@/lib/domain': { object, uuid },
    '@/lib/planner': { parseTask, taskColumns },
    '@/lib/planner-server': { async checkTaskLinks() {}, plannerFailure(e) { if (e) throw new Error(e.code ?? e.message); } },
    '@/lib/partner': { parseTaskSharing },
    '@/lib/partner-server': {
      partnerFailure(e) { if (e) throw new HttpError(409, '연결 확인 필요'); },
      async sharedTaskConnection(_c, _u, shared, connId) {
        if (!shared) return null;
        shareCalls++;
        return connId ?? '33333333-3333-4333-8333-333333333333';
      },
    },
  });

  const taskId = '22222222-2222-4222-8222-222222222222';
  const req = body => new Request('https://app.example/api/planner/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const first = await route.POST(req({ id: taskId, day: '2026-11-16', title: '함께 운동', shared: true, public_note: '저녁 7시' }));
  assert.equal(first.status, 201);
  const firstData = await first.json();
  assert.equal(firstData.task.shared, true);
  assert.equal(firstData.task.public_note, '저녁 7시');
  assert.equal(firstData.task.shared_connection_id, '33333333-3333-4333-8333-333333333333');
  assert.equal(shareCalls, 1);

  const retry = await route.POST(req({ id: taskId, day: '2026-11-16', title: '중복 재시도', shared: false }));
  assert.equal(retry.status, 201);
  const retryData = await retry.json();
  assert.equal(retryData.task.title, '함께 운동');

  const badUuid = await route.POST(req({ id: 'not-a-uuid', day: '2026-11-16', title: '실패' }));
  assert.equal(badUuid.status, 400);
});

test('/api/reading/[id] PATCH는 정수 페이지 범위와 할 일 타이머 가드를 검증한다', async () => {
  let existingRow = { is_reading: true, task_title: '할 일 연결' };
  const rpcCalls = [];
  const route = await loadRoute('src/app/api/reading/[id]/route.ts', {
    '@/lib/api': commonApiStub({ requireSession: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, client: {
      from() {
        const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { return { data: existingRow, error: null }; } };
        return q;
      },
      async rpc(fn, params) { rpcCalls.push({ fn, params }); return { data: { id: params.p_id, end_page: params.p_progress }, error: null }; },
    } }) }),
    '@/lib/domain': { object, uuid, InputError },
    '@/lib/reading': { parseReadingDetails },
  });
  const ctx = { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) };
  const patch = body => route.PATCH(new Request('https://app.example/api/reading/2222', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), ctx);

  const ok = await patch({ action: 'details', progress: 42 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).session.end_page, 42);
  assert.equal(rpcCalls[0].params.p_progress, 42);

  const taskPauseBlocked = await patch({ action: 'pause' });
  assert.equal(taskPauseBlocked.status, 409);

  const badPage = await patch({ action: 'details', progress: -1 });
  assert.equal(badPage.status, 400);
});

test('/api/memos/[id]/convert POST와 /api/partner/day GET 계약을 검증한다', async () => {
  const convertRoute = await loadRoute('src/app/api/memos/[id]/convert/route.ts', {
    '@/lib/api': commonApiStub({ requireSession: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, client: {
      async rpc(_fn, params) { return { data: { id: params.p_id, converted_kind: params.p_kind }, error: null }; },
    } }) }),
    '@/lib/domain': { uuid },
    '@/lib/memory': { parseMemoConversion },
    '@/lib/memory-server': {
      conversionResponse: async (_c, _u, memo) => ({ memo, target: { kind: memo.converted_kind, href: '/?day=2026-11-16' } }),
      memoryFailure(e) { if (e) throw new Error(e.message); },
    },
  });
  const converted = await convertRoute.POST(new Request('https://app.example/api/memos/2222/convert', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'task', day: '2026-11-16', revision: 1 }),
  }), { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) });
  assert.equal(converted.status, 200);
  assert.equal((await converted.json()).target.href, '/?day=2026-11-16');

  const partnerDayRoute = await loadRoute('src/app/api/partner/day/route.ts', {
    '@/lib/api': commonApiStub({ requireSession: async () => ({ client: {
      async rpc(fn, args) { assert.equal(fn, 'partner_day'); assert.equal(args.p_day, '2026-11-16'); return { data: { connection_id: 'conn-1', nickname: '짝', activities: [{ id: 'a1', title: '공유됨' }] }, error: null }; },
    } }) }),
    '@/lib/planner': { parseDay },
    '@/lib/partner-server': { partnerFailure(e) { if (e) throw new HttpError(404, '연결 없음'); } },
  });
  const peerOk = await partnerDayRoute.GET(new Request('https://app.example/api/partner/day?day=2026-11-16'));
  assert.equal(peerOk.status, 200);
  assert.equal((await peerOk.json()).activities.length, 1);
  const peerBadDay = await partnerDayRoute.GET(new Request('https://app.example/api/partner/day?day=2026-02-31'));
  assert.equal(peerBadDay.status, 400);
});

test('/api/auth/login POST와 /api/admin/overview GET의 권한·출처·입력 가드를 검증한다', async () => {
  let signInArgs = null;
  const loginRoute = await loadRoute('src/app/api/auth/login/route.ts', {
    '@/lib/api': commonApiStub(),
    '@/lib/supabase/server': {
      configured: () => true,
      serverClient: async () => ({ auth: { signInWithPassword: async args => { signInArgs = args; return { error: args.password === 'wrong' ? new Error('invalid') : null }; } } }),
    },
    '@/lib/domain': { object },
  });
  const evilOrigin = await loginRoute.POST(new Request('https://app.example/api/auth/login', {
    method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@example.com', password: 'secret' }),
  }));
  assert.equal(evilOrigin.status, 403);

  const longEmail = await loginRoute.POST(new Request('https://app.example/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a'.repeat(321), password: 'secret' }),
  }));
  assert.equal(longEmail.status, 400);

  const badPass = await loginRoute.POST(new Request('https://app.example/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: '  Reader@Example.com ', password: 'wrong' }),
  }));
  assert.equal(badPass.status, 401);
  assert.equal(signInArgs.email, 'Reader@Example.com');
  assert.equal(signInArgs.password, 'wrong');

  const adminServer = await loadRoute('src/lib/admin-server.ts', {
    'server-only': {},
    './api': commonApiStub(),
    './account-server': { requireAccountSession: async () => ({ client: { async rpc() { return { data: false, error: null }; } } }) },
    './supabase/server': { serverClient: async () => ({ async rpc() { return { data: false, error: null }; } }) },
  });
  await assert.rejects(() => adminServer.requireAdminSession(), err => err instanceof HttpError && err.status === 403);
  assert.throws(() => adminServer.adminFailure({ code: 'P0002' }), err => err instanceof HttpError && err.status === 404);

  const adminDenied = await loadRoute('src/app/api/admin/overview/route.ts', {
    '@/lib/api': commonApiStub(),
    '@/lib/admin-server': adminServer,
  });
  const forbidden = await adminDenied.GET();
  assert.equal(forbidden.status, 403);
});
