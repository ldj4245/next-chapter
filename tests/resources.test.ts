import assert from 'node:assert/strict';
import test from 'node:test';
import { bookmarkURL,canonicalResourceURL,formatTimestamp,mergeResourceDraft,parseBookmark,parseResource,parseTimestamp,resourceURL,timestampFromURL,videoSource } from '../src/lib/resources.ts';
import { publicAddress,resourceHTMLTitle } from '../src/lib/resource-metadata.ts';
import { parseWorkSummary } from '../src/lib/work-summary.ts';
const id='11111111-1111-4111-8111-111111111111';
const base={url:'https://example.com/article',title:'자료',kind:'article' as const,status:'saved' as const,tags:['개발'],memo:'원래 글'};
test('외부 자료 URL은 실행 가능한 스킴·인증 정보·로컬 주소·포트를 거절하고 영상 별칭을 통합',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','file:///test','https://localhost/test','https://127.0.0.1','https://[::1]','https://user:pass@example.com','http://example.com:8080/a','https://host.local','https://example.com./','https://0x7f000001','https://2130706433'])assert.throws(()=>resourceURL(url),url);
  assert.equal(canonicalResourceURL('https://youtu.be/dQw4w9WgXcQ?t=25&si=test'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(canonicalResourceURL('https://example.com/a?q=한글#section'),'https://example.com/a?q=%ED%95%9C%EA%B8%80#section');
  assert.equal(videoSource('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'),null);
  assert.throws(()=>resourceURL('https://example.com/'+ '한'.repeat(800)));
  assert.deepEqual(videoSource('https://www.youtube.com/shorts/dQw4w9WgXcQ'),{provider:'youtube',id:'dQw4w9WgXcQ'});
});
test('영상 구간은 분·초 범위를 확인하고 원본 영상의 실제 구간 URL로 연결',()=>{
  assert.equal(parseTimestamp('12:35'),755);assert.equal(parseTimestamp('1:02:35'),3755);assert.equal(formatTimestamp(3755),'1:02:35');
  for(const value of ['12:65','1:99:00','123','-1:00','1:2:3','100:00:00'])assert.throws(()=>parseTimestamp(value));
  assert.equal(timestampFromURL('https://youtu.be/dQw4w9WgXcQ?t=1h2m3s'),3723);
  assert.equal(bookmarkURL('https://youtube.com/watch?v=dQw4w9WgXcQ',755),'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=755s');
  assert.equal(bookmarkURL('https://vimeo.com/12345/secret?h=abc',62),'https://vimeo.com/12345/secret?h=abc#t=62s');
  assert.equal(bookmarkURL('https://example.com/video',1),null);
  assert.throws(()=>parseBookmark({id,seconds:-1,label:'위치'}));assert.throws(()=>parseBookmark({id,seconds:1,label:' '}));
});
test('자료 입력과 충돌 합치기는 개인 메모를 보존하고 용량 초과를 자르지 않는다',()=>{
  const memo='  줄바꿈\n\n메모  ';assert.equal(parseResource({...base,memo,user_id:id}).memo,memo);
  assert.throws(()=>parseResource({...base,tags:['x'.repeat(31)]}));assert.throws(()=>parseResource({...base,memo:'x'.repeat(10001)}));
  const result=mergeResourceDraft(base,{...base,title:'내 제목',memo:'내 수정'},{...base,memo:'다른 탭 수정',status:'active'});
  assert.equal(result.title,'내 제목');assert.equal(result.status,'active');assert.ok(result.memo.includes('내 수정')&&result.memo.includes('다른 탭 수정'));
  assert.throws(()=>mergeResourceDraft(base,{...base,memo:'x'.repeat(9000)},{...base,memo:'y'.repeat(9000)}));
});
test('제목 미리보기는 사설·특수 DNS 주소를 차단하고 HTML 메타 제목만 일반 텍스트로 추출',()=>{
  for(const address of ['127.0.0.1','10.0.0.1','100.64.0.1','169.254.169.254','172.31.0.1','192.168.1.1','192.0.2.1','198.18.1.1','203.0.113.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::','3fff::1'])assert.equal(publicAddress(address),false,address);
  for(const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2a00:1450:4001::1'])assert.equal(publicAddress(address),true,address);
  assert.equal(resourceHTMLTitle('<head><meta content="한글 &amp; &#xC81C;&#47785;" property="og:title"><title>다른 제목</title></head>'),'한글 & 제목');
  assert.equal(resourceHTMLTitle('<title>  제목\n&amp; 내용 </title>'),'제목 & 내용');
});
test('한줄평은 기존 300자·빈 값과 줄바꿈을 보존하고 비교 대상 없는 저장을 거절',()=>{
  const summary='  완독 후 내 생각\n다음 문장  ';assert.deepEqual(parseWorkSummary({summary,expected_summary:'',user_id:id}),{summary,expected_summary:''});
  assert.deepEqual(parseWorkSummary({summary:'',expected_summary:'지울 평'}),{summary:'',expected_summary:'지울 평'});
  assert.throws(()=>parseWorkSummary({summary:'x'.repeat(301),expected_summary:''}));assert.throws(()=>parseWorkSummary({summary:'새 평'}));
});
