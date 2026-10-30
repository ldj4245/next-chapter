import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { prepareStorage } from './storage-fixture.mjs';

test('통합 검색은 모든 출처를 DB에서 검색하고 상대·익명 차단, 기호 리터럴, 500개 이후 및 30개 페이지를 보장', async () => {
  const db = new PGlite(), alice = randomUUID(), bob = randomUUID(), pair = randomUUID();
  const asUser = async id => { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  const search = async (q, kind = 'all', offset = 0) => (await db.query('select public.search_private_records($1,$2,$3) as result', [q, kind, offset])).rows[0].result;
  const document = text => JSON.stringify({ version: 1, blocks: [{ id: randomUUID(), kind: 'paragraph', text, checked: false }] });
  try {
    await db.exec("create role anon; create role authenticated; create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,supabase_auth_admin; grant select,delete on auth.users to supabase_auth_admin;");
    await prepareStorage(db);
    const folder = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(folder)).filter(name => name.endsWith('.sql') && name <= '202610290002_search.sql').sort()) await db.exec(await readFile(new URL(name, folder), 'utf8'));
    await db.query('insert into auth.users values($1),($2)', [alice, bob]);
    const [a, b] = [alice, bob].sort();
    await db.query('insert into partner_connections(id,user_a,user_b) values($1,$2,$3)', [pair, a, b]);
    await db.query('insert into partner_members(user_id,connection_id) values($1,$3),($2,$3)', [alice, bob, pair]);
    const fixtures = [];
    for (const owner of [alice, bob]) {
      const prefix = owner === alice ? '공통' : '상대만의기록 공통';
      const work = randomUUID(), note = randomUUID(), task = randomUUID(), goal = randomUUID(), session = randomUUID(), memo = randomUUID(), organized = randomUUID(), revisit = randomUUID();
      await db.query("insert into works(id,user_id,title,kind,creator,summary,tags) values($1,$2,$3,'book',$4,$5,$6)", [work, owner, prefix + ' worktitle', prefix + ' workcreator', prefix + ' worksummary', [prefix + ' worktag']]);
      await db.query('insert into notes(id,user_id,work_id,content,thought) values($1,$2,$3,$4,$5)', [note, owner, work, prefix + ' notecontent', prefix + ' notethought']);
      await db.query("insert into planner_goals(id,user_id,title,period,motivation) values($1,$2,$3,'long',$4)", [goal, owner, prefix + ' goaltitle', prefix + ' goalwhy']);
      await db.query("insert into daily_tasks(id,user_id,day,title,status,reason,reason_detail,note,public_note,shared,shared_connection_id) values($1,$2,'2026-10-29',$3,'partial','time',$4,$5,$6,true,$7)", [task, owner, prefix + ' tasktitle', prefix + ' taskreason', prefix + ' tasknote', prefix + ' taskpublic', pair]);
      await db.query("insert into daily_reviews(user_id,day,helped,hindered,gained,next_step,document) values($1,'2026-10-29',$2,$3,$4,$5,$6)", [owner, prefix + ' reviewhelped', prefix + ' reviewhindered', prefix + ' reviewgained', prefix + ' reviewnext', document(prefix + ' reviewdoc')]);
      await db.query("insert into daily_reviews(user_id,day,helped,hindered,gained,next_step) values($1,'2026-10-28','예전 양식 reviewhelped','예전 양식 reviewhindered','예전 양식 reviewgained','예전 양식 reviewnext')",[owner]);
      await db.query("insert into planner_week_reviews(user_id,day,document) values($1,'2026-10-26',$2)", [owner, document(prefix + ' weekdoc')]);
      await db.query("insert into reading_sessions(id,user_id,work_title,task_title,memo,status,finished_at,reading_day,running_since) values($1,$2,$3,$4,$5,'completed',now(),'2026-10-29',null)", [session, owner, prefix + ' sessionwork', prefix + ' sessiontitle', prefix + ' sessionmemo']);
      await db.query('insert into quick_memos(id,user_id,content) values($1,$2,$3)', [memo, owner, prefix + ' memotext']);
      await db.query("insert into quick_memos(id,user_id,content,converted_kind,converted_id,converted_day,converted_at) values($1,$2,$3,'task',$4,'2026-10-27',now())", [organized, owner, prefix + ' organizedtext', task]);
      await db.query("insert into record_revisits(id,user_id,source_kind,source_day,source_date,source_title,source_text,thought) values($1,$2,'review','2026-10-29','2026-10-29',$3,$4,$5)", [revisit, owner, prefix + ' revisitsource', prefix + ' revisitquoted', prefix + ' revisitthought']);
      fixtures.push({ work, note, task, goal, session, memo, organized, revisit });
    }
    await asUser(alice);
    const all = await search('공통');
    assert.equal(all.results.length, 10);
    assert.deepEqual(new Set(all.results.map(row => row.recordType)), new Set(['task', 'goal', 'review', 'week_review', 'session', 'work', 'note', 'memo', 'revisit']));
    assert.equal(all.hasMore, false); assert.equal(all.nextOffset, null);
    assert.deepEqual(Object.keys(all.results[0]).sort(), ['id', 'recordType', 'group', 'title', 'excerpt', 'date', 'href'].sort());
    assert.ok(!JSON.stringify(all).includes(alice)); assert.ok(!JSON.stringify(all).includes(bob));
    await db.exec('reset role;');
    assert.equal((await search('공통')).results.length, 10, 'Explicit ownership also protects a role that bypasses row-level security');
    const functionInfo = (await db.query("select prosecdef,provolatile,proconfig from pg_proc where oid='public.search_private_records(text,text,integer)'::regprocedure")).rows[0];
    assert.equal(functionInfo.prosecdef, false); assert.equal(functionInfo.provolatile, 's'); assert.ok(functionInfo.proconfig.includes('search_path=""'));
    await asUser(alice);
    assert.equal((await search('상대만의기록')).results.length, 0, 'Accepted partner content stays private, including explicitly shared tasks');
    for (const needle of ['tasktitle','taskreason','tasknote','taskpublic','goaltitle','goalwhy','reviewhelped','reviewhindered','reviewgained','reviewnext','reviewdoc','weekdoc','sessiontitle','sessionwork','sessionmemo','worktitle','workcreator','worksummary','worktag','notecontent','notethought','memotext','organizedtext','revisitsource','revisitquoted','revisitthought']) assert.equal((await search(needle)).results.length, 1, 'Searchable field: ' + needle);
    assert.equal((await search('reviewhelped')).results[0].id,'2026-10-28','Legacy answers remain searchable when no document exists');
    assert.equal((await search('공통 reviewhelped')).results.length,0,'Once a document exists, hidden legacy answers are not falsely returned as current writing');
    assert.equal((await search('2026-10-27', 'memo')).results[0].id, fixtures[0].organized, 'Conversion date is searchable');
    assert.equal((await search('서재 기록으로 정리', 'memo')).results.length, 0);
    for (const kind of ['task','memo','review','library','goal']) assert.ok((await search('공통', kind)).results.every(row => row.group === kind));
    const links = new Map(all.results.map(row => [row.id + ':' + row.recordType, row.href]));
    assert.equal(links.get(fixtures[0].organized + ':memo'), '/notes?organized=1#memo-' + fixtures[0].organized);
    assert.equal(links.get(fixtures[0].memo + ':memo'), '/notes#memo-' + fixtures[0].memo);
    assert.equal(links.get(fixtures[0].note + ':note'), '/library/' + fixtures[0].work + '#note-' + fixtures[0].note);
    assert.equal(links.get('2026-10-29:review'), '/?day=2026-10-29#reflection-2026-10-29');
    assert.equal(links.get('2026-10-26:week_review'), '/?day=2026-10-26#week-review-2026-10-26');
    const symbolId = randomUUID();
    await db.query("insert into daily_tasks(id,user_id,day,title) values($1,$2,'2026-10-29',$3)", [symbolId, alice, '기호 % _ \\ 그대로']);
    for (const symbol of ['%', '_', '\\']) assert.deepEqual((await search(symbol)).results.map(row => row.id), [symbolId]);
    assert.equal((await search("' OR 1=1--")).results.length, 0, 'Query text never becomes SQL');
    await db.query('update notes set content=$1 where id=$2', ['가'.repeat(900) + '심층표식' + '나'.repeat(900), fixtures[0].note]);
    const excerpt = (await search('심층표식')).results[0].excerpt;
    assert.ok(excerpt.includes('심층표식')); assert.ok(excerpt.startsWith('…')); assert.ok([...excerpt].length <= 182);
    await db.query("insert into daily_tasks(user_id,day,title,note) select $1,'2026-10-29','대량기록 '||n,case when n=620 then '끝단검색' else '' end from generate_series(1,620) n", [alice]);
    assert.equal((await search('끝단검색')).results.length, 1, 'Matching occurs before pagination, including after 500 owned records');
    const seen = new Set();
    let offset = 0, pages = 0;
    for (;;) {
      const page = await search('대량기록', 'task', offset); pages++;
      assert.ok(page.results.length <= 30);
      for (const row of page.results) { assert.ok(!seen.has(row.id), 'Stable pagination has no duplicates'); seen.add(row.id); }
      if (!page.hasMore) { assert.equal(page.nextOffset, null); break; }
      assert.equal(page.results.length, 30); assert.equal(page.nextOffset, offset + 30); offset = page.nextOffset;
    }
    assert.equal(seen.size, 620); assert.equal(pages, 21);
    assert.deepEqual(await search(''), { results: [], hasMore: false, nextOffset: null });
    assert.deepEqual(await search('검색결과없음'), { results: [], hasMore: false, nextOffset: null });
    for (const input of [['x'.repeat(81),'all',0], ['x\n','all',0], ['x','all',-1], ['x','all',1000001], ['x','unknown',0], [null,'all',0]]) await assert.rejects(search(...input));
    await asUser(bob);
    assert.equal((await search('대량기록')).results.length, 0); assert.equal((await search('공통')).results.length, 10);
    await asUser(''); await assert.rejects(search('공통'));
    await db.exec('reset role; set role anon;'); await assert.rejects(search('공통')); await assert.rejects(search(''));
  } finally { await db.close(); }
});
