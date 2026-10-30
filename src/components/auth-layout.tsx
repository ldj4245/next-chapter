import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from './ui';

export function AuthLayout({ title, description, children, switchLink = { href: '/login', label: '로그인으로 돌아가기' } }: {
  title: string; description: string; children: ReactNode; switchLink?: { href: string; label: string; prompt?: string };
}) {
  return <main className="login-page">
    <header className="auth-header"><Link href="/" className="login-brand"><BrandMark/><span>다음 장</span></Link></header>
    <div className="auth-body"><section className="login-card" aria-labelledby="auth-title"><h1 id="auth-title">{title}</h1><p className="auth-description">{description}</p>{children}<p className="auth-mode-switch">{switchLink.prompt&&<span>{switchLink.prompt}</span>}<Link href={switchLink.href}>{switchLink.label}</Link></p><p className="login-footnote">기록은 기본적으로 비공개예요.</p></section></div>
  </main>;
}
