'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Heading1, Heading2, List, ListOrdered, Plus, Quote, Redo2, SquareCheck, Trash2, Type, Undo2 } from 'lucide-react';
import { emptyReview, parseReview, type DayReview } from '@/lib/planner';
import { BLOCK_KINDS, MAX_REFLECTION_TEXT, changeBlock, markdownKind, mergeBackward, parseReflection, pasteBlocks, reflectionBlock, reflectionOf, reflectionTemplate, removeBlock, splitBlock, type BlockKind, type EditResult, type ReflectionDocument } from '@/lib/reflection';
import { request,RequestError } from './api-client';
import { mergeReviewDraft } from '@/lib/review-merge';
import { DocumentTextarea, SaveStatus, useDocumentSave, useUnsavedGuard } from './editor';
import { ErrorMessage } from './ui';

const choices: { kind: BlockKind; icon: typeof Type; description: string }[] = [
  { kind: 'paragraph', icon: Type, description: '자유롭게 이어 쓰기' },
  { kind: 'heading1', icon: Heading1, description: '큰 제목' },
  { kind: 'heading2', icon: Heading2, description: '작은 제목' },
  { kind: 'bullet', icon: List, description: '순서 없는 목록' },
  { kind: 'numbered', icon: ListOrdered, description: '순서 있는 목록' },
  { kind: 'check', icon: SquareCheck, description: '생각을 실행으로 옮기기' },
  { kind: 'quote', icon: Quote, description: '마음에 남은 문장' },
];
type Menu = { id: string; mode: 'slash' | 'block'; selected: number };
type Snapshot = { document: ReflectionDocument; focus?: EditResult['focus'] };

export function Reflection({ day, review, save, endpoint='/api/planner/review', title='회고', headingId='daily-review-title', onTask }: { day: string; review: DayReview | null; save: (review: DayReview) => void; endpoint?:string; title?:string; headingId?:string; onTask?:(text:string,day:string)=>void }) {
  const [document, setDocument] = useState<ReflectionDocument>(() => reflectionOf(review));
  const [menu, setMenu] = useState<Menu | null>(null), [error, setError] = useState('');
  const [available, setAvailable] = useState({ undo: false, redo: false });
  const draft = useRef(document), fields = useRef(new Map<string, HTMLTextAreaElement>());
  const history = useRef<{ past: Snapshot[]; future: Snapshot[]; typed: string }>({ past: [], future: [], typed: '' });
  const popup = useRef<HTMLDivElement>(null), menuId = useId(), hintId = useId();
  const legacy = useRef(review ? parseReview(review) : { ...emptyReview });
  const revision=useRef(review?.revision??(review?1:0)),baseline=useRef(document);
  const [conflict,setConflict]=useState<{review:DayReview|null}|null>(null);
  const saving = useDocumentSave({ value: document, persist: async snapshot => {
    try{
      const result = await request<{ review: DayReview }>(endpoint, 'PUT', { day, ...legacy.current, document: parseReflection(snapshot),...(endpoint==='/api/planner/review'?{revision:revision.current}:{}) });
      revision.current=result.review.revision??revision.current;baseline.current=snapshot;setConflict(null);save(result.review);
    }catch(cause){
      if(endpoint==='/api/planner/review'&&cause instanceof RequestError&&cause.status===409){
        try{const current=await request<{review:DayReview|null}>('/api/planner/review?day='+day);setConflict(current);}catch{/* Keep the local draft and the original conflict error. */}
      }
      throw cause;
    }
  } });
  useUnsavedGuard(saving.dirty, saving.saveNow);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (event.target instanceof Element && !popup.current?.contains(event.target) && !event.target.closest('.reflection-menu-toggle')) setMenu(null);
    };
    window.addEventListener('mousedown', close); return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  function focus(target?: EditResult['focus']) {
    if (!target) return;
    requestAnimationFrame(() => {
      const field = fields.current.get(target.id);
      field?.focus(); field?.setSelectionRange(target.cursor, target.cursor);
    });
  }
  function currentFocus(): EditResult['focus'] | undefined {
    const active = window.document.activeElement;
    for (const [id, field] of fields.current) if (field === active) return { id, cursor: field.selectionStart };
  }
  function commit(next: ReflectionDocument, target?: EditResult['focus'], typing = '') {
    try { next = parseReflection(next); } catch (cause) { setError(cause instanceof Error ? cause.message : '회고를 확인해주세요.'); return false; }
    if (JSON.stringify(draft.current) === JSON.stringify(next)) { focus(target); return true; }
    const stack = history.current;
    if (!typing || stack.typed !== typing) {
      stack.past.push({ document: draft.current, focus: currentFocus() });
      if (stack.past.length > 60) stack.past.shift();
    }
    stack.future = []; stack.typed = typing;
    draft.current = next; setDocument(next); setAvailable({ undo: Boolean(stack.past.length), redo: false }); setError(''); focus(target); return true;
  }
  function edit(result: EditResult) { return commit(result.document, result.focus); }
  function travel(backward: boolean) {
    const stack = history.current, from = backward ? stack.past : stack.future, to = backward ? stack.future : stack.past;
    const snapshot = from.pop(); if (!snapshot) return;
    to.push({ document: draft.current, focus: currentFocus() }); stack.typed = '';
    draft.current = snapshot.document; setDocument(snapshot.document); setMenu(null); setError('');
    setAvailable({ undo: Boolean(stack.past.length), redo: Boolean(stack.future.length) });
    const last = snapshot.document.blocks.at(-1)!;
    focus(snapshot.focus ?? { id: last.id, cursor: last.text.length });
  }
  const activeBlock = document.blocks.find(block => block.id === menu?.id);
  const query = menu?.mode === 'slash' ? (activeBlock?.text.slice(1).trim() ?? '') : '';
  const options = choices.filter(choice => !query || (BLOCK_KINDS[choice.kind] + choice.description).includes(query));
  const selected = Math.min(menu?.selected ?? 0, Math.max(0, options.length - 1));
  useEffect(() => {
    const container = popup.current, highlighted = container?.querySelector<HTMLButtonElement>('.highlighted');
    if (container && highlighted) {
      if (highlighted.offsetTop < container.scrollTop) container.scrollTop = highlighted.offsetTop;
      else if (highlighted.offsetTop + highlighted.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = highlighted.offsetTop + highlighted.offsetHeight - container.clientHeight;
    }
  }, [selected, menu?.id, query]);
  function choose(kind: BlockKind, id: string, slash = false) {
    const block = draft.current.blocks.find(block => block.id === id); if (!block) return;
    const text = slash ? '' : block.text;
    commit(changeBlock(draft.current, id, { kind, text }), { id, cursor: text.length }); setMenu(null);
  }
  function changed(id: string, text: string, composing: boolean) {
    const block = draft.current.blocks.find(block => block.id === id); if (!block) return;
    const kind = !composing && block.kind === 'paragraph' ? markdownKind(text) : null;
    if (kind) { chooseShortcut(id, kind); return; }
    if (!commit(changeBlock(draft.current, id, { text }), undefined, id)) return;
    setMenu(/^\/[^\n]{0,32}$/.test(text) ? { id, mode: 'slash', selected: 0 } : null);
  }
  function chooseShortcut(id: string, kind: BlockKind) { commit(changeBlock(draft.current, id, { kind, text: '' }), { id, cursor: 0 }); setMenu(null); }
  function key(event: KeyboardEvent<HTMLTextAreaElement>, id: string) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const field = event.currentTarget, start = field.selectionStart, end = field.selectionEnd;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); travel(event.key.toLowerCase() === 'z' && !event.shiftKey); return; }
    if (menu?.id === id && menu.mode === 'slash') {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(null); return; }
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setMenu({ ...menu, selected: options.length ? (selected + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length : 0 }); return; }
      if (event.key === 'Enter' && !event.shiftKey && options.length) { event.preventDefault(); choose(options[selected].kind, id, true); return; }
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); edit(splitBlock(draft.current, id, start, end)); setMenu(null); return; }
    if (event.key === 'Backspace' && start === 0 && end === 0) { event.preventDefault(); edit(mergeBackward(draft.current, id)); return; }
    const index = draft.current.blocks.findIndex(block => block.id === id), neighbour = draft.current.blocks[index + (event.key === 'ArrowUp' ? -1 : 1)];
    if (event.key === 'Delete' && start === field.value.length && start === end) {
      const next = draft.current.blocks[index + 1];
      if (next) { event.preventDefault(); commit({ ...draft.current, blocks: draft.current.blocks.filter(block => block.id !== next.id).map(block => block.id === id ? { ...block, text: block.text + next.text } : block) }, { id, cursor: start }); }
    } else if (!event.shiftKey && start === end && neighbour && ((event.key === 'ArrowUp' && start === 0) || (event.key === 'ArrowDown' && end === field.value.length))) {
      event.preventDefault(); focus({ id: neighbour.id, cursor: event.key === 'ArrowUp' ? neighbour.text.length : 0 });
    }
  }
  function insertAfter(id: string) {
    const index = draft.current.blocks.findIndex(block => block.id === id), block = reflectionBlock();
    commit({ ...draft.current, blocks: [...draft.current.blocks.slice(0, index + 1), block, ...draft.current.blocks.slice(index + 1)] }, { id: block.id, cursor: 0 }); setMenu(null);
  }
  function move(id: string, offset: number) {
    const blocks = [...draft.current.blocks], index = blocks.findIndex(block => block.id === id), target = index + offset;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    commit({ ...draft.current, blocks }, { id, cursor: blocks[target].text.length }); setMenu(null);
  }
  function template() {
    const blocks = draft.current.blocks, empty = blocks.length === 1 && !blocks[0].text;
    const added = reflectionTemplate();
    commit({ version: 1, blocks: [...(empty ? [] : blocks), ...added] }, { id: added[1].id, cursor: 0 }); setMenu(null);
  }
  const total = document.blocks.reduce((sum, block) => sum + block.text.length, 0);
  return <section id={endpoint==='/api/planner/review'?'reflection-'+day:undefined} className="document-section document-reflection" aria-labelledby={headingId}>
    <div className="document-section-heading reflection-heading"><h2 id={headingId}>{title}</h2><div className="reflection-tools">
      <button className="reflection-tool" type="button" disabled={!available.undo} aria-label="회고 실행 취소" title="실행 취소" onClick={() => travel(true)}><Undo2 size={16}/></button>
      <button className="reflection-tool" type="button" disabled={!available.redo} aria-label="회고 다시 실행" title="다시 실행" onClick={() => travel(false)}><Redo2 size={16}/></button>
      <button className="text-button reflection-template" type="button" onClick={template}>회고 틀 추가 <Plus size={13}/></button>
    </div></div>
    <div className="reflection-canvas" aria-label="회고 문서" data-empty={document.blocks.length === 1 && !document.blocks[0].text}>
      {document.blocks.map((block, index) => {
        const number = index - document.blocks.slice(0, index).findLastIndex(item => item.kind !== 'numbered');
        const open = menu?.id === block.id;
        return <div className={'reflection-row reflection-' + block.kind + (block.checked ? ' reflection-checked' : '')} key={block.id}>
          <button className={'reflection-menu-toggle' + (open ? ' is-open' : '')} type="button" aria-label={'회고 ' + (index + 1) + '번째 블록 메뉴'} aria-expanded={open} aria-controls={open ? menuId : undefined} title="블록 메뉴" onClick={() => {
            setMenu(open ? null : { id: block.id, mode: 'block', selected: 0 });
            if (!open) requestAnimationFrame(() => popup.current?.querySelector<HTMLButtonElement>('button')?.focus());
          }}><GripVertical size={17}/></button>
          {block.kind === 'bullet' ? <span className="reflection-marker" aria-hidden="true">•</span> : block.kind === 'numbered' ? <span className="reflection-marker" aria-hidden="true">{number}.</span> : block.kind === 'check' ? <label className="reflection-check-control"><input className="reflection-check" type="checkbox" checked={block.checked} aria-label={(block.text || '회고 체크리스트 ' + (index + 1)) + ' 완료'} onChange={event => commit(changeBlock(draft.current, block.id, { checked: event.target.checked }))} onBlur={saving.flush}/></label> : null}
          <DocumentTextarea inputRef={element => { if (element) fields.current.set(block.id, element); else fields.current.delete(block.id); }} className="reflection-text" aria-label={'회고 · ' + BLOCK_KINDS[block.kind] + ' ' + (index + 1)} aria-describedby={hintId} name={'reflection-block-' + block.id} value={block.text} maxLength={MAX_REFLECTION_TEXT - total + block.text.length} placeholder={block.kind.startsWith('heading') ? BLOCK_KINDS[block.kind] : block.kind === 'quote' ? '인용할 문장' : '글을 쓰거나 /로 블록 추가'} onChange={event => changed(block.id, event.target.value, (event.nativeEvent as InputEvent).isComposing)} onCompositionEnd={event => changed(block.id, event.currentTarget.value, false)} onKeyDown={event => key(event, block.id)} onBlur={() => { history.current.typed = ''; saving.flush(); }} onFocus={() => { if (menu?.id !== block.id || menu.mode === 'block') setMenu(null); }} onPaste={event => {
            const text = event.clipboardData.getData('text/plain');
            if (!text) return;
            event.preventDefault();
            edit(pasteBlocks(draft.current, block.id, event.currentTarget.selectionStart, event.currentTarget.selectionEnd, text)); setMenu(null);
          }}/>
          {open && <div className="reflection-menu" data-editing-companion ref={popup} id={menuId} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); setMenu(null); focus({ id: block.id, cursor: block.text.length }); }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], current = buttons.indexOf(event.target as HTMLButtonElement);
              buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }
          }}><span className="reflection-menu-caption">{menu.mode === 'slash' ? '블록 추가' : '블록 유형'} <ChevronDown size={12}/></span>
            {menu.mode === 'slash' && <span className="sr-only" role="status">{options[selected] ? '선택된 블록: ' + BLOCK_KINDS[options[selected].kind] : '일치하는 블록 없음'}</span>}
            {options.length ? options.map(({ kind, icon: Icon, description }, option) => <button key={kind} type="button" className={menu.mode === 'slash' && option === selected ? 'highlighted' : ''} onMouseDown={event => event.preventDefault()} onClick={() => choose(kind, block.id, menu.mode === 'slash')}><Icon size={19}/><span>{BLOCK_KINDS[kind]}<small>{description}</small></span></button>) : <p className="field-hint">일치하는 블록이 없어요.</p>}
            {menu.mode === 'block' && <div className="reflection-menu-actions">{onTask&&block.text.trim()&&<button type="button" onClick={()=>{const field=fields.current.get(block.id), selected=field?block.text.slice(field.selectionStart,field.selectionEnd):'';onTask(selected.trim()||block.text,day);setMenu(null);}}><SquareCheck size={16}/>다음 할 일로 이어가기</button>}<button type="button" onClick={() => insertAfter(block.id)}><Plus size={16}/>아래에 문단 추가</button><button type="button" disabled={index === 0} onClick={() => move(block.id, -1)}><ArrowUp size={16}/>위로 이동</button><button type="button" disabled={index === document.blocks.length - 1} onClick={() => move(block.id, 1)}><ArrowDown size={16}/>아래로 이동</button><button type="button" onClick={() => { edit(removeBlock(draft.current, block.id)); setMenu(null); }}><Trash2 size={16}/>블록 삭제</button></div>}
          </div>}
        </div>;
      })}
      <button className="reflection-add-line" type="button" onClick={() => insertAfter(document.blocks.at(-1)!.id)}><Plus size={15}/>새 문단</button>
    </div>
    {conflict&&<div className="review-conflict" role="status"><p>다른 곳에서 저장한 회고가 있어요. 작성 중인 초안은 그대로 남아 있어요.</p><details><summary>최신 내용 확인</summary><ReflectionContent document={reflectionOf(conflict.review)}/></details><button className="document-button secondary" type="button" onClick={()=>{
      try{
        const remote=reflectionOf(conflict.review),merged=mergeReviewDraft(baseline.current,draft.current,remote),same=JSON.stringify(merged)===JSON.stringify(draft.current);
        revision.current=conflict.review?.revision??0;baseline.current=remote;legacy.current=conflict.review?parseReview(conflict.review):{...emptyReview};saving.acknowledge(remote);
        if(conflict.review)save(conflict.review);commit(merged);setConflict(null);if(same)saving.retry();
      }catch(cause){setError(cause instanceof Error?cause.message:'최신 내용과 합치지 못했어요. 초안은 유지돼요.');}
    }}>최신 내용과 내 초안 합치기</button></div>}
    <div className="reflection-footer"><span className="field-hint" id={hintId}><span className="reflection-shortcuts">Enter 새 문단 · Shift+Enter 줄바꿈 · </span>/로 제목과 목록 추가</span><SaveStatus status={saving.status} error={saving.error} retry={saving.retry}/></div>
    <ErrorMessage error={error}/>
  </section>;
}

export function ReflectionContent({ document }: { document: ReflectionDocument }) {
  const elements: ReactNode[] = [];
  for (let index = 0; index < document.blocks.length; index++) {
    const block = document.blocks[index];
    if (['bullet', 'numbered', 'check'].includes(block.kind)) {
      const items: ReactNode[] = [], kind = block.kind;
      do {
        const item = document.blocks[index];
        items.push(<li key={item.id} className={item.checked ? 'reflection-checked' : undefined}>{kind === 'check' && <span aria-label={item.checked ? '완료' : '미완료'}>{item.checked ? '☑' : '☐'} </span>}{item.text || <br/>}</li>); index++;
      } while (document.blocks[index]?.kind === kind);
      index--; elements.push(kind === 'numbered' ? <ol key={block.id}>{items}</ol> : <ul key={block.id} className={kind === 'check' ? 'reflection-check-list' : undefined}>{items}</ul>);
    } else elements.push(block.kind === 'heading1' ? <h4 key={block.id}>{block.text || <br/>}</h4> : block.kind === 'heading2' ? <h5 key={block.id}>{block.text || <br/>}</h5> : block.kind === 'quote' ? <blockquote key={block.id}>{block.text || <br/>}</blockquote> : <p key={block.id}>{block.text || <br/>}</p>);
  }
  return <div className="reflection-content preserve-text">{elements}</div>;
}
