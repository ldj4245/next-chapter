import { InputError, object, uuid } from './domain.ts';

export const BLOCK_KINDS = { paragraph: '텍스트', heading1: '제목 1', heading2: '제목 2', bullet: '글머리 기호 목록', numbered: '번호 목록', check: '체크리스트', quote: '인용' } as const;
export type BlockKind = keyof typeof BLOCK_KINDS;
export type ReflectionBlock = { id: string; kind: BlockKind; text: string; checked: boolean };
export type ReflectionDocument = { version: 1; blocks: ReflectionBlock[] };
export const MAX_BLOCKS = 200, MAX_REFLECTION_TEXT = 24000;
export const REVIEW_HEADINGS = { helped: '잘 된 것', hindered: '어려웠던 것', gained: '얻은 것', next_step: '다음에 해볼 것' } as const;
type LegacyReview = { [K in keyof typeof REVIEW_HEADINGS]: string } & { document?: ReflectionDocument | null };
export type EditResult = { document: ReflectionDocument; focus: { id: string; cursor: number } };
type IdFactory = () => string;
const newId: IdFactory = () => crypto.randomUUID();

export function reflectionBlock(kind: BlockKind = 'paragraph', text = '', id: IdFactory = newId): ReflectionBlock {
  return { id: id(), kind, text, checked: false };
}
export function parseReflection(value: unknown): ReflectionDocument {
  const fail = (message = '회고 문서 형식을 확인해주세요.'): never => { throw new InputError({ document: message }); };
  const input = object(value);
  if (input.version !== 1 || !Array.isArray(input.blocks) || !input.blocks.length || input.blocks.length > MAX_BLOCKS) return fail('회고는 1~200개의 블록으로 작성할 수 있어요.');
  const ids = new Set<string>(); let length = 0;
  const blocks = input.blocks.map(value => {
    const block = object(value), id = uuid(block.id);
    if (ids.has(id.toLowerCase()) || typeof block.kind !== 'string' || !Object.hasOwn(BLOCK_KINDS, block.kind) || typeof block.text !== 'string' || typeof block.checked !== 'boolean' || (block.kind !== 'check' && block.checked)) return fail();
    ids.add(id.toLowerCase()); length += block.text.length;
    return { id, kind: block.kind as BlockKind, text: block.text, checked: block.checked };
  });
  if (length > MAX_REFLECTION_TEXT) return fail('회고는 24,000자 이내로 작성해주세요.');
  return { version: 1, blocks };
}
export function reflectionOf(review: LegacyReview | null, id: IdFactory = newId): ReflectionDocument {
  if (review?.document) return parseReflection(review.document);
  const blocks: ReflectionBlock[] = [];
  if (review) for (const [field, heading] of Object.entries(REVIEW_HEADINGS)) {
    const text = review[field as keyof typeof REVIEW_HEADINGS];
    if (text) blocks.push(reflectionBlock('heading2', heading, id), reflectionBlock('paragraph', text, id));
  }
  return { version: 1, blocks: blocks.length ? blocks : [reflectionBlock('paragraph', '', id)] };
}
export function hasReflectionContent(review: LegacyReview): boolean {
  return review.document ? review.document.blocks.some(block => block.text.trim()) : Object.keys(REVIEW_HEADINGS).some(field => Boolean(review[field as keyof typeof REVIEW_HEADINGS]));
}
export function reflectionTemplate(id: IdFactory = newId): ReflectionBlock[] {
  return Object.values(REVIEW_HEADINGS).flatMap(heading => [reflectionBlock('heading2', heading, id), reflectionBlock('paragraph', '', id)]);
}
export function changeBlock(document: ReflectionDocument, id: string, patch: Partial<Pick<ReflectionBlock, 'kind' | 'text' | 'checked'>>): ReflectionDocument {
  return { ...document, blocks: document.blocks.map(block => {
    if (block.id !== id) return block;
    const changed = { ...block, ...patch };
    return { ...changed, checked: changed.kind === 'check' ? changed.checked : false };
  }) };
}
export function splitBlock(document: ReflectionDocument, id: string, start: number, end = start, factory: IdFactory = newId): EditResult {
  const index = document.blocks.findIndex(block => block.id === id), block = document.blocks[index];
  if (!block) throw new Error('블록을 찾을 수 없어요.');
  if (!block.text && block.kind !== 'paragraph') return { document: changeBlock(document, id, { kind: 'paragraph' }), focus: { id, cursor: 0 } };
  const next = reflectionBlock(['bullet', 'numbered', 'check', 'quote'].includes(block.kind) ? block.kind : 'paragraph', block.text.slice(end), factory);
  return { document: { ...document, blocks: [...document.blocks.slice(0, index), { ...block, text: block.text.slice(0, start) }, next, ...document.blocks.slice(index + 1)] }, focus: { id: next.id, cursor: 0 } };
}
export function mergeBackward(document: ReflectionDocument, id: string): EditResult {
  const index = document.blocks.findIndex(block => block.id === id), block = document.blocks[index];
  if (!block) throw new Error('블록을 찾을 수 없어요.');
  if (block.kind !== 'paragraph') return { document: changeBlock(document, id, { kind: 'paragraph' }), focus: { id, cursor: 0 } };
  if (!index) return { document, focus: { id, cursor: 0 } };
  const previous = document.blocks[index - 1];
  return { document: { ...document, blocks: [...document.blocks.slice(0, index - 1), { ...previous, text: previous.text + block.text }, ...document.blocks.slice(index + 1)] }, focus: { id: previous.id, cursor: previous.text.length } };
}
export function pasteBlocks(document: ReflectionDocument, id: string, start: number, end: number, text: string, factory: IdFactory = newId): EditResult {
  const index = document.blocks.findIndex(block => block.id === id), block = document.blocks[index];
  if (!block) throw new Error('블록을 찾을 수 없어요.');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const first = { ...block, text: block.text.slice(0, start) + lines[0] };
  const added = lines.slice(1).map(line => reflectionBlock(['bullet', 'numbered', 'check', 'quote'].includes(block.kind) ? block.kind : 'paragraph', line, factory));
  const last = added.at(-1) ?? first, cursor = last.text.length;
  last.text += block.text.slice(end);
  return { document: { ...document, blocks: [...document.blocks.slice(0, index), first, ...added, ...document.blocks.slice(index + 1)] }, focus: { id: last.id, cursor } };
}
export function removeBlock(document: ReflectionDocument, id: string): EditResult {
  const index = document.blocks.findIndex(block => block.id === id), blocks = document.blocks.filter(block => block.id !== id);
  if (!blocks.length) blocks.push({ id, kind: 'paragraph', text: '', checked: false });
  const target = blocks[Math.max(0, index - 1)] ?? blocks[0];
  return { document: { ...document, blocks }, focus: { id: target.id, cursor: target.text.length } };
}
export function markdownKind(text: string): BlockKind | null {
  return ({ '# ': 'heading1', '## ': 'heading2', '- ': 'bullet', '* ': 'bullet', '1. ': 'numbered', '> ': 'quote', '[] ': 'check', '[ ] ': 'check' } as Record<string, BlockKind>)[text] ?? null;
}
