import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { prepareStorage } from './storage-fixture.mjs';
import { InputError, object } from '../src/lib/domain.ts';
import { weekStart } from '../src/lib/day-flow.ts';
import { parseReview } from '../src/lib/planner.ts';
import { parseReflection } from '../src/lib/reflection.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

test('week-review PUT 핸들러는 같은 이전본의 중복 저장을 409로 거부하고 최신 문서를 보존한다', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;");
    await prepareStorage(db);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    }
    const alice = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users values($1)', [alice]);
    await db.exec('reset role; set role authenticated;');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice]);

    const client = {
      from(table) {
        assert.equal(table, 'planner_week_reviews');
        let dayFilter = null;
        const builder = {
          select() { return builder; },
          eq(column, value) { if (column === 'day') dayFilter = value; return builder; },
          async maybeSingle() {
            const rows = (await db.query('select day::text as day, document, revision, created_at, updated_at from planner_week_reviews where user_id = auth.uid() and day = $1', [dayFilter])).rows;
            return { data: rows[0] ?? null, error: null };
          },
        };
        return builder;
      },
      async rpc(fn, params) {
        assert.equal(fn, 'save_week_review');
        try {
          const rows = (await db.query('select save_week_review($1, $2, $3) as review', [params.p_day, params.p_expected_revision, JSON.stringify(params.p_document)])).rows;
          return { data: rows[0].review, error: null };
        } catch (error) {
          return { data: null, error: { code: error.code, message: error.message } };
        }
      },
    };

    const stubs = {
      '@/lib/api': {
        HttpError,
        assertOrigin() {},
        failure(error) {
          if (error instanceof InputError) return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
          if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
          return Response.json({ error: String(error) }, { status: 500 });
        },
        json: (value, status = 200) => Response.json(value, { status }),
        readBody: request => request.json(),
        requireSession: async () => ({ user: { id: alice }, client }),
      },
      '@/lib/domain': { InputError, object },
      '@/lib/day-flow': { weekStart },
      '@/lib/planner': { parseReview },
      '@/lib/reflection': { parseReflection },
      '@/lib/planner-server': {
        plannerFailure(error) {
          if (!error) return;
          if (error.code === '23514') throw new HttpError(400, '입력 내용을 확인해주세요.');
          throw new Error(error.code ?? 'PLANNER_DATABASE_FAILED');
        },
      },
    };

    const routeUrl = new URL('../src/app/api/planner/week-review/route.ts', import.meta.url);
    const source = await readFile(routeUrl, 'utf8');
    const mod = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      module: mod,
      exports: mod.exports,
      require: name => { assert.ok(name in stubs, 'Unexpected import: ' + name); return stubs[name]; },
      Response,
      URL,
      Date,
    });

    const doc = text => ({
      version: 1,
      blocks: [{ id: '11111111-1111-4111-8111-111111111111', kind: 'paragraph', text, checked: false }],
    });
    const send = (text, revision) => mod.exports.PUT(new Request('https://fixture.example/api/planner/week-review', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ day: '2026-11-16', document: doc(text), ...(revision === undefined ? {} : { revision }) }),
    }));

    const first = await send('기기 A에서 추가한 회고', 0);
    assert.equal(first.status, 200);
    const firstJson = await first.json();
    assert.equal(firstJson.review.revision, 1);
    assert.equal(firstJson.review.document.blocks[0].text, '기기 A에서 추가한 회고');

    const staleZero = await send('기기 B에서 같은 이전본을 수정한 회고', 0);
    assert.equal(staleZero.status, 409);

    const staleOmitted = await send('revision 생략 덮어쓰기 시도', undefined);
    assert.equal(staleOmitted.status, 409);

    for (const invalidRevision of [-1, 1.5, '1']) {
      const bad = await send('잘못된 revision', invalidRevision);
      assert.equal(bad.status, 400);
    }

    const fetchedAfterConflict = await mod.exports.GET(new Request('https://fixture.example/api/planner/week-review?day=2026-11-18'));
    assert.equal(fetchedAfterConflict.status, 200);
    const fetchedJson = await fetchedAfterConflict.json();
    assert.equal(fetchedJson.review.revision, 1);
    assert.equal(fetchedJson.review.document.blocks[0].text, '기기 A에서 추가한 회고');
    assert.deepEqual(Object.keys(fetchedJson.review).sort(), Object.keys(firstJson.review).sort());

    const updated = await send('기기 B에서 병합 후 최신 저장', 1);
    assert.equal(updated.status, 200);
    const updatedJson = await updated.json();
    assert.equal(updatedJson.review.revision, 2);
    assert.equal(updatedJson.review.document.blocks[0].text, '기기 B에서 병합 후 최신 저장');
  } finally { await db.close(); }
});

test('WeeklyBody refresh는 주간 실행과 주간 회고를 함께 다시 읽어 Reflection 키를 갱신한다', async () => {
  const source = await readFile(new URL('../src/components/weekly-review.tsx', import.meta.url), 'utf8');
  const slots = [], requests = [], reflections = [];
  let cursor = 0;
  const jsx = (type, props, key) => ({ type, props, key });
  const weeklyMod = { exports: {} };
  const initialWeek = {
    week: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'],
    tasks: [],
    sessions: [],
    reviews: [],
  };
  const refreshedWeek = {
    ...initialWeek,
    tasks: [{ id: 't1', day: '2026-11-16', title: '새 할 일', status: 'completed' }],
  };
  const refreshedReview = {
    day: '2026-11-16',
    revision: 3,
    document: { version: 1, blocks: [{ id: 'b2', kind: 'paragraph', text: '원격 최신 주간 회고', checked: false }] },
    created_at: '2026-11-16T00:00:00Z',
    updated_at: '2026-11-16T01:00:00Z',
  };
  const deps = {
    react: {
      useEffect() {},
      useState(init) {
        const idx = cursor++;
        if (!(idx in slots)) slots[idx] = typeof init === 'function' ? init() : init;
        return [slots[idx], v => { slots[idx] = typeof v === 'function' ? v(slots[idx]) : v; }];
      },
      useRef: init => ({ current: init }),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/link': { default: 'Link' },
    'lucide-react': { ArrowRight: 'ArrowRight', ChevronDown: 'ChevronDown', RefreshCw: 'RefreshCw' },
    '@/lib/day-flow': {
      durationLabel: s => `${s}초`,
      executionSummary: tasks => ({ total: tasks.length, completed: tasks.filter(t => t.status === 'completed').length, seconds: 0, reasons: [] }),
    },
    '@/lib/goal-metrics': {},
    '@/lib/planner': {
      dayLabel: d => d,
      emptyReview: { helped: '', hindered: '', gained: '', next_step: '' },
      plannerWeek: d => [d],
      REASONS: {},
      TASK_STATES: { completed: '완료' },
    },
    '@/lib/reflection': { hasReflectionContent: () => false, reflectionOf: d => d },
    './api-client': {
      request: async url => {
        requests.push(url);
        if (url.startsWith('/api/planner/week?')) return refreshedWeek;
        if (url.startsWith('/api/planner/week-review?')) return { review: refreshedReview };
        throw new Error('Unexpected URL: ' + url);
      },
      useResource: () => ({ data: null, error: '', refresh() {} }),
    },
    './editor': { prepareDocumentNavigation: async () => true },
    './reflection': {
      Reflection: function ReflectionStub(props) { reflections.push(props); return null; },
      ReflectionContent: 'ReflectionContent',
    },
    './ui': { ErrorMessage: 'ErrorMessage' },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: weeklyMod,
    exports: weeklyMod.exports,
    require: name => { assert.ok(name in deps, 'Unexpected dep: ' + name); return deps[name]; },
  });

  const walk = (node, pred) => {
    if (!node || typeof node !== 'object') return null;
    if (pred(node)) return node;
    const ch = node.props?.children;
    for (const child of Array.isArray(ch) ? ch : [ch]) {
      const hit = walk(child, pred);
      if (hit) return hit;
    }
    return null;
  };
  const render = () => {
    cursor = 0;
    return weeklyMod.exports.WeeklyBody({
      data: initialWeek,
      initialReview: { day: '2026-11-16', revision: 1, document: { version: 1, blocks: [{ id: 'b1', kind: 'paragraph', text: '이전 주간 회고', checked: false }] } },
      onTask() {},
    });
  };
  const firstTree = render();
  const firstReflection = walk(firstTree, n => n.type === deps['./reflection'].Reflection);
  assert.equal(firstReflection.key, '2026-11-16:0');
  const refreshBtn = walk(firstTree, n => n.type === 'button' && n.props?.['aria-label'] === '이번 주 실행 기록 새로 읽기');
  await refreshBtn.props.onClick();
  assert.deepEqual(requests, ['/api/planner/week?day=2026-11-16', '/api/planner/week-review?day=2026-11-16']);
  const nextTree = render();
  const nextReflection = walk(nextTree, n => n.type === deps['./reflection'].Reflection);
  assert.equal(nextReflection.key, '2026-11-16:1');
  assert.equal(nextReflection.props.review.revision, 3);
  assert.equal(nextReflection.props.review.document.blocks[0].text, '원격 최신 주간 회고');
});
