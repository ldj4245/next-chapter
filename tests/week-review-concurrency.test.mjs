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

    const updated = await send('기기 B에서 병합 후 최신 저장', 1);
    assert.equal(updated.status, 200);
    const updatedJson = await updated.json();
    assert.equal(updatedJson.review.revision, 2);
    assert.equal(updatedJson.review.document.blocks[0].text, '기기 B에서 병합 후 최신 저장');
  } finally { await db.close(); }
});
