'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Copy, Link2, RefreshCw, X } from 'lucide-react';
import type { PartnerState } from '@/lib/partner';
import { authModePath } from '@/lib/auth-return';
import { request, RequestError, useAction } from './api-client';
import { ErrorMessage } from './ui';
import { prepareDocumentNavigation, useUnsavedGuard } from './editor';
import { usePartnerResource } from './partner-resource';
export { usePartner, usePartnerResource } from './partner-resource';

function expiryLabel(expiresAt: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(expiresAt));
}

export function PartnerControls({ state, onChange, initialOpen = false, variant='planner' }: { state: PartnerState; onChange: () => void; initialOpen?: boolean; variant?:'planner'|'account' }) {
  const accountView=variant==='account';
  const action = useAction(), id = useId(), nicknameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(initialOpen), [nickname, setNickname] = useState(state.profile?.nickname ?? '');
  const [link, setLink] = useState(''), [linkExpiry, setLinkExpiry] = useState(''), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  const latestState = useRef(state);
  const [mintedAgainst, setMintedAgainst] = useState<PartnerState | null>(null);
  const [confirm, setConfirm] = useState<'disconnect' | 'rotate' | 'cancel' | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<PartnerState['connection']>(null);
  const [fieldError, setFieldError] = useState(''), [saved, setSaved] = useState(false), [nicknameEdited, setNicknameEdited] = useState(false);
  useEffect(() => { latestState.current = state; }, [state]);
  useUnsavedGuard(!accountView&&nicknameEdited);
  const inviteNickname=accountView?state.profile?.nickname??'':nickname;
  const freshLink = Boolean(link && !state.connection && (state === mintedAgainst || (state.invite && Date.parse(linkExpiry) === Date.parse(state.invite.expires_at))));
  const pendingExpiry = freshLink ? linkExpiry : state.invite?.expires_at;
  async function perform(task: () => Promise<void>) {
    await action.run(async () => {
      setFieldError(''); setSaved(false);
      try { await task(); }
      catch (error) {
        if (error instanceof RequestError && error.issues.nickname) { setFieldError(error.issues.nickname); nicknameRef.current?.focus(); }
        throw error;
      }
    });
  }
  async function createInvite() {
    await perform(async () => {
      const result = await request<{ token: string; expires_at: string }>('/api/partner/invite', 'POST', { nickname:inviteNickname });
      setLink(new URL('/connect?token=' + result.token, window.location.origin).href);
      setMintedAgainst(latestState.current);
      setLinkExpiry(result.expires_at); setNicknameEdited(false);
      setCopied(false); setCopyError(''); setConfirm(null); onChange();
    });
  }
  async function copyLink() {
    setCopyError('');
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setCopyError('아래 링크를 선택해 직접 복사해주세요.'); }
  }
  function toggle() {
    if (!open && !nicknameEdited) { setNickname(state.profile?.nickname ?? ''); setFieldError(''); setSaved(false); }
    setOpen(value => !value); setConfirm(null);
  }
  return <section className={'partner-controls'+(accountView?' partner-controls-account':'')} aria-label="상대 연결">
    {!accountView&&<button className="partner-control-toggle" type="button" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}>
      <Link2 size={15}/><span>{state.connection ? '연결 설정' : state.invite || freshLink ? '초대 대기 중' : '상대 연결'}</span><ChevronDown size={14} className={open ? 'is-open' : ''}/>
    </button>}
    {(accountView||open) && <div id={id} className="partner-control-body">
      {accountView?state.connection&&<p className="partner-account-name">{state.connection.nickname}님과 연결되어 있어요.</p>:<div className="partner-control-heading"><h2>{state.connection ? state.connection.nickname + '님과 연결되어 있어요' : '서로의 하루 확인하기'}</h2><button className="document-icon" aria-label="연결 설정 닫기" type="button" onClick={toggle}><X size={17}/></button></div>}
      {!state.connection && <p className="partner-muted">상대를 초대하고, 함께 확인할 할 일을 선택하세요.</p>}
      {!accountView&&<form className="partner-name-form" noValidate onSubmit={event => { event.preventDefault(); void perform(async () => { await request('/api/partner/profile', 'POST', { nickname }); setSaved(true); setNicknameEdited(false); onChange(); }); }}>
        <label htmlFor={id + '-nickname'}>상대에게 보일 내 이름</label>
        <div className="partner-input-row"><input ref={nicknameRef} id={id + '-nickname'} value={nickname} disabled={action.busy} onChange={event => { setNickname(event.target.value); setSaved(false); setNicknameEdited(true); }} autoComplete="nickname" maxLength={48} placeholder="이름 또는 별명 · 2~24자" aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? id + '-error' : undefined}/><button className="document-button secondary" disabled={action.busy || !nickname.trim()}>{action.busy ? '저장 중…' : '저장'}</button></div>
        {fieldError && <span id={id + '-error'} className="field-error">{fieldError}</span>}{saved && <span className="partner-saved" role="status">이름을 저장했어요.</span>}
      </form>}
      {!state.connection && !state.invite && !freshLink && <div className="partner-invite-start"><button type="button" className="document-button primary" disabled={action.busy || !inviteNickname.trim()} onClick={() => void createInvite()}><Link2 size={15}/>{action.busy ? '만드는 중…' : '초대 링크 만들기'}</button>{accountView&&!inviteNickname.trim()&&<p className="partner-muted">내 정보에서 이름을 저장한 뒤 초대할 수 있어요.</p>}<p className="partner-muted">한 사람만 연결할 수 있어요. 링크는 7일 동안 유효해요.</p></div>}
      {!state.connection && (state.invite || freshLink) && <div className="partner-pending">
        <p className="partner-pending-title">상대의 수락을 기다리고 있어요.</p>
        {freshLink ? <><div className="partner-copy-row"><input aria-label="상대 초대 링크" value={link} readOnly onFocus={event => event.currentTarget.select()}/><button type="button" className="document-button secondary" disabled={action.busy} onClick={() => void copyLink()}>{copied ? <Check size={15}/> : <Copy size={15}/>}<span>{copied ? '복사됨' : '복사'}</span></button></div><p className="partner-muted" role="status">{copyError || '링크를 약속한 상대에게 보내주세요.'}</p></> : <p className="partner-muted">기존에 복사한 링크를 보내주세요. 새 링크가 필요하면 아래에서 다시 만들 수 있어요.</p>}
        {pendingExpiry && <p className="partner-expiry">{expiryLabel(pendingExpiry)}까지 수락 가능</p>}
        <div className="partner-secondary-actions"><button className="document-button" type="button" disabled={action.busy} onClick={() => setConfirm('rotate')}><RefreshCw size={14}/>링크 다시 만들기</button><button className="document-button" type="button" disabled={action.busy} onClick={() => setConfirm('cancel')}>초대 취소</button></div>
      </div>}
      {state.connection && <div className="partner-connected-copy"><p className="partner-muted">함께 확인할 항목으로 지정한 할 일만 상대에게 보여요. 개인 메모와 회고는 나만 볼 수 있어요.</p><button className="document-button" type="button" disabled={action.busy} onClick={() => { setDisconnectTarget(state.connection); setConfirm('disconnect'); }}>연결 해제</button></div>}
      {confirm && <div className="partner-inline-confirm" role="group" aria-label={confirm === 'disconnect' ? '연결 해제 확인' : '초대 변경 확인'}>
        <p>{confirm === 'disconnect' ? (disconnectTarget?.nickname ? disconnectTarget.nickname + '님과의 ' : '') + '연결을 해제하면 서로의 하루를 볼 수 없어요. 각자의 기록은 그대로 남아요.' : confirm === 'rotate' ? '기존 링크는 사용할 수 없게 되고, 새 초대 링크가 만들어져요.' : '초대 링크를 사용할 수 없게 돼요. 내 기록은 그대로 남아요.'}</p>
        <div><button className="document-button secondary" type="button" disabled={action.busy} onClick={() => setConfirm(null)}>돌아가기</button><button className="document-button primary" type="button" disabled={action.busy} onClick={() => void (confirm === 'rotate' ? createInvite() : perform(async () => { if (confirm === 'disconnect' && !(await prepareDocumentNavigation({ preserveDrafts: true }))) return; await request(confirm === 'disconnect' ? '/api/partner' : '/api/partner/invite', 'DELETE', confirm === 'disconnect' ? { connection_id: disconnectTarget?.id } : undefined); setConfirm(null); setDisconnectTarget(null); setLink(''); setLinkExpiry(''); setMintedAgainst(null); setCopied(false); onChange(); }))}>{action.busy ? '처리 중…' : confirm === 'disconnect' ? '연결 해제' : confirm === 'rotate' ? '새 링크 만들기' : '초대 취소'}</button></div>
      </div>}
      <ErrorMessage error={action.error}/>
      {accountView&&fieldError&&<p className="field-error">{fieldError}</p>}
    </div>}
  </section>;
}

export function ConnectInvite({ token, authenticated, ready }: { token: string | null; authenticated: boolean; ready: boolean }) {
  const router = useRouter(), action = useAction(), id = useId(), nameRef = useRef<HTMLInputElement>(null);
  const invite = usePartnerResource<{ nickname: string; expires_at: string }>(token && ready ? '/api/partner/invite?token=' + token : null);
  const partner = usePartnerResource<PartnerState>(authenticated && ready ? '/api/partner' : null);
  const [nickname, setNickname] = useState(''), [fieldError, setFieldError] = useState(''), [accepted, setAccepted] = useState(false);
  const returnTo = token ? '/connect?token=' + token : '/';
  useUnsavedGuard(Boolean(nickname.trim()) && !accepted && !partner.data?.connection);
  async function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    await action.run(async () => {
      setFieldError('');
      try { await request('/api/partner/accept', 'POST', { token, nickname: nickname.trim() || partner.data?.profile?.nickname }); setAccepted(true); }
      catch (error) {
        if (error instanceof RequestError && error.issues.nickname) { setFieldError(error.issues.nickname); nameRef.current?.focus(); }
        if (!(error instanceof RequestError) || error.status === 0 || error.status >= 500 || error.status === 409 || error.status === 410) partner.refresh();
        throw error;
      }
    });
  }
  return <main className="connect-page"><div className="connect-sheet"><Link href="/" className="connect-brand">다음 장</Link>
    {accepted ? <><div className="connect-success-mark"><Check size={19}/></div><h1>연결됐어요.</h1><p className="connect-description">오늘 화면에서 {invite.data?.nickname ?? '상대'}님의 하루를 확인할 수 있어요.</p><button className="document-button primary" type="button" onClick={() => void prepareDocumentNavigation().then(canLeave => { if (canLeave) { router.replace('/'); router.refresh(); } })}>오늘로 가기</button></> : !ready ? <><h1>잠시 후 다시 확인해주세요.</h1><p className="connect-description">서비스 연결을 준비하고 있어요.</p></> : !token ? <><h1>초대 링크를 확인해주세요.</h1><p className="connect-description">상대에게 받은 초대 링크로 다시 접속해주세요.</p><Link className="document-button secondary" href="/">내 하루로</Link></> : invite.loading ? <p className="connect-description" role="status">초대를 확인하고 있어요.</p> : invite.error ? <><h1>초대를 확인할 수 없어요.</h1><ErrorMessage error={invite.error}/><button className="document-button secondary" type="button" onClick={invite.refresh}>다시 확인</button><Link className="document-button" href="/">내 하루로</Link></> : invite.data ? <>
      <p className="connect-kicker">하루 확인 초대</p><h1>{invite.data.nickname}님과<br/>서로의 하루 확인하기</h1><p className="connect-description">함께 확인하기로 선택한 계획과 실행 상태를 서로 볼 수 있어요.</p>
      <div className="connect-privacy"><span>공유되는 내용</span><p>선택한 할 일 · 실행 상태 · 측정 시간 · 공개 메모</p><span>개인 기록</span><p>개인 메모와 회고는 본인만 볼 수 있어요.</p></div>
      {!authenticated ? <><div className="connect-auth-actions"><Link className="document-button primary" href={authModePath('login', returnTo)}>로그인하고 초대 확인</Link><Link className="document-button secondary" href={authModePath('signup', returnTo)}>가입하고 초대 확인</Link></div><p className="partner-muted">로그인 후 수락을 누르면 연결돼요.</p></> : partner.loading ? <p className="partner-muted" role="status">내 연결 상태를 확인하고 있어요.</p> : partner.error ? <><ErrorMessage error={partner.error}/><button className="document-button secondary" type="button" onClick={partner.refresh}>다시 확인</button></> : partner.data?.connection ? <><p className="connect-description">이미 {partner.data.connection.nickname}님과 연결되어 있어요. 한 사람과 연결할 수 있어요.</p><Link className="document-button secondary" href="/">내 하루에서 확인</Link></> : <form onSubmit={accept} noValidate className="connect-accept-form"><label htmlFor={id + '-name'}>상대에게 보일 내 이름</label><input ref={nameRef} id={id + '-name'} autoComplete="nickname" disabled={action.busy} maxLength={48} placeholder={partner.data?.profile?.nickname || '이름 또는 별명 · 2~24자'} value={nickname} onChange={event => setNickname(event.target.value)} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? id + '-error' : undefined}/>{partner.data?.profile?.nickname && !nickname && <p className="partner-muted">현재 이름 ‘{partner.data.profile.nickname}’으로 연결해요.</p>}{fieldError && <span id={id + '-error'} className="field-error">{fieldError}</span>}<ErrorMessage error={action.error}/><button className="document-button primary" disabled={action.busy || (!nickname.trim() && !partner.data?.profile?.nickname)}>{action.busy ? '연결 중…' : '초대 수락'}</button><Link className="document-button" href="/">나중에</Link></form>}
      <p className="connect-expiry">{expiryLabel(invite.data.expires_at)}까지 수락 가능</p>
    </> : null}
  </div></main>;
}
