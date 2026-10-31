'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Download, Eye, EyeOff, LogOut } from 'lucide-react';
import { parsePasswordChange, type AccountData } from '@/lib/account';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth-input';
import { InputError, type Issues } from '@/lib/domain';
import { parseNickname } from '@/lib/partner';
import { request, RequestError, useAction } from './api-client';
import { prepareDocumentNavigation, useUnsavedGuard } from './editor';
import { PartnerControls, usePartner, usePartnerResource } from './partner';
import { ErrorMessage } from './ui';
import { RecordArchives } from './record-archives';

type Operation = 'profile' | 'password' | 'logout' | 'export' | 'delete';

export function AccountHome() {
  const account = usePartnerResource<AccountData>('/api/account', false, false);
  return <div className="account-page">
    <header className="account-page-heading"><p className="eyebrow">나의 공간</p><h1>내 계정</h1><p>내 정보와 함께하는 사람, 기록을 관리해요.</p></header>
    {account.loading && <p className="account-loading" role="status">계정 정보를 불러오고 있어요.</p>}
    {account.error && <div className="account-load-error"><ErrorMessage error={account.error}/><button className="document-button secondary" type="button" onClick={account.refresh}>다시 확인</button></div>}
    {account.data && <AccountContent data={account.data} refresh={account.refresh} unavailable={Boolean(account.error)}/>}
  </div>;
}

function AccountContent({ data, refresh, unavailable }: { data: AccountData; refresh: () => void; unavailable: boolean }) {
  const router = useRouter(), id = useId(), action = useAction(), partner = usePartner();
  const operationLock = useRef(false), profileRef = useRef<HTMLInputElement>(null), passwordRef = useRef<HTMLFormElement>(null), deleteRef = useRef<HTMLFormElement>(null);
  const [operation, setOperation] = useState<Operation | null>(null), [issues, setIssues] = useState<Issues>({}), [archiveBusy, setArchiveBusy] = useState(false);
  const [nickname, setNickname] = useState(data.nickname), [savedNickname, setSavedNickname] = useState(data.nickname), [profileSaved, setProfileSaved] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false), [passwordSaved, setPasswordSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState(''), [password, setPassword] = useState(''), [passwordConfirm, setPasswordConfirm] = useState('');
  const [exported, setExported] = useState(false), [deleteOpen, setDeleteOpen] = useState(data.deletion_pending), [deletePassword, setDeletePassword] = useState(''), [confirmation, setConfirmation] = useState(''), [deleted, setDeleted] = useState(false);
  const nicknameDirty = nickname !== savedNickname, passwordDirty = Boolean(currentPassword || password || passwordConfirm), deletionDirty = Boolean(deletePassword || confirmation);
  const blocked = unavailable || data.deletion_pending, busy = action.busy || archiveBusy, fieldsDisabled = blocked || busy;
  useUnsavedGuard(!deleted && (nicknameDirty || passwordDirty || deletionDirty || busy));

  function accountChanged() { refresh(); partner.refresh(); }
  async function perform(next: Operation, task: () => Promise<void>) {
    if (operationLock.current) return;
    operationLock.current = true; setOperation(next); setIssues({});
    try {
      await action.run(async () => {
        try { await task(); }
        catch (error) {
          if (error instanceof InputError || error instanceof RequestError) {
            setIssues(error.issues);
            const field = Object.keys(error.issues)[0];
            if (next === 'profile') profileRef.current?.focus();
            else if (field) (next === 'password' ? passwordRef.current : deleteRef.current)?.querySelector<HTMLInputElement>('[name="' + field + '"]')?.focus();
          }
          throw error;
        }
      });
    } finally { operationLock.current = false; }
  }
  function fieldIssue(name: string, op: Operation) {
    return operation === op && issues[name] ? <span className="field-error" id={id + '-' + op + '-' + name}>{issues[name]}</span> : null;
  }
  function fieldErrorId(name: string, op: Operation) { return operation === op && issues[name] ? id + '-' + op + '-' + name : undefined; }
  function operationError(op: Operation) { return operation === op ? <ErrorMessage error={action.error}/> : null; }
  async function exportData() {
    // Other documents flush before creating a consistent backup; account form
    // drafts stay in this mounted page and are not implicitly submitted.
    if (!await prepareDocumentNavigation({ preserveDrafts: true })) return;
    const records = await request('/api/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'next-chapter-' + new Date().toISOString().slice(0, 10) + '.json';
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true);
  }
  async function deleteAccount() {
    try {
      const result = await request<{ deleted?: boolean }>('/api/account/delete', 'POST', { current_password: deletePassword, confirmation });
      if (result.deleted !== true) throw new Error('탈퇴 완료 여부를 확인하지 못했어요. 이 화면에서 다시 확인해주세요.');
      setDeleted(true); setDeletePassword(''); setConfirmation(''); setCurrentPassword(''); setPassword(''); setPasswordConfirm('');
      router.replace('/login'); router.refresh();
    } catch (error) { refresh(); throw error; }
  }
  return <>
    {data.deletion_pending && <div className="account-deletion-pending" role="status"><strong>탈퇴 처리를 마무리해주세요.</strong><p>삭제 준비가 시작되어 다른 변경은 잠시 멈췄어요. 일부 사진은 이미 정리됐을 수 있어요. 아래에서 비밀번호를 입력하고 탈퇴를 다시 시도해주세요.</p></div>}
    <section className="account-section" aria-labelledby={id + '-profile'}>
      <div className="account-section-heading"><h2 id={id + '-profile'}>내 정보</h2><p>연결한 상대에게는 이름만 보여요.</p></div>
      <div className="account-section-body">
        <div className="account-info-row"><span>이메일</span><p className="account-email-value">{data.email}</p></div>
        <form className="account-profile-form" noValidate onSubmit={event => { event.preventDefault(); void perform('profile', async () => {
          const value = parseNickname(nickname);
          const result = await request<{ profile: { nickname: string } }>('/api/partner/profile', 'POST', { nickname: value });
          setNickname(result.profile.nickname); setSavedNickname(result.profile.nickname); setProfileSaved(true); accountChanged();
        }); }}>
          <label htmlFor={id + '-nickname'}>이름</label>
          <div className="account-name-row"><input ref={profileRef} id={id + '-nickname'} name="nickname" autoComplete="nickname" value={nickname} maxLength={48} placeholder="이름 또는 별명" disabled={fieldsDisabled} onChange={event => { setNickname(event.target.value); setProfileSaved(false); }} aria-invalid={Boolean(fieldErrorId('nickname', 'profile'))} aria-describedby={[id + '-nickname-hint', fieldErrorId('nickname', 'profile')].filter(Boolean).join(' ')}/><button className="document-button secondary" disabled={fieldsDisabled || !nicknameDirty || !nickname.trim()}>{busy && operation === 'profile' ? '저장 중…' : '저장'}</button></div>
          <p className="field-hint" id={id + '-nickname-hint'}>2~24자. 초대와 함께 확인하기에서 사용할 이름이에요.</p>
          {fieldIssue('nickname', 'profile')}{operationError('profile')}
          {profileSaved && <p className="account-saved" role="status"><Check size={15} aria-hidden="true"/>이름을 저장했어요.</p>}
        </form>
      </div>
    </section>
    <section className="account-section" aria-labelledby={id + '-security'}>
      <div className="account-section-heading"><h2 id={id + '-security'}>계정·보안</h2><p>비밀번호와 로그인 상태를 관리해요.</p></div>
      <div className="account-section-body">
        <button type="button" className="account-disclosure" aria-expanded={passwordOpen} aria-controls={id + '-password-form'} disabled={fieldsDisabled} onClick={() => setPasswordOpen(value => !value)}><span>비밀번호 변경</span><ChevronDown size={17} aria-hidden="true" className={passwordOpen ? 'is-open' : undefined}/></button>
        <form ref={passwordRef} id={id + '-password-form'} className="account-password-form" noValidate hidden={!passwordOpen} onSubmit={event => { event.preventDefault(); void perform('password', async () => {
          parsePasswordChange({ current_password: currentPassword, password, password_confirm: passwordConfirm });
          const result = await request<{ changed?: boolean }>('/api/account/password', 'POST', { current_password: currentPassword, password, password_confirm: passwordConfirm });
          if (result.changed !== true) throw new Error('비밀번호 변경을 확인하지 못했어요. 다시 시도해주세요.');
          setCurrentPassword(''); setPassword(''); setPasswordConfirm(''); setPasswordSaved(true);
        }); }}>
          <PasswordInput id={id + '-current-password'} name="current_password" label="현재 비밀번호" value={currentPassword} onChange={value => { setCurrentPassword(value); setPasswordSaved(false); }} disabled={fieldsDisabled} errorId={fieldErrorId('current_password', 'password')}/>{fieldIssue('current_password', 'password')}
          <PasswordInput id={id + '-new-password'} name="password" label="새 비밀번호" value={password} onChange={value => { setPassword(value); setPasswordSaved(false); }} disabled={fieldsDisabled} newPassword errorId={fieldErrorId('password', 'password')} hintId={id + '-password-hint'}/>
          <p className="field-hint" id={id + '-password-hint'}>{MIN_PASSWORD_LENGTH}~{MAX_PASSWORD_LENGTH}자로 입력해주세요.</p>{fieldIssue('password', 'password')}
          <PasswordInput id={id + '-confirm-password'} name="password_confirm" label="새 비밀번호 확인" value={passwordConfirm} onChange={value => { setPasswordConfirm(value); setPasswordSaved(false); }} disabled={fieldsDisabled} newPassword errorId={fieldErrorId('password_confirm', 'password')}/>{fieldIssue('password_confirm', 'password')}
          {operationError('password')}
          <div className="account-form-actions"><button className="document-button primary" disabled={fieldsDisabled || !passwordDirty}>{busy && operation === 'password' ? '변경 중…' : '비밀번호 변경'}</button><button className="document-button" type="button" disabled={busy} onClick={() => setPasswordOpen(false)}>접기</button></div>
        </form>
        {passwordSaved && <p className="account-saved" role="status"><Check size={15} aria-hidden="true"/>비밀번호를 변경했어요.</p>}
        <Link className="account-recovery-link" href="/forgot-password">현재 비밀번호를 잊었나요?</Link>
        <div className="account-setting-row"><div><h3>로그아웃</h3><p>이 기기에서 로그아웃해요.</p></div><button className="document-button secondary" type="button" disabled={busy} onClick={() => {
          // Ask about explicit form drafts before taking the action lock; the
          // lock itself is also guarded while a request is in flight.
          void prepareDocumentNavigation().then(ready => { if (ready) void perform('logout', async () => { await request('/api/auth/logout', 'POST', {}); setDeleted(true); router.replace('/login'); router.refresh(); }); });
        }}><LogOut size={15} aria-hidden="true"/>{busy && operation === 'logout' ? '처리 중…' : '로그아웃'}</button></div>{operationError('logout')}
      </div>
    </section>
    <section className="account-section" aria-labelledby={id + '-partner'}>
      <div className="account-section-heading"><h2 id={id + '-partner'}>함께하는 사람</h2><p>한 사람과 서로의 하루를 확인해요.</p></div>
      <div className="account-section-body">
        {partner.loading && <p className="field-hint" role="status">연결 상태를 확인하고 있어요.</p>}
        {partner.error && <><ErrorMessage error={partner.error}/><button className="document-button secondary" type="button" disabled={busy} onClick={partner.refresh}>다시 확인</button></>}
        {partner.data && <fieldset disabled={fieldsDisabled || Boolean(partner.error)}><PartnerControls state={partner.data} variant="account" onChange={accountChanged}/></fieldset>}
      </div>
    </section>
    <section className="account-section" aria-labelledby={id + '-records'}>
      <div className="account-section-heading"><h2 id={id + '-records'}>내 기록 관리</h2><p>기록을 보관하거나 계정을 정리해요.</p></div>
      <div className="account-section-body">
        <div className="account-setting-row"><div><h3>기록 내보내기</h3><p>서재·계획·회고와 사진 목록을 JSON으로 보관해요. 사진 파일 자체는 포함되지 않아요.</p></div><button className="document-button secondary" type="button" disabled={busy || unavailable} onClick={() => void perform('export', exportData)}><Download size={15} aria-hidden="true"/>{busy && operation === 'export' ? '준비 중…' : '내보내기'}</button></div>
        {exported && <p className="account-saved" role="status"><Check size={15} aria-hidden="true"/>백업 파일을 준비했어요.</p>}{operationError('export')}
        <RecordArchives disabled={blocked || action.busy} onBusy={setArchiveBusy}/>
        <div className="account-delete-area">
          <button className="account-disclosure account-delete-toggle" type="button" disabled={busy} aria-expanded={deleteOpen || data.deletion_pending} aria-controls={id + '-delete-form'} onClick={() => setDeleteOpen(value => !value)}><span>회원 탈퇴</span><ChevronDown size={17} aria-hidden="true" className={deleteOpen || data.deletion_pending ? 'is-open' : undefined}/></button>
          <form ref={deleteRef} id={id + '-delete-form'} className="account-delete-form" noValidate hidden={!deleteOpen && !data.deletion_pending} onSubmit={event => { event.preventDefault(); void perform('delete', deleteAccount); }}>
            <p className="account-delete-description">내 서재·메모·계획·회고·사진과 계정이 영구 삭제돼요. 상대와의 연결도 해제되며, 상대가 작성한 기록은 남아요. 삭제한 내 기록은 복구할 수 없어요.</p>
            <p className="field-hint">필요한 기록을 먼저 내보낸 뒤 진행해주세요. 직접 Arweave에 올린 암호화 보관본과 기기에 받은 복구 파일은 탈퇴해도 남아요.</p>
            <PasswordInput id={id + '-delete-password'} name="current_password" label="현재 비밀번호" value={deletePassword} onChange={setDeletePassword} disabled={busy || unavailable} errorId={fieldErrorId('current_password', 'delete')}/>{fieldIssue('current_password', 'delete')}
            <label className="account-confirm-label" htmlFor={id + '-delete-confirm'}>확인을 위해 ‘탈퇴’를 입력해주세요.</label><input id={id + '-delete-confirm'} name="confirmation" value={confirmation} autoComplete="off" maxLength={10} disabled={busy || unavailable} onChange={event => setConfirmation(event.target.value)} aria-invalid={Boolean(fieldErrorId('confirmation', 'delete'))} aria-describedby={fieldErrorId('confirmation', 'delete')}/>{fieldIssue('confirmation', 'delete')}
            {operationError('delete')}
            <div className="account-form-actions"><button className="button danger" disabled={busy || unavailable || !deletePassword || confirmation !== '탈퇴'}>{busy && operation === 'delete' ? '삭제 중…' : data.deletion_pending ? '탈퇴 다시 시도' : '계정과 기록 영구 삭제'}</button>{!data.deletion_pending && <button className="document-button" type="button" disabled={busy} onClick={() => setDeleteOpen(false)}>접기</button>}</div>
          </form>
        </div>
      </div>
    </section>
  </>;
}

function PasswordInput({ id, name, label, value, onChange, disabled, errorId, hintId, newPassword = false }: { id: string; name: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean; errorId?: string; hintId?: string; newPassword?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className="account-password-field"><label htmlFor={id}>{label}</label><span className="password-field"><input id={id} name={name} type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} autoComplete={newPassword ? 'new-password' : 'current-password'} required minLength={newPassword ? MIN_PASSWORD_LENGTH : 1} maxLength={MAX_PASSWORD_LENGTH} disabled={disabled} aria-invalid={Boolean(errorId)} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}/><button className="password-toggle" type="button" disabled={disabled} aria-label={label + (visible ? ' 숨기기' : ' 보기')} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={19} aria-hidden="true"/> : <Eye size={19} aria-hidden="true"/>}</button></span></div>;
}
