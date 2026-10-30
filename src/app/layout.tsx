import type { Metadata, Viewport } from 'next';
import './globals.css';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f7f7f4' };
export const metadata: Metadata = {
  title: { default: '다음 장 · 오늘의 계획과 회고', template: '%s · 다음 장' },
  description: '하루의 목표를 정하고, 실행한 이유와 얻은 것을 돌아보며 서재 기록을 함께 보관하는 나만의 공간',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
