import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('목표 측정은 기존 기록을 보존하고 실제 PostgreSQL에서 날짜·목표량·소유권을 검증', async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;");
    const migrations = new URL('../supabase/migrations/', import.meta.url), names = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
    // A pre-existing goal is migrated in place with its original title, meaning and status.
    for (const name of names.filter(name => name < '202610130003_goal_metrics.sql')) await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222', id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await db.query('insert into auth.users values($1),($2)', [alice, bob]);
    const asUser = async user => { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); };
    await asUser(alice);
    await db.query("insert into planner_goals(id,user_id,title,period,status,motivation,target_day) values($1,$2,'기존 목표','long','paused','중요한 이유','2026-10-18')", [id, alice]);
    await db.exec('reset role;');
    await db.exec(await readFile(new URL('202610130003_goal_metrics.sql', migrations), 'utf8'));
    await asUser(alice);
    const migrated = (await db.query('select title,status,motivation,metric_unit,metric_target,metric_start_day from planner_goals')).rows[0];
    assert.deepEqual(migrated, { title: '기존 목표', status: 'paused', motivation: '중요한 이유', metric_unit: null, metric_target: null, metric_start_day: null });
    for (const query of ["update planner_goals set metric_unit='streak'", "update planner_goals set metric_target=1", "update planner_goals set metric_start_day='2026-10-12'", "update planner_goals set metric_unit='minutes',metric_target=0", "update planner_goals set metric_unit='tasks',metric_target=10000001", "update planner_goals set metric_unit='pages',metric_start_day='1899-12-31'", "update planner_goals set metric_unit='pages',metric_start_day='2026-10-19'"]) await assert.rejects(db.exec(query));
    await db.exec("update planner_goals set metric_unit='minutes',metric_target=300,metric_start_day='2026-10-12'");
    assert.equal((await db.query('select status from planner_goals')).rows[0].status, 'paused', 'Measurement must never automatically mark a goal complete');
    await asUser(bob);
    assert.equal((await db.query('select metric_target from planner_goals')).rows.length, 0);
    assert.equal((await db.query('update planner_goals set metric_target=999 where id=$1 returning id', [id])).rows.length, 0);
    await assert.rejects(db.query("insert into planner_goals(user_id,title,period,metric_unit,metric_target) values($1,'타인 목표','short','tasks',3)", [alice]));
    await asUser(alice);
    assert.equal((await db.query('select metric_target from planner_goals')).rows[0].metric_target, 300);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select metric_target from planner_goals'));
  } finally { await db.close(); }
});
