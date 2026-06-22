import { ImageResponse } from 'next/og';
import { SITE } from '../lib/site';

// Dynamic social share image (1200×630) generated at the edge — no binary asset
// to maintain. Next wires this into OpenGraph + Twitter for every route via the
// file-convention, so individual pages inherit it automatically.
export const runtime = 'edge';
export const alt = SITE.name;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: '#111827',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 700 }}>{SITE.name}</div>
      <div style={{ marginTop: 24, fontSize: 36, color: '#9ca3af', maxWidth: 900 }}>
        Swap what you have for what you want.
      </div>
    </div>,
    size,
  );
}
