import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('여유 시간·주간 회고는 PostgreSQL에서 소유권·월요일·문서·시간 범위를 검증하고 기존 기록을 보존', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;");
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql') && name < '202610130004_day_flow.sql').sort()) await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
    const goal = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', task = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', block = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await db.query('insert into auth.users values($1),($2)', [alice, bob]);
    const asUser = async user => { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); };
    await asUser(alice);
    await db.query("insert into planner_goals(id,user_id,title,period,motivation) values($1,$2,'기존 학습 목표','long','얻고 싶은 것')", [goal, alice]);
    await db.query("insert into daily_tasks(id,user_id,day,title,status,reason,note,goal_id) values($1,$2,'2026-10-13','기존 할 일','partial','difficulty','이해한 내용을 보존',$3)", [task, alice, goal]);
    const document = { version: 1, blocks: [{ id: block, kind: 'paragraph', text: '  직접 적은 회고\n다음 줄  ', checked: false }] };
    await db.query("insert into daily_reviews(user_id,day,gained,document) values($1,'2026-10-13','원래 기록',$2)", [alice, JSON.stringify(document)]);
    const original = {};
    for (const table of ['planner_goals', 'daily_tasks', 'daily_reviews']) original[table] = (await db.query('select * from ' + table)).rows;
    await db.exec('reset role;');
    await db.exec(await readFile(new URL('202610130004_day_flow.sql', migrations), 'utf8'));
    await asUser(alice);
    for (const table of Object.keys(original)) assert.deepEqual((await db.query('select * from ' + table)).rows, original[table], 'Migration keeps ' + table + ' untouched');
    await db.query("insert into planner_day_preferences(user_id,day,available_minutes) values($1,'2026-10-13',0)", [alice]);
    assert.equal((await db.query('select available_minutes from planner_day_preferences')).rows[0].available_minutes, 0);
    await db.exec('update planner_day_preferences set available_minutes=null');
    assert.equal((await db.query('select available_minutes from planner_day_preferences')).rows[0].available_minutes, null);
    await db.exec('update planner_day_preferences set available_minutes=1440');
    for (const query of ["update planner_day_preferences set available_minutes=-1", "update planner_day_preferences set available_minutes=1441", "update planner_day_preferences set day='1899-12-31'", "update planner_day_preferences set day='2101-01-01'"]) await assert.rejects(db.exec(query));
    for (const value of ['1.5', 'false', 'NaN']) await assert.rejects(db.query('update planner_day_preferences set available_minutes=$1', [value]));
    await db.query("insert into planner_week_reviews(user_id,day,document) values($1,'2026-10-12',$2)", [alice, JSON.stringify(document)]);
    assert.deepEqual((await db.query('select document from planner_week_reviews')).rows[0].document, document);
    for (const day of ['2026-10-13', '2026-10-18', '1899-12-25', '2101-01-03']) await assert.rejects(db.query('update planner_week_reviews set day=$1', [day]));
    const malformed = [null, {}, { version: 1, blocks: [] }, { ...document, blocks: [...document.blocks, ...document.blocks] }, { ...document, blocks: [{ ...document.blocks[0], kind: 'html' }] }, { ...document, blocks: [{ ...document.blocks[0], text: 'x'.repeat(24001) }] }];
    for (const value of malformed) await assert.rejects(db.query('update planner_week_reviews set document=$1', [JSON.stringify(value)]));
    assert.deepEqual((await db.query('select document from planner_week_reviews')).rows[0].document, document, 'Failed writes preserve the weekly document');
    await asUser(bob);
    for (const table of ['planner_day_preferences', 'planner_week_reviews']) {
      assert.equal((await db.query('select * from ' + table)).rows.length, 0);
      assert.equal((await db.query('delete from ' + table + ' where user_id=$1 returning user_id', [alice])).rows.length, 0);
    }
    assert.equal((await db.query('update planner_day_preferences set available_minutes=999 where user_id=$1 returning user_id', [alice])).rows.length, 0);
    assert.equal((await db.query('update planner_week_reviews set document=$1 where user_id=$2 returning user_id', [JSON.stringify(document), alice])).rows.length, 0);
    await assert.rejects(db.query("insert into planner_day_preferences(user_id,day,available_minutes) values($1,'2026-10-14',30)", [alice]));
    await assert.rejects(db.query("insert into planner_week_reviews(user_id,day,document) values($1,'2026-10-19',$2)", [alice, JSON.stringify(document)]));
    await db.query("insert into planner_day_preferences(user_id,day,available_minutes) values($1,'2026-10-13',60)", [bob]);
    const blank = { version: 1, blocks: [{ id: block, kind: 'paragraph', text: '', checked: false }] };
    await db.query("insert into planner_week_reviews(user_id,day,document) values($1,'2026-10-12',$2)", [bob, JSON.stringify(blank)]);
    assert.equal((await db.query('select available_minutes from planner_day_preferences')).rows[0].available_minutes, 60);
    await asUser(alice);
    assert.equal((await db.query('select available_minutes from planner_day_preferences')).rows[0].available_minutes, 1440);
    assert.deepEqual((await db.query('select document from planner_week_reviews')).rows[0].document, document);
    await db.exec('delete from planner_day_preferences; delete from planner_week_reviews;');
    for (const table of Object.keys(original)) assert.deepEqual((await db.query('select * from ' + table)).rows, original[table], 'Deleting new features keeps ' + table + ' untouched');
    await db.exec('reset role; set role anon;');
    for (const table of ['planner_day_preferences', 'planner_week_reviews']) await assert.rejects(db.query('select * from ' + table));
  } finally { await db.close(); }
});
