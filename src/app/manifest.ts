import type { MetadataRoute } from 'next';
import icon192 from './app-icons/icon-192.png';
import icon512 from './app-icons/icon-512.png';
import maskable512 from './app-icons/icon-maskable-512.png';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '다음 장 · 계획과 회고', short_name: '다음 장', description: '하루의 목표를 정하고 실행과 얻은 것을 돌아보는 나만의 공간',
    id: '/', lang: 'ko', start_url: '/', scope: '/', display: 'standalone', background_color: '#f7f7f4', theme_color: '#f7f7f4',
    icons: [
      { src: icon192.src, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512.src, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: maskable512.src, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
