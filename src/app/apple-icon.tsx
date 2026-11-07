import { ImageResponse } from 'next/og';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';
export default function AppleIcon() {
  return new ImageResponse(<div style={{ background: '#3565d8', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}><div style={{ display: 'flex', width: 37, height: 87, background: 'white', borderRadius: 2 }}/><div style={{ display: 'flex', width: 33, height: 87, background: 'white', borderRadius: 2 }}/></div>, size);
}
