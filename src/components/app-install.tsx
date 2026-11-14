'use client';

import { createContext, useContext, useId, useRef, useState, useEffect, useSyncExternalStore } from 'react';
import { Check, Copy, Download, Share, Smartphone, X } from 'lucide-react';
import { AppInstallController, type InstallState } from '@/lib/app-install';
import { BrandMark, closeOnBackdrop, useModal } from './ui';

type InstallContextValue = {
  state: InstallState;
  open: () => void;
  dismiss: () => void;
};
const InstallContext = createContext<InstallContextValue | null>(null);

export function AppInstallProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(() => new AppInstallController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const [guideOpen, setGuideOpen] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => controller.connect(window), [controller]);

  function open() {
    const current = controller.getSnapshot();
    if (current.busy || current.installed) return;
    setFailed(false);
    if (!current.ready) { setGuideOpen(true); return; }
    void controller.install().then(result => {
      if (result === 'failed' || result === 'unavailable') {
        setFailed(result === 'failed'); setGuideOpen(true);
      } else setGuideOpen(false);
    });
  }
  function close() { setGuideOpen(false); controller.dismiss(); }

  return <InstallContext.Provider value={{ state, open, dismiss: controller.dismiss }}>
    {children}
    {guideOpen && <InstallGuide state={state} failed={failed} install={open} close={close}/>}
  </InstallContext.Provider>;
}

export function AppInstallBanner() {
  const install = useContext(InstallContext);
  if (!install || install.state.platform === 'other' || install.state.installed || install.state.snoozed) return null;
  const { state, open, dismiss } = install;
  return <aside className="app-install-banner" aria-label="홈 화면에 추가">
    <span className="app-install-mark"><BrandMark/></span>
    <div className="app-install-copy"><strong>다음 장을 홈 화면에</strong><p>아이콘을 눌러 바로 열어보세요.</p></div>
    <button className="app-install-action" type="button" onClick={open} disabled={state.busy}>{state.busy ? '여는 중…' : state.ready ? '앱 설치' : '추가 방법'}</button>
    <button className="app-install-dismiss" type="button" aria-label="설치 안내 일주일 동안 닫기" onClick={dismiss}><X size={18} aria-hidden="true"/></button>
  </aside>;
}

export function AppInstallSetting() {
  const install = useContext(InstallContext), id = useId();
  if (!install || install.state.platform === 'other') return null;
  const { state, open } = install;
  return <section className="account-section" aria-labelledby={id}>
    <div className="account-section-heading"><h2 id={id}>이 기기에서 사용</h2><p>홈 화면에서 바로 시작해요.</p></div>
    <div className="account-section-body"><div className="account-setting-row">
      <div><h3>홈 화면에 추가</h3><p>{state.installed ? '앱으로 사용하고 있어요.' : '다음 장 아이콘을 추가하면 주소를 찾지 않아도 돼요.'}</p></div>
      {state.installed ? <span className="app-install-complete"><Check size={16} aria-hidden="true"/>추가됨</span> : <button className="document-button secondary" type="button" onClick={open} disabled={state.busy}><Smartphone size={16} aria-hidden="true"/>{state.busy ? '여는 중…' : state.ready ? '앱 설치' : '추가 방법'}</button>}
    </div></div>
  </section>;
}

function InstallGuide({ state, failed, install, close }: { state: InstallState; failed: boolean; install: () => void; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), addressRef = useRef<HTMLInputElement>(null), id = useId();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  useModal(ref);
  const ios = state.platform === 'ios';
  async function copyAddress() {
    try {
      // Exclude invite tokens, password-reset parameters and private paths.
      await navigator.clipboard.writeText(window.location.origin + '/');
      setCopyState('copied');
    } catch {
      setCopyState('manual');
      requestAnimationFrame(() => { addressRef.current?.focus(); addressRef.current?.select(); });
    }
  }
  return <dialog ref={ref} className="app-install-guide" aria-labelledby={id} aria-describedby={id + '-description'} onCancel={event => { event.preventDefault(); close(); }} onClick={event => closeOnBackdrop(event, close)}>
    <button className="dialog-close" type="button" aria-label="닫기" onClick={close}><X size={20} aria-hidden="true"/></button>
    <span className="app-install-guide-mark"><BrandMark/></span>
    <h2 id={id}>홈 화면에 다음 장 추가</h2>
    <p id={id + '-description'} className="app-install-guide-description">{state.installed ? '홈 화면의 다음 장 아이콘으로 열어보세요.' : state.embedded ? '지금 보고 있는 앱 밖에서 추가해주세요.' : '한 번 추가하면 아이콘으로 바로 열 수 있어요.'}</p>
    {failed && <p className="app-install-feedback" role="status">설치창을 열지 못했어요. 아래 방법으로 추가할 수 있어요.</p>}
    {!state.installed && <>
      {state.embedded ? <>
        <ol className="app-install-steps">
          <li><span>1</span><div>이 화면의 <strong>더보기(⋯)</strong> 메뉴를 열어요.</div></li>
          <li><span>2</span><div><strong>{ios ? 'Safari' : 'Chrome'}로 열기</strong> 또는 <strong>외부 브라우저로 열기</strong>를 선택해요.</div></li>
          <li><span>3</span><div>다음 장에 다시 접속해 <strong>홈 화면에 추가</strong> 안내를 눌러주세요.</div></li>
        </ol>
        <p className="app-install-note">메뉴가 없다면 주소를 복사해 {ios ? 'Safari' : 'Chrome'}에서 열어주세요.</p>
        <button className="button secondary wide" type="button" onClick={() => { void copyAddress(); }}><Copy size={16} aria-hidden="true"/>{copyState === 'copied' ? '주소를 복사했어요' : '사이트 주소 복사'}</button>
        {copyState === 'manual' && <label className="app-install-address">주소를 길게 눌러 복사해주세요.<input ref={addressRef} readOnly value={typeof window === 'undefined' ? '' : window.location.origin + '/'} onFocus={event => event.currentTarget.select()}/></label>}
        <span className="sr-only" role="status">{copyState === 'copied' ? '사이트 주소를 복사했어요.' : ''}</span>
      </> : ios ? <>
        <ol className="app-install-steps">
          <li><span>1</span><div>브라우저의 <strong><Share size={17} aria-hidden="true"/> 공유</strong> 버튼을 눌러요.<small>메뉴 안에 있을 수도 있어요.</small></div></li>
          <li><span>2</span><div><strong>홈 화면에 추가</strong>를 선택해요.<small>아래로 내려야 보일 수 있어요.</small></div></li>
          <li><span>3</span><div><strong>웹 앱으로 열기</strong>가 보이면 켠 뒤 <strong>추가</strong>를 눌러요.</div></li>
        </ol>
        <p className="app-install-note">항목이 보이지 않으면 Safari에서 이 사이트를 열어주세요.</p>
      </> : <>
        <ol className="app-install-steps">
          <li><span>1</span><div>브라우저의 <strong>메뉴(⋮ 또는 ☰)</strong>를 열어요.</div></li>
          <li><span>2</span><div><strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택해요.</div></li>
          <li><span>3</span><div><strong>설치</strong> 또는 <strong>추가</strong>를 눌러 마무리해요.</div></li>
        </ol>
        <p className="app-install-note">메뉴 이름은 브라우저마다 달라요. 항목이 없다면 Chrome에서 열어주세요.</p>
      </>}
      {state.ready && <button className="button primary wide app-install-native" type="button" onClick={install} disabled={state.busy}><Download size={17} aria-hidden="true"/>{state.busy ? '여는 중…' : '앱 설치'}</button>}
      <p className="app-install-note app-install-login-note">추가한 앱에서는 로그인이 한 번 더 필요할 수 있어요.</p>
    </>}
    <button className="text-button app-install-guide-close" type="button" onClick={close}>닫기</button>
  </dialog>;
}
