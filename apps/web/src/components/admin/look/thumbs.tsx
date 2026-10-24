// PR 12 (CN-025) — the small pictures of each design on Settings → Admin look (demo 97z-adm2-rd1-core.js a3Thumb): a
// 240 × 150 sketch of the page's layout in the design's own colours. Pictures only: no figures, no words.
import type { ReactNode } from 'react';

type Ink = { bg: string; side: string; top: string | null; ink: string; acc: string };
const INK: Record<string, Ink> = {
  A: { bg: '#F6F4EF', side: '#12302A', top: null, ink: '#1F4E46', acc: '#C9A14A' },
  B: { bg: '#F7F5F0', side: '#F1EEE6', top: '#1D3B2F', ink: '#2F6550', acc: '#B8913F' },
  C: { bg: '#F4F5F2', side: '#F1EEE6', top: '#1D3B2F', ink: '#1F6B54', acc: '#4C6A92' },
};
const OTHER: Ink = { bg: '#F6F4EF', side: '#E8E3D8', top: '#1D3B2F', ink: '#2F6550', acc: '#B8913F' };

function sketch(page: string, id: string): ReactNode[] {
  const B = INK[id] ?? OTHER;
  const out: ReactNode[] = [];
  let k = 0;
  const r = (x: number, y: number, w: number, h: number, f: string, rx = 3) => out.push(<rect key={k++} x={x} y={y} width={w} height={h} rx={rx} fill={f} />);
  const path = (d: string, stroke: string, w: number) => out.push(<path key={k++} d={d} fill="none" stroke={stroke} strokeWidth={w} />);
  r(0, 0, 240, 150, B.bg, 0);
  if (B.top) {
    r(0, 0, 240, 14, B.top, 0);
    r(0, 14, 18, 136, B.side, 0);
  } else r(0, 0, 40, 150, B.side, 0);
  const x0 = B.top ? 26 : 48;
  const y0 = B.top ? 22 : 10;
  const W = 240 - x0 - 8;
  if (page === 'dashboard') {
    if (id === 'A') {
      for (let i = 0; i < 4; i++) r(x0 + i * (W / 4), y0, W / 4 - 5, 22, '#fff');
      r(x0, y0 + 28, W * 0.64, 58, '#fff');
      path(`M${x0 + 6} ${y0 + 72} q20 -18 40 -6 t40 -10 t40 4`, B.ink, 2);
      r(x0 + W * 0.66, y0 + 28, W * 0.34 - 5, 58, '#fff');
      for (let j = 0; j < 3; j++) r(x0 + j * (W / 3), y0 + 92, W / 3 - 5, 38, '#fff');
    } else if (id === 'B') {
      r(x0, y0, W * 0.7, 64, '#fff', 5);
      path(`M${x0 + 8} ${y0 + 50} q22 -14 44 -4 t44 -8 t44 -10`, B.ink, 2.2);
      r(x0 + 8, y0 + 8, 46, 9, B.ink, 2);
      for (let i = 0; i < 3; i++) r(x0 + W * 0.72, y0 + i * 22, W * 0.28 - 2, 19, '#fff', 4);
      r(x0, y0 + 70, W, 20, '#fff', 4);
      for (let m = 0; m < 4; m++) r(x0 + m * (W / 4), y0 + 96, W / 4 - 4, 30, '#fff', 4);
    } else {
      for (let t = 0; t < 6; t++) {
        r(x0 + t * (W / 6), y0, W / 6 - 3, 18, '#fff', 3);
        path(`M${x0 + t * (W / 6) + 4} ${y0 + 14} l6 -4 l6 2 l8 -6`, B.ink, 1.2);
      }
      r(x0, y0 + 24, W * 0.66, 56, '#fff', 3);
      for (let b = 0; b < 14; b++) {
        const hh = 10 + ((b * 7) % 26);
        r(x0 + 6 + b * 10, y0 + 74 - hh, 6, hh, b % 3 ? B.ink : B.acc, 1);
      }
      r(x0 + W * 0.68, y0 + 24, W * 0.32 - 2, 102, '#fff', 3);
      for (let f = 0; f < 6; f++) r(x0 + W * 0.7, y0 + 32 + f * 15, W * 0.26, 4, '#E3E0D8', 2);
      r(x0, y0 + 86, W * 0.32, 40, '#fff', 3);
      r(x0 + W * 0.34, y0 + 86, W * 0.32, 40, '#fff', 3);
    }
  } else if (page === 'orders') {
    if (id === 'C') {
      for (let s = 0; s < 5; s++) {
        r(x0 + s * ((W * 0.7) / 5), y0, (W * 0.7) / 5 - 3, 20, '#fff', 3);
        r(x0 + s * ((W * 0.7) / 5) + 4, y0 + 14, ((W * 0.7) / 5 - 12) * (1 - s * 0.15), 3, B.ink, 1);
      }
      r(x0 + W * 0.72, y0, W * 0.28 - 2, 120, '#fff', 3);
      for (let q = 0; q < 9; q++) {
        r(x0, y0 + 26 + q * 10.5, W * 0.7, 9, q % 2 ? '#fff' : '#FBFAF7', 1);
        r(x0 + 4, y0 + 29 + q * 10.5, 22, 3, '#C9C4B9', 1);
        r(x0 + W * 0.45, y0 + 29 + q * 10.5, 18, 3, q % 3 ? B.ink : B.acc, 1);
      }
    } else {
      r(x0, y0, 60, 10, id === 'B' ? '#fff' : '#E8E3D8', 3);
      r(x0 + 64, y0, 40, 10, '#ECE8DF', 3);
      for (let q = 0; q < 8; q++) {
        r(x0, y0 + 16 + q * 14, W, 12, '#fff', id === 'B' ? 2 : 1);
        r(x0 + 6, y0 + 20 + q * 14, 24, 4, '#9AA09C', 1);
        r(x0 + W * 0.55, y0 + 20 + q * 14, 26, 4, q % 3 ? B.ink : '#D9A23D', 1);
        if (id === 'B') r(x0 + W * 0.55, y0 + 25 + q * 14, 26, 1.5, '#E1DCD2', 1);
        else {
          r(x0 + W * 0.72, y0 + 20 + q * 14, 16, 4, '#C9C4B9', 2);
          r(x0 + W * 0.8, y0 + 20 + q * 14, 16, 4, '#C9C4B9', 2);
        }
      }
    }
  } else if (id === 'B') {
    const tint = ['#E1E6EE', '#E9EFE9', '#EEE9E2', '#E6E2EA', '#E9E6DE'];
    const cloth = ['#2C3E5C', '#3E6B4F', '#7A5A3A', '#5C4A6E', '#2F2F2F'];
    for (let c = 0; c < 5; c++)
      for (let rw = 0; rw < 2; rw++) {
        const cx = x0 + c * (W / 5);
        const cy = y0 + rw * 62;
        r(cx, cy, W / 5 - 5, 56, '#fff', 4);
        r(cx, cy, W / 5 - 5, 34, tint[c]!, 4);
        out.push(<path key={k++} d={`M${cx + 10} ${cy + 10} l6 -3 h6 l6 3 l-2 5 h-2 v12 h-14 v-12 h-2z`} fill={cloth[c]} />);
        r(cx + 4, cy + 40, 26, 4, '#9AA09C', 1);
        r(cx + 4, cy + 47, 14, 4, B.ink, 1);
      }
  } else if (id === 'C') {
    for (let i = 0; i < 4; i++) r(x0 + i * (W / 4), y0, W / 4 - 4, 18, '#fff', 3);
    for (let rw = 0; rw < 8; rw++) {
      r(x0, y0 + 24 + rw * 13, W, 11, rw % 2 ? '#fff' : '#FBFAF7', 1);
      r(x0 + 4, y0 + 26 + rw * 13, 8, 7, '#C9D3CE', 1);
      path(`M${x0 + W * 0.4} ${y0 + 32 + rw * 13} l5 -3 l5 1 l6 -4 l6 2`, B.ink, 1);
      for (let hz = 0; hz < 5; hz++) r(x0 + W * 0.62 + hz * 9, y0 + 26 + rw * 13, 7, 7, `rgba(31,107,84,${0.15 + (((hz + rw) * 37) % 80) / 100})`, 1);
    }
  } else {
    for (let rw = 0; rw < 9; rw++) {
      r(x0, y0 + rw * 13, W, 11, '#fff', 1);
      r(x0 + 4, y0 + 2 + rw * 13, 7, 7, '#C9D3CE', 1);
      r(x0 + 16, y0 + 4 + rw * 13, 40, 3, '#9AA09C', 1);
      r(x0 + W * 0.6, y0 + 3 + rw * 13, 18, 5, rw % 4 ? '#DDEDE3' : '#FBEAD0', 2);
    }
  }
  return out;
}

/** A design's picture (any page, any key; an unknown key gets the neutral sketch). */
export function LookThumb({ page, id }: { page: string; id: string }) {
  return (
    <svg className="a3-thumb" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
      {sketch(page, id)}
    </svg>
  );
}
