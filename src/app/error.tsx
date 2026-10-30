'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="state panel" role="alert"><h2>서재를 불러오지 못했어요.</h2><p className="muted">잠시 후 다시 시도해주세요.</p><button className="button primary" onClick={reset}>다시 시도</button><Link className="back-link" href="/login">로그인 화면으로</Link></div>;
}
