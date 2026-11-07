'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarDays, Flag, Library, Compass, Plus, Search, PencilLine, FolderOpen, SlidersHorizontal } from 'lucide-react';
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
  return <div className="app-shell">
    <a className="skip-link" href="#main">본문으로 이동</a>
    <header className="app-header"><div className="header-inner">
      <Link href="/" className="brand"><BrandMark/><span>다음 장</span></Link>
      <div className="sidebar">
      <nav aria-label="주요 메뉴">{links.map(({ href, label, mobile, Icon, desktopOnly }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={[active?'active':'',desktopOnly?'nav-desktop-only':''].filter(Boolean).join(' ')}><Icon size={21} strokeWidth={1.7} aria-hidden="true"/><span className="nav-desktop-label">{label}</span><span className="nav-mobile-label">{mobile}</span></Link>;
      })}</nav>
      </div>
      <div className="topbar-actions">
        <Link className="top-search-link" href="/search" aria-label="내 기록 검색" aria-current={pathname==='/search'?'page':undefined}><Search size={19} aria-hidden="true"/><span>검색</span></Link>
        <button className="top-search-link top-memo-trigger" type="button" aria-label="빠른 메모" aria-expanded={captureOpen} aria-controls="quick-capture" onClick={()=>setCaptureOpen(open=>!open)}><PencilLine size={19} aria-hidden="true"/><span>메모</span></button>
        <Link className="header-library-add button secondary" href="/library/new"><Plus size={16} aria-hidden="true"/>작품 추가</Link>
        {admin && <Link className="top-search-link header-admin" href="/admin" aria-label="관리자 대시보드"><SlidersHorizontal size={18} aria-hidden="true"/><span>관리</span></Link>}
        <Link href="/account" className={'account-trigger'+(accountActive?' account-selected':'')} aria-label="내 계정과 기록 내보내기" aria-current={accountActive?'page':undefined} title={email}><span className="avatar">나</span></Link>
      </div>
    </div></header>
    <div className="app-main">
      <QuickCapture open={captureOpen} onClose={()=>setCaptureOpen(false)}/>
      <RecordAnchor/>
      <main id="main" tabIndex={-1} className="main-content">{children}<footer className="page-footer"><span>다음 장</span><Link href="/privacy">개인정보처리방침</Link></footer></main>
    </div>
  </div>;
}
