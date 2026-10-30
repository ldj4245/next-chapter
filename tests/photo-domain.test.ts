import assert from 'node:assert/strict';
import test from 'node:test';
import { InputError } from '../src/lib/domain.ts';
import { photoURLs, validatePhotoUpload } from '../src/lib/photos.ts';

test('사진은 실제로 읽을 수 있는 양의 정수 크기와 3MB 이하 raster MIME만 허용', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/avif']) {
    assert.doesNotThrow(() => validatePhotoUpload({ size: 1, type }));
    assert.doesNotThrow(() => validatePhotoUpload({ size: 3 * 1024 * 1024, type }));
  }
  for (const size of [0, -1, 0.5, NaN, Infinity, 3 * 1024 * 1024 + 1]) assert.throws(() => validatePhotoUpload({ size, type: 'image/jpeg' }), InputError);
  for (const type of ['', 'image/svg+xml', 'image/gif', 'image/heic', 'application/octet-stream', 'image/jpeg; charset=utf-8', 'IMAGE/JPEG', 'image/jpg']) assert.throws(() => validatePhotoUpload({ size: 100, type }), InputError);
});

test('사진 링크는 인증 서버의 두 고정 크기에만 연결하고 ID를 URL 경로로 인코딩', () => {
  const id = '01234567-89ab-4cde-8123-456789abcdef';
  assert.deepEqual(photoURLs(id), { url: '/api/photos/' + id + '/image?size=full', thumbnail_url: '/api/photos/' + id + '/image?size=thumb' });
  for (const id of ['../outside', 'image?size=full&token=private', '#fragment', '한글 사진']) {
    const links = photoURLs(id);
    for (const [name, link] of Object.entries(links)) {
      const parsed = new URL(link, 'https://library.example');
      assert.equal(parsed.origin, 'https://library.example');
      assert.equal(parsed.pathname, '/api/photos/' + encodeURIComponent(id) + '/image');
      assert.deepEqual([...parsed.searchParams], [['size', name === 'url' ? 'full' : 'thumb']]);
      assert.equal(parsed.hash, '');
    }
  }
});
