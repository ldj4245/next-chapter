import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {prepareStorage} from './storage-fixture.mjs';
import {parseBatchPlanning} from '../src/lib/batch-planning.ts';
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const id=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');
test('여러 할 일 이어가기는 날짜·개수·UUID를 검증하며 대상 사용자 입력을 무시',()=>{
  assert.deepEqual(parseBatchPlanning({day:'2026-11-01',source_day:'2026-10-29',ids:[id(2),id(1),id(1)],user_id:bob}),{day:'2026-11-01',source_day:'2026-10-29',ids:[id(1),id(2)]});
  for(const patch of[{day:'2026-10-29'},{ids:[]},{ids:Array(51).fill(id(1))},{ids:['bad']},{day:'2026-02-30'}])assert.throws(()=>parseBatchPlanning({day:'2026-11-01',source_day:'2026-10-29',ids:[id(1)],...patch}));
});
test('여러 할 일 SQL은 본인 원문·이유와 비공개 기본값, 일괄 원자성·재시도를 보장',async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon;create role authenticated;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,supabase_auth_admin;grant select,delete on auth.users to supabase_auth_admin;");await prepareStorage(db);
    const folder=new URL('../supabase/migrations/',import.meta.url);for(const name of(await readdir(folder)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,folder),'utf8'));
    await db.query('insert into auth.users values($1),($2)',[alice,bob]);
    await db.query("insert into daily_tasks(id,user_id,day,title,note,status,reason,reason_detail) values($1,$2,'2026-10-29','첫 할 일','원래 메모','partial','time','이유 보존'),($3,$2,'2026-10-29','둘째 할 일','','planned','',''),($4,$5,'2026-10-29','상대 기록','','planned','',''),($6,$2,'2026-10-29','다음 검사','','planned','',''),($7,$2,'2026-10-29','완료 항목','','completed','','')",[id(1),alice,id(2),id(3),bob,id(4),id(5)]);
    const as=async user=>{await db.exec('reset role;set role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);};
    const batch=async(ids,day='2026-11-01')=>(await db.query("select defer_daily_tasks($1::uuid[],$2::date,'2026-10-29') as result",[ids,day])).rows[0].result;
    await as(alice);const result=await batch([id(2),id(1)]);assert.equal(result.length,2);assert.equal(result[0].task.note,'원래 메모');assert.equal(result[0].task.reason,'time');assert.equal(result[0].task.reason_detail,'이유 보존');assert.equal(result[0].task.status,'partial');assert.equal(result[1].task.status,'not_done');assert.equal(result[0].carried.shared,false);assert.equal(result[0].carried.photos_shared,false);assert.ok(!Object.hasOwn(result[0].task,'user_id'));
    const again=await batch([id(1),id(2)]);assert.deepEqual(again.map(x=>x.carried.id),result.map(x=>x.carried.id));assert.equal((await db.query("select count(*)::int as n from daily_tasks where carried_from_id is not null")).rows[0].n,2);
    await assert.rejects(batch([id(1)],'2026-11-02'));await assert.rejects(batch([id(4),id(3)]));await assert.rejects(batch([id(4),id(5)]));assert.equal((await db.query('select count(*)::int as n from daily_tasks where carried_from_id=$1',[id(4)])).rows[0].n,0);
    await as(bob);await assert.rejects(batch([id(1)]));await db.exec('reset role;set role anon;');await assert.rejects(batch([id(1)]));
  }finally{await db.close();}
});
