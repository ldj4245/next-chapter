'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { parseSignup, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '@/lib/auth-input';
import { InputError, type Issues } from '@/lib/domain';
import { request, RequestError, useAction } from './api-client';
import { ErrorMessage } from './ui';
import { AuthLayout } from './auth-layout';
import { authModePath, authReturnPath } from '@/lib/auth-return';
export function AuthForm({ ready, mode = 'login', returnTo = '/' }: { ready: boolean; mode?: 'login' | 'signup'; returnTo?: string }) {
  const action=useAction(), signup=mode==='signup';
  const [issues,setIssues]=useState<Issues>({}), [confirmation,setConfirmation]=useState(false);
  const [navigating,setNavigating]=useState(false);
  const [showPassword, setShowPassword] = useState(false), [showConfirmation, setShowConfirmation] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const name = ['email', 'password', 'password_confirm'].find(field => issues[field]);
    const field = name && formRef.current?.elements.namedItem(name);
    if (field instanceof HTMLElement) field.focus();
  }, [issues]);
  const issue = (field: string) => issues[field] ? <span id={'auth-error-'+field} className="field-error">{issues[field]}</span> : null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (navigating) return;
    const form=new FormData(event.currentTarget);
    await action.run(async()=>{
      setIssues({});
      try {
        const input={email:form.get('email'),password:form.get('password'),password_confirm:form.get('password_confirm')};
        if (signup) parseSignup(input);
        const result=await request<{signedIn:boolean;confirmationRequired?:boolean}>('/api/auth/'+mode,'POST',input);
        if (result.confirmationRequired) { setConfirmation(true); return; }
        if (!result.signedIn) throw new Error('로그인 상태를 확인하지 못했어요. 다시 시도해주세요.');
        // Start a new document after Set-Cookie has arrived, so unauthenticated
        // prefetched routes and concurrent router refreshes cannot win navigation.
        setNavigating(true);
        window.location.replace(new URL(authReturnPath(returnTo), window.location.origin).href);
      } catch (error) {
        if (error instanceof InputError || error instanceof RequestError) setIssues(error.issues);
        throw error;
      }
    });
  }
  const invited=authReturnPath(returnTo)!=='/';
  return <AuthLayout title={signup?'회원가입':'로그인'} description={invited?(signup?'가입 후 초대를 확인할 수 있어요.':'로그인 후 초대를 확인할 수 있어요.'):(signup?'오늘의 계획과 하루의 생각을 기록하세요.':'가입한 이메일로 로그인하세요.')} switchLink={{href:authModePath(signup?'login':'signup',returnTo),label:signup?'로그인':'회원가입',prompt:signup?'이미 계정이 있나요?':'계정이 없나요?'}}>
      {confirmation?<p className="success" role="status">인증 메일을 확인한 뒤 로그인해주세요.</p>:<form ref={formRef} onSubmit={submit} noValidate={signup}>
        <div className="auth-field"><label htmlFor="auth-email">이메일</label><input id="auth-email" name="email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} autoComplete={signup?'email':'username'} required maxLength={254} placeholder="name@example.com" aria-invalid={Boolean(issues.email)} aria-describedby={issues.email?'auth-error-email':undefined}/>{issue('email')}</div>
        <div className="auth-field"><label htmlFor="auth-password">비밀번호</label><span className="password-field"><input id="auth-password" name="password" type={showPassword?'text':'password'} autoComplete={signup?'new-password':'current-password'} required minLength={signup?MIN_PASSWORD_LENGTH:6} maxLength={MAX_PASSWORD_LENGTH} aria-invalid={Boolean(issues.password)} aria-describedby={[signup?'signup-password-hint':'',issues.password?'auth-error-password':''].filter(Boolean).join(' ')||undefined}/><button className="password-toggle" type="button" aria-label={showPassword?'비밀번호 숨기기':'비밀번호 보기'} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></span>{signup&&<span id="signup-password-hint" className="field-hint">{MIN_PASSWORD_LENGTH}자 이상</span>}{issue('password')}{!signup&&<p className="auth-forgot"><Link href="/forgot-password">비밀번호 찾기</Link></p>}</div>
        {signup&&<div className="auth-field"><label htmlFor="auth-password-confirm">비밀번호 확인</label><span className="password-field"><input id="auth-password-confirm" name="password_confirm" type={showConfirmation?'text':'password'} autoComplete="new-password" required maxLength={MAX_PASSWORD_LENGTH} aria-invalid={Boolean(issues.password_confirm)} aria-describedby={issues.password_confirm?'auth-error-password_confirm':undefined}/><button className="password-toggle" type="button" aria-label={showConfirmation?'확인 비밀번호 숨기기':'확인 비밀번호 보기'} aria-pressed={showConfirmation} onClick={()=>setShowConfirmation(!showConfirmation)}>{showConfirmation?<EyeOff size={19}/>:<Eye size={19}/>}</button></span>{issue('password_confirm')}</div>}
        <ErrorMessage error={action.error||(!ready?'지금은 계정에 연결할 수 없어요. 잠시 후 다시 시도해주세요.':'')}/>
        <button className="button primary wide" disabled={action.busy||navigating||!ready}>{navigating?'이동 중…':action.busy?(signup?'가입 중…':'로그인 중…'):(signup?'가입하기':'로그인')}</button>
      </form>}
  </AuthLayout>;
}
