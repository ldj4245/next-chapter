import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromYes24, yes24Items } from '../src/lib/yes24-data.ts';
import { parseWork } from '../src/lib/domain.ts';

test('예스24 도서 메타데이터를 실제 저장 형식으로 정리하고 소개·감상을 분리', () => {
  const book = fromYes24({ itemId: 99308021, title: '불편한 편의점', author: '김호연 저', goodsType: '도서',
    publishDate: '2021-04-20', cover: 'https://image.yes24.com/goods/99308021/L',
    contentDetail: { bookIntroduction: '<p>소개&nbsp;<b>첫 문단</b></p><p>다음 &#54620;글<br>줄</p><script>삭제</script>' } });
  assert.ok(book);
  assert.equal(book.source, 'yes24'); assert.equal(book.source_id, '99308021');
  assert.equal(book.source_url, 'https://www.yes24.com/product/goods/99308021');
  assert.equal(book.year, 2021); assert.equal(book.description, '소개 첫 문단\n다음 한글\n줄');
  const saved = parseWork({ ...book, status: 'planned' });
  assert.equal(saved.summary, ''); assert.equal(saved.creator, '김호연 저'); assert.equal(saved.cover_url, book.cover_url);
});

test('예스24 응답의 잘못된 ID·비도서·외부 표지는 거르고 누락된 정보는 빈 값으로 처리', () => {
  assert.equal(fromYes24({ itemId: -1, title: '책', goodsType: '도서' }), null);
  assert.equal(fromYes24({ itemId: 1, title: '영상', goodsType: 'DVD' }), null);
  const items = yes24Items({ success: true, data: { items: [
    { itemId: 99308021, title: '책', goodsType: '국내도서', publishDate: 'invalid', cover: 'https://evil.example/a.jpg' },
    { itemId: 2, title: '영상', goodsType: 'DVD' },
  ] } });
  assert.equal(items.length, 1); assert.equal(items[0].cover_url, '');
  assert.equal(items[0].year, null); assert.equal(items[0].description, '');
  assert.deepEqual(yes24Items({ success: true, data: { items: [] } }), []);
});
