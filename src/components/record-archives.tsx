'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, ChevronDown, Download, RotateCw } from 'lucide-react';
import { ARCHIVE_SECTIONS, archiveCounts, archiveGatewayURL, type ArchiveDocument, type ArchiveKit, type ArchiveOptions, type ArchiveRecord, type ArchiveSection, type ArchiveEnvelope } from '@/lib/archive';
import { decryptArchive, encryptArchive } from '@/lib/archive-crypto';
import { recoveryHTML } from '@/lib/archive-reader';
import { readingDay } from '@/lib/reading';
import { request, useAction } from './api-client';
import { prepareDocumentNavigation, useUnsavedGuard } from './editor';
import { ErrorMessage } from './ui';

type Draft = { document: ArchiveDocument; kit: ArchiveKit; record: ArchiveRecord | null };
const stateLabels: Record<ArchiveRecord['state'], string> = { prepared: '파일 준비됨', submitted: '접수됨', confirmed: '보관 확인됨' };
const periodLabel = (r: ArchiveRecord) => r.period_start.replaceAll('-', '.') + ' — ' + r.period_end.replaceAll('-', '.');
function download(html: string, from: string, to: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'next-chapter-records-' + from + '-' + to + '.html'; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function ArchivePreview({ document }: { document: ArchiveDocument }) {
  return <details className="archive-preview"><summary>보관할 내용 보기 <span>{document.entries.length}개</span></summary><div className="archive-preview-entries">{document.entries.map((entry, index) => <article key={index}><p>{entry.date} · {entry.kind}</p><h4>{entry.title}</h4>{entry.fields.map((field, i) => <div key={i}><span>{field.label}</span><p>{field.text}</p></div>)}{entry.blocks?.map((block, i) => <p key={'block-' + i} className={'archive-block-' + block.kind}>{block.kind === 'check' ? block.checked ? '☑ ' : '☐ ' : block.kind === 'bullet' ? '• ' : ''}{block.text}</p>)}</article>)}</div></details>;
}

export function RecordArchives({ disabled, onBusy }: { disabled: boolean; onBusy: (value: boolean) => void }) {
  const id = useId(), action = useAction(), lock = useRef(false);
  const [open, setOpen] = useState(false), [options, setOptions] = useState<ArchiveOptions>(() => { const to = readingDay(); return { from: to.slice(0, 8) + '01', to, sections: ['days', 'library', 'notes', 'learning'] }; });
  const [draft, setDraft] = useState<Draft | null>(null), [downloaded, setDownloaded] = useState(false), [consent, setConsent] = useState(false);
  const [archives, setArchives] = useState<ArchiveRecord[]>([]), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState(''), [refresh, setRefresh] = useState(0), [notice, setNotice] = useState('');
  const frozen = disabled || action.busy;
  useUnsavedGuard(Boolean(draft && !downloaded) || action.busy);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    request<{ archives: ArchiveRecord[] }>('/api/archives', 'GET', undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) { setArchives(data.archives); setLoading(false); setLoadError(''); }
    }).catch(error => { if (!controller.signal.aborted) { setLoadError(error.message); setLoading(false); } });
    return () => controller.abort();
  }, [open, refresh]);
  function refreshArchives() { setLoading(true); setRefresh(value => value + 1); }
  async function perform(task: () => Promise<void>) {
    if (lock.current || disabled) return;
    lock.current = true; onBusy(true); setNotice('');
    try { await action.run(task); }
    finally { lock.current = false; onBusy(false); }
  }
  async function preview() {
    if (!await prepareDocumentNavigation({ preserveDrafts: true })) return;
    const result = await request<{ document: ArchiveDocument }>('/api/archives/snapshot', 'POST', options);
    if (!result.document.entries.length) throw new Error('이 기간에는 선택한 종류의 기록이 없어요. 기간이나 기록 종류를 바꿔주세요.');
    const encrypted = await encryptArchive(result.document);
    setDraft({ document: result.document, kit: { format: 'next-chapter-recovery', version: 1, archiveId: crypto.randomUUID(), ...encrypted, dataId: null }, record: null });
    setDownloaded(false); setConsent(false);
  }
  async function receiveFile() {
    if (!draft) return;
    let current = draft;
    if (!current.record) {
      const result = await request<{ archive: ArchiveRecord }>('/api/archives', 'POST', { id: current.kit.archiveId, from: current.document.period.from, to: current.document.period.to, sections: current.document.sections, counts: archiveCounts(current.document), envelope: current.kit.envelope });
      current = { ...current, record: result.archive, kit: { ...current.kit, dataId: result.archive.data_id } };
      setDraft(current); refreshArchives();
    }
    download(await recoveryHTML(current.kit), current.document.period.from, current.document.period.to);
    setDownloaded(true); setNotice('복구 파일을 준비했어요. 다운로드한 파일을 열어 기록이 보이는지 확인해주세요.');
  }
  async function submit() {
    if (!draft?.record || !downloaded || !consent) return;
    const result = await request<{ archive: ArchiveRecord }>('/api/archives/' + draft.record.id, 'POST', { action: 'submit', consent: true, consent_version: 1 });
    setDraft({ ...draft, record: result.archive }); refreshArchives();
    setNotice(result.archive.state === 'confirmed' ? '네트워크에 보관된 내용을 확인했어요.' : '외부 보관 요청이 접수됐어요. 최종 보관 확인에는 시간이 걸릴 수 있어요.');
  }
  async function check(record: ArchiveRecord) {
    const result = await request<{ archive: ArchiveRecord }>('/api/archives/' + record.id, 'POST', { action: 'check' });
    setArchives(rows => rows.map(row => row.id === record.id ? result.archive : row));
    if (draft?.record?.id === record.id) setDraft({ ...draft, record: result.archive });
    setNotice(result.archive.state === 'confirmed' ? '네트워크의 보관본이 원래 파일과 일치하는 것을 확인했어요.' : '아직 최종 보관을 확인 중이에요. 복구 파일에 담긴 기록은 지금도 열 수 있어요.');
  }
  async function resume(record: ArchiveRecord) {
    const result = await request<{ archive: ArchiveRecord }>('/api/archives/' + record.id, 'POST', { action: 'submit', consent: true, consent_version: 1 });
    setArchives(rows => rows.map(row => row.id === record.id ? result.archive : row));
    if (draft?.record?.id === record.id) setDraft({ ...draft, record: result.archive });
    setNotice('외부 보관 요청이 접수됐어요. 최종 보관 확인에는 시간이 걸릴 수 있어요.');
  }
  const uploaded = draft?.record && draft.record.state !== 'prepared';
  return <div className="record-archives">
    <button className="account-disclosure archive-toggle" type="button" disabled={frozen} aria-expanded={open} aria-controls={id + '-body'} onClick={() => { setOpen(value => !value); if (!open) setLoading(true); }}><span><span>내 기록 보관함</span><small>사이트 밖에서도 꺼내 읽을 수 있도록</small></span><ChevronDown size={17} aria-hidden="true" className={open ? 'is-open' : undefined}/></button>
    <div id={id + '-body'} className="archive-body" hidden={!open}>
      <p className="archive-intro">남겨두고 싶은 기록을 골라 암호화해 보관해요.<br/>복구 파일은 이 사이트에 로그인하지 않아도 열 수 있어요.</p>
      {!draft ? <form className="archive-options" onSubmit={event => { event.preventDefault(); void perform(preview); }}>
        <fieldset disabled={frozen}><legend>보관할 기간</legend><div className="archive-period"><label htmlFor={id + '-from'}><span>시작일</span><input id={id + '-from'} type="date" required min="1900-01-01" max={options.to || '2100-12-31'} value={options.from} onChange={event => setOptions({ ...options, from: event.target.value })}/></label><span aria-hidden="true">—</span><label htmlFor={id + '-to'}><span>종료일</span><input id={id + '-to'} type="date" required min={options.from || '1900-01-01'} max="2100-12-31" value={options.to} onChange={event => setOptions({ ...options, to: event.target.value })}/></label></div></fieldset>
        <fieldset className="archive-choices" disabled={frozen}><legend>담을 기록</legend>{Object.entries(ARCHIVE_SECTIONS).map(([key, value]) => <label key={key}><input type="checkbox" checked={options.sections.includes(key as ArchiveSection)} onChange={event => setOptions({ ...options, sections: event.target.checked ? [...options.sections, key as ArchiveSection] : options.sections.filter(s => s !== key) })}/><span>{value.title}<small>{value.description}</small></span></label>)}</fieldset>
        <p className="archive-caption">하루 기록은 기록 날짜, 나머지는 작성·수정한 날짜를 기준으로 현재 내용을 담아요. 관련 작품·목표의 제목을 포함하며, 사진과 계정 정보는 담지 않아요.</p>
        <button className="document-button secondary" disabled={frozen || !options.sections.length}>{action.busy ? '기록 확인 중…' : '보관할 기록 확인'}</button>
      </form> : <div className="archive-draft">
        <div className="archive-draft-heading"><div><p>보관할 기록</p><h3>{draft.document.period.from.replaceAll('-', '.')} — {draft.document.period.to.replaceAll('-', '.')}</h3></div><button className="document-button" type="button" disabled={frozen} onClick={() => { setDraft(null); setDownloaded(false); setConsent(false); setNotice(''); }}>다시 선택</button></div>
        <dl className="archive-counts">{Object.entries(archiveCounts(draft.document)).map(([key, count]) => <div key={key}><dt>{ARCHIVE_SECTIONS[key as ArchiveSection].title}</dt><dd>{count}개</dd></div>)}</dl>
        <ArchivePreview document={draft.document}/>
        <div className="archive-file-step"><span className="archive-step-number" aria-hidden="true">1</span><div><h4>복구 파일을 먼저 받아주세요.</h4><p>기록과 복구키가 함께 들어 있어요. 파일을 가진 사람은 내용을 읽을 수 있으니 개인 보관함에 저장해주세요.</p><button className="document-button secondary" type="button" disabled={frozen} onClick={() => void perform(receiveFile)}><Download size={15} aria-hidden="true"/>{downloaded ? '복구 파일 다시 받기' : '복구 파일 받기'}</button></div></div>
        <div className="archive-file-step"><span className="archive-step-number" aria-hidden="true">2</span><div><h4>Arweave에도 보관할 수 있어요.</h4><p>암호화한 파일을 외부 분산 저장망에 올려요. 복구키는 전송하지 않아요. 무료 범위에서만 요청하며, 한도가 부족하면 멈춰요.</p>{!uploaded ? <><label className="archive-consent"><input type="checkbox" checked={consent} disabled={frozen || !downloaded} onChange={event => setConsent(event.target.checked)}/><span>복구 파일을 저장했어요. 외부 보관본은 기록 삭제·탈퇴 후에도 남으며, 되돌려 지울 수 없다는 점을 확인했어요.</span></label><button className="document-button primary" type="button" disabled={frozen || !downloaded || !consent} onClick={() => void perform(submit)}>{action.busy ? '처리 중…' : 'Arweave에 보관'}</button></> : <div className="archive-submitted"><span><Check size={15} aria-hidden="true"/>{stateLabels[draft.record!.state]}</span>{draft.record?.state === 'submitted' && <button type="button" className="document-button" disabled={frozen} onClick={() => void perform(() => check(draft.record!))}><RotateCw size={14} aria-hidden="true"/>상태 확인</button>}</div>}</div></div>
      </div>}
      <ErrorMessage error={action.error}/>{notice && <p className="archive-notice" role="status">{notice}</p>}
      <div className="archive-history"><div className="archive-history-heading"><h3>만들어둔 보관본</h3><button className="document-button" type="button" disabled={frozen || loading} onClick={refreshArchives}>새로고침</button></div>
        {loading && <p className="archive-caption" role="status">보관 목록을 확인하고 있어요.</p>}
        {loadError && <ErrorMessage error={loadError}/>}
        {!loading && !archives.length && !loadError && <p className="archive-caption">아직 만들어둔 보관본이 없어요.</p>}
        {archives.map(record => <ArchiveHistoryRow key={record.id} record={record} disabled={frozen} onCheck={() => perform(() => check(record))} onSubmit={() => perform(() => resume(record))} onAction={perform}/>)}
        {archives.length === 50 && <p className="archive-caption">최근 50개를 표시해요. 전체 보관 목록은 기록 내보내기에 포함돼요.</p>}
      </div>
      <p className="archive-footnote">Arweave는 장기 보관을 목표로 하는 네트워크예요. 보존 기간을 무조건 보장할 수는 없어요. 복구 파일도 따로 보관해주세요. <Link href="/privacy#record-archives">보관 안내</Link></p>
    </div>
  </div>;
}

function ArchiveHistoryRow({ record, disabled, onCheck, onSubmit, onAction }: { record: ArchiveRecord; disabled: boolean; onCheck: () => Promise<void>; onSubmit: () => Promise<void>; onAction: (task: () => Promise<void>) => Promise<void> }) {
  const [key, setKey] = useState(''), [showKey, setShowKey] = useState(false), [consent, setConsent] = useState(false), id = useId();
  async function receive() {
    const result = await request<{ archive: ArchiveRecord & { envelope: ArchiveEnvelope } }>('/api/archives/' + record.id);
    await decryptArchive(result.archive.envelope, key.trim()).catch(() => { throw new Error('복구키가 맞지 않아요. 다운로드해둔 복구 파일에서 확인해주세요.'); });
    const kit: ArchiveKit = { format: 'next-chapter-recovery', version: 1, archiveId: record.id, key: key.trim(), envelope: result.archive.envelope, digest: record.digest, dataId: record.data_id };
    download(await recoveryHTML(kit), record.period_start, record.period_end); setKey('');
  }
  return <details className="archive-history-row"><summary><span><strong>{periodLabel(record)}</strong><small>{Object.values(record.counts).reduce((sum, n) => sum + (n ?? 0), 0)}개 · {new Date(record.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}에 준비</small></span><span className={'archive-state archive-state-' + record.state}>{stateLabels[record.state]}</span></summary><div className="archive-history-detail">
    <p className="archive-caption">{record.state === 'prepared' ? '복구 파일을 만든 상태예요. 아직 외부 보관 접수는 확인되지 않았어요.' : record.state === 'submitted' ? '보관 요청이 접수됐어요. 원본과의 일치 여부와 네트워크의 최종 저장 상태를 확인 중이에요.' : '네트워크에 저장된 암호화 파일이 원래 파일과 일치하는 것을 확인했어요.'}</p>
    <a className="archive-network-link" href={archiveGatewayURL(record.data_id)} target="_blank" rel="noreferrer">암호화된 보관 주소<ArrowUpRight size={14} aria-hidden="true"/></a>
    {record.state === 'submitted' && <button className="document-button secondary" type="button" disabled={disabled} onClick={() => void onCheck()}>보관 상태 확인</button>}
    {record.state === 'prepared' && <div><label className="archive-consent"><input type="checkbox" checked={consent} disabled={disabled} onChange={event => setConsent(event.target.checked)}/><span>복구 파일을 보관하고 있어요. 외부 보관본은 기록 삭제·탈퇴 후에도 남으며 되돌려 지울 수 없다는 점을 확인했어요.</span></label><button className="document-button secondary" type="button" disabled={disabled || !consent} onClick={() => void onSubmit()}>외부 보관 이어서 요청</button></div>}
    <form onSubmit={event => { event.preventDefault(); void onAction(receive); }}><label htmlFor={id}>복구키로 파일 다시 받기</label><div className="archive-key-row"><input id={id} type={showKey ? 'text' : 'password'} value={key} disabled={disabled} onChange={event => setKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="보관해둔 복구키"/><button type="button" className="document-button" disabled={disabled} aria-pressed={showKey} onClick={() => setShowKey(value => !value)}>{showKey ? '숨기기' : '보기'}</button></div><button className="document-button secondary" disabled={disabled || !key.trim()}><Download size={15} aria-hidden="true"/>복구 파일 받기</button><p className="archive-caption">복구키는 이 기기에서만 확인해요. 서버가 보관하지 않아서 분실한 키를 재발급할 수는 없어요.</p></form>
  </div></details>;
}
