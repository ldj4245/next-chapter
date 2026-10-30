'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { parseEmail, parseNewPassword, parseRecoverySession, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '@/lib/auth-input';
import { InputError, type Issues } from '@/lib/domain';
import { request, RequestError, useAction } from './api-client';
import { ErrorMessage } from './ui';
import { AuthLayout } from './auth-layout';

function useFormIssues() {
  const formRef = useRef<HTMLFormElement>(null), [issues, setIssues] = useState<Issues>({});
  useEffect(() => {
    const name = ['email', 'password', 'password_confirm'].find(field => issues[field]);
    const field = name && formRef.current?.elements.namedItem(name);
    if (field instanceof HTMLElement) field.focus();
  }, [issues]);
  return { formRef, issues, setIssues, capture: (error: unknown) => { if (error instanceof InputError || error instanceof RequestError) setIssues(error.issues); }, issue: (field: string) => issues[field] ? <span id={'recovery-error-' + field} className="field-error">{issues[field]}</span> : null };
}
export function ForgotPassword({ ready }: { ready: boolean }) {
  const action = useAction(), { formRef, issues, setIssues, capture, issue } = useFormIssues();
  const [email, setEmail] = useState(''), [sent, setSent] = useState(''), [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  return <AuthLayout title="비밀번호 재설정" description="가입한 이메일로 재설정 링크를 받아보세요.">
    {sent && <div className="recovery-success" role="status"><strong>재설정 메일을 요청했어요.</strong><p>{sent}</p><p>가입된 이메일이면 링크가 도착해요. 받은편지함과 스팸메일함을 확인해주세요.</p></div>}
    <form ref={formRef} noValidate onSubmit={event => {
      event.preventDefault(); void action.run(async () => {
        setIssues({});
        try { const address = parseEmail(email); await request('/api/auth/forgot-password', 'POST', { email: address }); setSent(address); setCooldown(60); }
        catch (error) { capture(error); throw error; }
      });
    }}><div className="auth-field"><label htmlFor="recovery-email">가입한 이메일</label><input id="recovery-email" name="email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" aria-invalid={Boolean(issues.email)} aria-describedby={issues.email ? 'recovery-error-email' : undefined}/>{issue('email')}</div>
      <ErrorMessage error={action.error || (!ready ? '잠시 후 다시 접속해주세요.' : '')}/>
      <button className="button primary wide" disabled={action.busy || !ready || Boolean(cooldown)}>{action.busy ? '요청 중…' : cooldown ? `${cooldown}초 후 다시 보내기` : sent ? '다시 보내기' : '재설정 메일 받기'}</button>
    </form>
  </AuthLayout>;
}
export function ResetPassword({ ready, token, authenticated }: { ready: boolean; token: string | null; authenticated: boolean }) {
  const action = useAction(), { formRef, issues, setIssues, capture, issue } = useFormIssues();
  const [verified, setVerified] = useState(authenticated && !token), [done, setDone] = useState(false);
  const [linkState, setLinkState] = useState<'ready' | 'checking' | 'missing' | 'error'>(token ? 'ready' : 'checking');
  const [linkError, setLinkError] = useState('');
  const [canRetryLink, setCanRetryLink] = useState(false);
  const recoverySession = useRef<ReturnType<typeof parseRecoverySession> | null>(null);
  const incomingSession = useRef<{ access_token: string | null; refresh_token: string | null } | null>(null);
  const [showPassword, setShowPassword] = useState(false), [showConfirmation, setShowConfirmation] = useState(false);
  useEffect(() => {
    // Default Supabase email links carry a session in the fragment. Validate it
    // on the server and remove it from the address bar; never use localStorage.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.get('type') === 'recovery') incomingSession.current = { access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token') };
    if (token || fragment.has('access_token') || fragment.has('error')) window.history.replaceState(window.history.state, '', window.location.pathname);
    if (token) return;
    let stopped = false;
    void Promise.resolve().then(async () => {
      if (stopped) return;
      if (!incomingSession.current) { setLinkState(authenticated ? 'ready' : 'missing'); return; }
      setVerified(false);
      try {
        const session = parseRecoverySession(incomingSession.current);
        recoverySession.current = session; setCanRetryLink(true);
        await request('/api/auth/recovery-session', 'POST', session);
        if (!stopped) { setVerified(true); setLinkState('ready'); setCanRetryLink(false); recoverySession.current = null; incomingSession.current = null; }
      } catch (error) { if (!stopped) { setLinkError(error instanceof Error ? error.message : '새 재설정 링크를 받아주세요.'); setLinkState('error'); } }
    });
    return () => { stopped = true; };
  }, [token, authenticated]);
  return <AuthLayout title={done ? '비밀번호를 변경했어요' : '새 비밀번호 설정'} description={done ? '새 비밀번호를 사용할 수 있어요.' : '새로 사용할 비밀번호를 입력해주세요.'}>
    {done ? <div className="recovery-success" role="status"><p>기존 서재와 하루 기록은 그대로 남아 있어요.</p><Link className="button primary wide" href="/">오늘의 계획으로</Link></div> : linkState === 'checking' ? <p className="recovery-success" role="status">재설정 링크를 확인하고 있어요…</p> : linkState === 'missing' || linkState === 'error' ? <div className="recovery-success"><ErrorMessage error={linkError}/><p>이메일의 재설정 링크로 접속해주세요. 만료됐거나 사용한 링크는 새로 받을 수 있어요.</p>{canRetryLink && <button className="text-button" disabled={action.busy} onClick={() => action.run(async () => { if (!recoverySession.current) return; await request('/api/auth/recovery-session', 'POST', recoverySession.current); recoverySession.current = null; incomingSession.current = null; setVerified(true); setLinkError(''); setCanRetryLink(false); setLinkState('ready'); })}>링크 다시 확인</button>}<ErrorMessage error={action.error}/><Link className="button primary wide" href="/forgot-password">재설정 링크 받기</Link></div> : <form ref={formRef} noValidate onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void action.run(async () => {
        setIssues({});
        try {
          const input = { password: form.get('password'), password_confirm: form.get('password_confirm') }; parseNewPassword(input);
          if (!verified) { await request('/api/auth/recovery', 'POST', { token_hash: token }); setVerified(true); }
          await request('/api/auth/reset-password', 'POST', input);
          setDone(true); formRef.current?.reset();
        } catch (error) { capture(error); throw error; }
      });
    }}>
      <div className="auth-field"><label htmlFor="recovery-password">새 비밀번호</label><span className="password-field"><input id="recovery-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} aria-invalid={Boolean(issues.password)} aria-describedby={['recovery-password-hint', issues.password ? 'recovery-error-password' : ''].filter(Boolean).join(' ')}/><button className="password-toggle" type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></span><span className="field-hint" id="recovery-password-hint">{MIN_PASSWORD_LENGTH}자 이상</span>{issue('password')}</div>
      <div className="auth-field"><label htmlFor="recovery-password-confirm">새 비밀번호 확인</label><span className="password-field"><input id="recovery-password-confirm" name="password_confirm" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required maxLength={MAX_PASSWORD_LENGTH} aria-invalid={Boolean(issues.password_confirm)} aria-describedby={issues.password_confirm ? 'recovery-error-password_confirm' : undefined}/><button className="password-toggle" type="button" aria-label={showConfirmation ? '확인 비밀번호 숨기기' : '확인 비밀번호 보기'} aria-pressed={showConfirmation} onClick={() => setShowConfirmation(value => !value)}>{showConfirmation ? <EyeOff size={19}/> : <Eye size={19}/>}</button></span>{issue('password_confirm')}</div>
      <ErrorMessage error={action.error || (!ready ? '잠시 후 다시 접속해주세요.' : '')}/>
      <button className="button primary wide" disabled={action.busy || !ready}>{action.busy ? '변경 중…' : '비밀번호 변경'}</button>
    </form>}
    {!done && <p className="auth-switch"><Link href="/forgot-password">재설정 링크 다시 받기</Link></p>}
  </AuthLayout>;
}
