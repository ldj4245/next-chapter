import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogURL,plainText,wikiMatches} from '../src/lib/catalog-types.ts';
import {parseWork,InputError} from '../src/lib/domain.ts';
test('외부 이미지·링크는 HTTPS 공식 출처만 허용하고 HTML은 텍스트로 정리',()=>{
  assert.equal(catalogURL('http://upload.wikimedia.org/a.jpg',true),'');
  assert.equal(catalogURL('https://evil.example/a.jpg',true),'');
  assert.equal(catalogURL('https://upload.wikimedia.org@evil.example/a.jpg',true),'');
  assert.equal(catalogURL('javascript:alert(1)'),'');
  assert.ok(catalogURL('https://upload.wikimedia.org/a.jpg',true));
  assert.equal(plainText('<p>작품 <b>소개</b></p>'),'작품 소개');
});
test('백과사전 검색은 배우·감독과 종류가 다른 문서를 제외',()=>{
  assert.equal(wikiMatches('《기생충》은 2019년 대한민국의 영화이다.','기생충 (영화)','movie'),true);
  assert.equal(wikiMatches('봉준호는 대한민국의 영화 감독이다.','봉준호','movie'),false);
  assert.equal(wikiMatches('《소년이 온다》는 한강의 소설이다.','소년이 온다','book'),true);
  assert.equal(wikiMatches('《더 글로리》는 대한민국의 드라마이다.','더 글로리','drama'),true);
  assert.equal(wikiMatches('《기생충》은 대한민국의 영화이다.','기생충 (영화)','book'),false);
});
test('가져온 작품 소개는 개인 감상과 별개이고 기존 필드 없는 기록도 허용',()=>{
  const base={title:'영화',kind:'movie',status:'planned'};
  const imported=parseWork({...base,description:'작품 소개',summary:'',source:'wikipedia',source_id:'ko:123',source_url:'https://ko.wikipedia.org/wiki/영화',cover_url:'https://upload.wikimedia.org/a.jpg'});
  assert.equal(imported.summary,'');assert.equal(imported.description,'작품 소개');assert.equal(parseWork(base).source,null);
  assert.throws(()=>parseWork({...base,source:'wikipedia'}),InputError);
  assert.throws(()=>parseWork({...base,cover_url:'https://evil.example/a.jpg'}),InputError);
});
