import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { InputError } from '../src/lib/domain.ts';
import { parseReview } from '../src/lib/planner.ts';
import { changeBlock, hasReflectionContent, markdownKind, mergeBackward, parseReflection, pasteBlocks, reflectionBlock, reflectionOf, reflectionTemplate, removeBlock, splitBlock, type BlockKind, type ReflectionDocument } from '../src/lib/reflection.ts';
const doc = (text = '', kind: BlockKind = 'paragraph'): ReflectionDocument => ({ version: 1, blocks: [reflectionBlock(kind, text)] });
const legacy = { helped: '  아침에 시작\n바로 읽었다.  ', hindered: '', gained: '한 문장 이해', next_step: '' };

test('새 회고는 빈 문단 하나, 기존 답변은 순서와 줄바꿈을 잃지 않고 문서로 표시', () => {
  const empty = reflectionOf(null); assert.equal(empty.blocks.length, 1); assert.equal(empty.blocks[0].text, '');
  const converted = reflectionOf(legacy);
  assert.deepEqual(converted.blocks.map(({ kind, text }) => [kind, text]), [['heading2', '잘 된 것'], ['paragraph', legacy.helped], ['heading2', '얻은 것'], ['paragraph', legacy.gained]]);
  assert.deepEqual(legacy, { helped: '  아침에 시작\n바로 읽었다.  ', hindered: '', gained: '한 문장 이해', next_step: '' });
  assert.deepEqual(reflectionOf({ ...legacy, document: empty }), empty, 'Saved empty document takes precedence over archived answers');
  assert.equal(hasReflectionContent({ ...legacy, document: empty }), false);
  assert.equal(hasReflectionContent(legacy), true);
  assert.equal(reflectionTemplate().length, 8);
});

test('문서 검증은 공백·한글·일반 텍스트를 보존하고 중복 ID와 과도한 입력을 거절', () => {
  const valid = doc('  오늘\n\n<script>일반 텍스트</script>  ');
  assert.deepEqual(parseReflection(valid), valid);
  assert.deepEqual(parseReview({ ...legacy, document: valid }).document, valid);
  assert.ok(!Object.hasOwn(parseReview(legacy), 'document'), 'Legacy API payload does not clear an existing document');
  for (const input of [null, { version: 2, blocks: valid.blocks }, { version: 1, blocks: [] }, { version: 1, blocks: [...valid.blocks, ...valid.blocks] }, doc('x'.repeat(24001)), { version: 1, blocks: Array.from({ length: 201 }, () => reflectionBlock()) }, { ...valid, blocks: [{ ...valid.blocks[0], checked: true }] }, { ...valid, blocks: [{ ...valid.blocks[0], kind: 'html' }] }, { ...valid, blocks: [{ ...valid.blocks[0], id: randomUUID().toUpperCase() }, { ...valid.blocks[0], id: randomUUID(), text: [] }] }]) assert.throws(() => parseReflection(input), InputError);
  assert.equal(parseReflection(doc('한'.repeat(24000))).blocks[0].text.length, 24000);
});

test('Enter는 커서에서 문단을 나누고 선택 영역만 대체, 목록은 이어지고 빈 목록은 일반 문단', () => {
  const original = doc('앞선 내용뒷문장', 'heading1'), id = original.blocks[0].id;
  const split = splitBlock(original, id, 2, 5);
  assert.deepEqual(split.document.blocks.map(block => [block.kind, block.text]), [['heading1', '앞선'], ['paragraph', '뒷문장']]);
  assert.equal(split.focus.id, split.document.blocks[1].id); assert.equal(split.focus.cursor, 0);
  assert.equal(original.blocks.length, 1); assert.equal(original.blocks[0].text, '앞선 내용뒷문장');
  const list = doc('두 가지 생각', 'check'); list.blocks[0].checked = true;
  const next = splitBlock(list, list.blocks[0].id, 7);
  assert.equal(next.document.blocks[1].kind, 'check'); assert.equal(next.document.blocks[1].checked, false);
  const empty = doc('', 'numbered');
  assert.equal(splitBlock(empty, empty.blocks[0].id, 0).document.blocks[0].kind, 'paragraph');
});

test('Backspace와 삭제는 내용·커서 위치를 보존하며 마지막 문단 하나를 유지', () => {
  const first = doc('앞문장'), last = reflectionBlock('paragraph', '뒷문장'); first.blocks.push(last);
  const merged = mergeBackward(first, last.id);
  assert.equal(merged.document.blocks[0].text, '앞문장뒷문장'); assert.equal(merged.focus.cursor, 3);
  assert.equal(first.blocks[0].text, '앞문장');
  const quote = doc('남길 문장', 'quote');
  assert.equal(mergeBackward(quote, quote.blocks[0].id).document.blocks[0].text, '남길 문장');
  assert.equal(mergeBackward(quote, quote.blocks[0].id).document.blocks[0].kind, 'paragraph');
  const removed = removeBlock(quote, quote.blocks[0].id);
  assert.equal(removed.document.blocks.length, 1); assert.equal(removed.document.blocks[0].text, '');
});

test('여러 줄 붙여넣기는 선택 영역만 바꾸고 뒤쪽 글과 빈 줄·목록 순서를 보존', () => {
  const original = doc('앞선택뒤', 'bullet');
  const pasted = pasteBlocks(original, original.blocks[0].id, 1, 3, '하나\r\n\r\n셋');
  assert.deepEqual(pasted.document.blocks.map(block => [block.kind, block.text]), [['bullet', '앞하나'], ['bullet', ''], ['bullet', '셋뒤']]);
  assert.equal(pasted.focus.cursor, 1); assert.equal(new Set(pasted.document.blocks.map(block => block.id)).size, 3);
  const single = pasteBlocks(original, original.blocks[0].id, 1, 3, '교체');
  assert.equal(single.document.blocks[0].text, '앞교체뒤'); assert.equal(single.focus.cursor, 3);
  assert.equal(original.blocks[0].text, '앞선택뒤');
});

test('블록 유형 변경과 Markdown 단축키가 체크 상태를 다른 유형으로 넘기지 않음', () => {
  const checked = doc('실행', 'check'); checked.blocks[0].checked = true;
  assert.equal(changeBlock(checked, checked.blocks[0].id, { kind: 'quote' }).blocks[0].checked, false);
  assert.equal(checked.blocks[0].checked, true);
  assert.equal(markdownKind('# '), 'heading1'); assert.equal(markdownKind('## '), 'heading2');
  assert.equal(markdownKind('[ ] '), 'check'); assert.equal(markdownKind('1. '), 'numbered');
  assert.equal(markdownKind('그냥 글 '), null);
});
