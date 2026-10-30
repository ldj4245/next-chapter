import assert from 'node:assert/strict';
import test from 'node:test';
import { InputError } from '../src/lib/domain.ts';
import { goalTaskIds,parseDay,parseGoal,parseReview,parseTask,parseTaskState,plannerDay,plannerWeek,shiftDay,summarizeTasks,type Goal } from '../src/lib/planner.ts';
test('하루 계획은 한국 자정 기준이며 날짜와 예상 시간을 검증',()=>{
  assert.equal(plannerDay('2026-10-10T15:00:00Z'),'2026-10-11');
  assert.deepEqual(plannerWeek('2026-10-11'),['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']);
  assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
  assert.equal(parseDay('2028-02-29'),'2028-02-29');
  for(const day of ['2026-02-29','2026-13-01','2026-1-1','1899-12-31','2101-01-01',null])assert.throws(()=>parseDay(day),InputError);
  const task=parseTask({title:' 산책하기 ',day:'2026-10-11',status:'planned'});
  assert.equal(task.title,'산책하기');assert.equal(task.minutes,null);assert.equal(task.goal_id,null);assert.equal(task.important,false);
  for(const minutes of [0,1441,1.5,'abc',true])assert.throws(()=>parseTask({...task,minutes}),InputError);
  assert.throws(()=>parseTask({...task,important:'true'}),InputError);
  assert.throws(()=>parseTask({...task,title:' '}),InputError);
  assert.throws(()=>parseTask({...task,goal_id:'foreign-id'}),InputError);
});
test('실행 상태는 일부 진행과 미완료 이유를 보존하고 완료 시 이유를 비움',()=>{
  const state={status:'partial',reason:'difficulty',reason_detail:' 예상보다 어려웠다. '};
  assert.deepEqual(parseTaskState(state),{status:'partial',reason:'difficulty',reason_detail:'예상보다 어려웠다.'});
  assert.deepEqual(parseTaskState({...state,status:'completed'}),{status:'completed',reason:'',reason_detail:''});
  assert.throws(()=>parseTaskState({...state,status:'failed'}),InputError);
  assert.throws(()=>parseTaskState({...state,reason:'laziness'}),InputError);
  const summary=summarizeTasks([{status:'planned',minutes:30},{status:'partial',minutes:20},{status:'completed',minutes:null},{status:'not_done',minutes:10}]);
  assert.deepEqual(summary,{total:4,completed:1,partial:1,not_done:1,planned:1,minutes:60});
});
test('목표 연결과 회고는 선택 사항이며 학습·독서 종류를 요구하지 않음',()=>{
  const long=parseGoal({title:'내 속도로 배우기',period:'long'});
  assert.equal(long.parent_id,null);assert.equal(long.target_day,null);assert.equal(long.status,'active');
  assert.throws(()=>parseGoal({...long,parent_id:'11111111-1111-4111-8111-111111111111'}),InputError);
  assert.throws(()=>parseGoal({...long,period:'daily'}),InputError);
  assert.deepEqual(parseReview({gained:' 한 문제를 이해했다. '}),{helped:'',hindered:'',gained:'한 문제를 이해했다.',next_step:''});
  assert.throws(()=>parseReview({gained:'x'.repeat(5001)}),InputError);
  assert.throws(()=>parseReview({helped:[]}),InputError);
  const goals=[{id:'long',parent_id:null},{id:'short',parent_id:'long'},{id:'other',parent_id:null}] as Goal[];
  assert.deepEqual([...goalTaskIds(goals,'long')],['long','short']);
});
