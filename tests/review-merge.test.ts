import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeReviewDraft } from '../src/lib/review-merge.ts';
import { type ReflectionDocument,type ReflectionBlock } from '../src/lib/reflection.ts';
const id=(n:number)=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const block=(n:number,text:string):ReflectionBlock=>({id:id(n),kind:'paragraph',text,checked:false});
const doc=(...blocks:ReflectionBlock[]):ReflectionDocument=>({version:1,blocks});
test('회고 충돌 합치기는 로컬 수정과 원격 메모 추가를 함께 보존',()=>{
  const result=mergeReviewDraft(doc(block(1,'원문')),doc(block(1,'내 수정')),doc(block(1,'원문'),block(2,'메모에서 추가한 내용')));
  assert.deepEqual(result.blocks,[block(1,'내 수정'),block(2,'메모에서 추가한 내용')]);
});
test('같은 블록 동시 수정은 양쪽 문장을 남기고 독립 수정과 삭제는 충돌 없이 반영',()=>{
  let next=10;const result=mergeReviewDraft(doc(block(1,'원문'),block(2,'보존'),block(3,'지울 내용')),doc(block(1,'내 문장'),block(2,'보존')),doc(block(1,'다른 기기의 문장'),block(2,'다른 독립 수정'),block(3,'지울 내용')),()=>id(next++));
  assert.ok(result.blocks.some(b=>b.text==='내 문장'));assert.ok(result.blocks.some(b=>b.text==='다른 기기의 문장'));assert.ok(result.blocks.some(b=>b.text==='다른 독립 수정'));assert.ok(!result.blocks.some(b=>b.id===id(3)));assert.equal(new Set(result.blocks.map(b=>b.id)).size,result.blocks.length);
});
test('합치기 용량 초과는 원문을 자르지 않고 오류를 반환',()=>{
  const base=doc(block(1,'원문')),local=doc(block(1,'가'.repeat(24000))),remote=doc(block(1,'원문'),block(2,'추가'));
  assert.throws(()=>mergeReviewDraft(base,local,remote));assert.equal(local.blocks[0].text.length,24000);assert.equal(remote.blocks[1].text,'추가');
});
