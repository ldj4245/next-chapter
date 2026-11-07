import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '다음 장 · 계획과 회고', short_name: '다음 장', description: '하루의 목표를 정하고 실행과 얻은 것을 돌아보는 나만의 공간',
    lang: 'ko', start_url: '/', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#ffffff',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
