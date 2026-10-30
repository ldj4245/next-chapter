import Link from 'next/link';
export default function NotFound() {
  return <main className="state" style={{ minHeight: '100dvh', padding: 24 }}><p className="eyebrow">다음 장</p><h1>이 페이지를 찾을 수 없어요.</h1><p className="muted">주소를 확인하거나 내 서재로 돌아가주세요.</p><Link className="button primary" href="/">내 서재로</Link></main>;
}
