'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarDays, Flag, Library, Compass, Plus, Search, LockKeyhole, PencilLine, FolderOpen, SlidersHorizontal } from 'lucide-react';
import { BrandMark } from './ui';
import { QuickCapture } from './memory';
import { RecordAnchor } from './record-anchor';

const links = [
  { href: '/', label: '오늘의 계획', mobile: '오늘', Icon: CalendarDays, desktopOnly:false },
  { href: '/goals', label: '단기·장기 목표', mobile: '목표', Icon: Flag, desktopOnly:false },
  { href: '/library', label: '내 서재', mobile: '서재', Icon: Library, desktopOnly:false },
  { href: '/resources', label: '학습 자료함', mobile: '자료', Icon: FolderOpen, desktopOnly:false },
  { href: '/discover', label: '작품 발견', mobile: '발견', Icon: Compass, desktopOnly:false },
  { href: '/reading', label: '독서 타이머', mobile: '독서', Icon: BookOpen, desktopOnly:true },
];

export function AppShell({ email, children, admin = false }: { email: string; children: React.ReactNode; admin?: boolean }) {
  const pathname = usePathname();
  const [captureOpen,setCaptureOpen]=useState(false);
  const accountActive = pathname === '/account';
  const current = links.find(link => link.href === '/' ? pathname === '/' : pathname.startsWith(link.href));
  return <div className="app-shell">
    <a className="skip-link" href="#main">본문으로 이동</a>
    <aside className="sidebar">
      <Link href="/" className="brand"><BrandMark/><span>다음 장<small>계획 · 회고 · 서재</small></span></Link>
      <nav aria-label="주요 메뉴">{links.map(({ href, label, mobile, Icon, desktopOnly }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={[active?'active':'',desktopOnly?'nav-desktop-only':''].filter(Boolean).join(' ')}><Icon size={21} strokeWidth={1.7} aria-hidden="true"/><span className="nav-desktop-label">{label}</span><span className="nav-mobile-label">{mobile}</span></Link>;
      })}</nav>
      <Link className="sidebar-add button secondary" href="/library/new"><Plus size={18} aria-hidden="true"/>작품 추가</Link>
      <div className="sidebar-bottom">{admin && <Link className="sidebar-admin-link" href="/admin"><SlidersHorizontal size={16}/>관리</Link>}<p className="sidebar-note"><LockKeyhole size={14} aria-hidden="true"/>나의 기록</p><Link className="account" href="/account" aria-current={accountActive ? 'page' : undefined}><span className="avatar">나</span><span><strong>내 계정</strong><span className="account-email">{email}</span></span></Link></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><Link href="/" className="mobile-brand"><BrandMark/><span>다음 장</span></Link><p className="breadcrumb">나의 공간<span aria-hidden="true">/</span>{accountActive ? '내 계정' : pathname === '/search'?'기록 검색':pathname==='/notes'?'메모':pathname==='/revisit'?'지난 기록':pathname === '/library/new' ? '작품 추가' : pathname.startsWith('/library/') ? '작품 기록' : current?.label}</p>
        <div className="topbar-actions"><Link className="top-search-link" href="/search" aria-label="내 기록 검색" aria-current={pathname==='/search'?'page':undefined}><Search size={20} aria-hidden="true"/><span>기록 검색</span></Link><button className="top-search-link top-memo-trigger" type="button" aria-label="빠른 메모" aria-expanded={captureOpen} aria-controls="quick-capture" onClick={()=>setCaptureOpen(open=>!open)}><PencilLine size={20} aria-hidden="true"/><span>메모</span></button><Link href="/account" className={'account-trigger'+(accountActive?' account-selected':'')} aria-label="내 계정과 기록 내보내기"><span className="avatar">나</span></Link></div>
      </header>
      <QuickCapture open={captureOpen} onClose={()=>setCaptureOpen(false)}/>
      <RecordAnchor/>
      <main id="main" tabIndex={-1} className="main-content">{children}<footer className="page-footer"><span>다음 장</span><Link href="/privacy">개인정보처리방침</Link></footer></main>
    </div>
  </div>;
}
