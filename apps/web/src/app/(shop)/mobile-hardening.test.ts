// PR 85 (storefront side of mobile hardening, Blueprint D1.4). The device gate (tools/device-gate.mjs, CI) measures
// the rendered pages: sideways overflow, 44 × 44 taps, 16 px fields. These checks guard what it does not look at:
// "no accidental zoom". Pinch zoom must stay allowed (checklist L22) and a quick second tap on a control must not
// zoom the page (touch-action: manipulation).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('mobile hardening (PR 85)', () => {
  it('the viewport keeps pinch zoom: no maximum scale, no user-scalable=no', () => {
    const src = read('../layout.tsx');
    const viewport = /export const viewport[^;]*;/.exec(src)?.[0] ?? '';
    expect(viewport).toContain("width: 'device-width'");
    expect(viewport).not.toMatch(/maximumScale|userScalable|minimumScale/);
  });

  it('shop controls opt out of double-tap zoom', () => {
    const rule = /([^}]*)\{\s*touch-action:\s*manipulation;?\s*\}/.exec(read('./shop.css'))?.[1] ?? '';
    for (const sel of ['.shop a', '.shop button', '.shop input', '.shop label', '.shop .iconbtn']) expect(rule).toContain(sel);
  });

  it('the invisible tap layers only grow a target, never shrink or move it', () => {
    const css = read('./shop-app.css');
    const layer = /a\.logo::before,[\s\S]*?\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(layer).toContain('width: max(100%, 44px)');
    expect(layer).toContain('height: max(100%, 44px)');
    expect(layer).toContain('translate(-50%, -50%)');
    expect(layer).not.toMatch(/background|border|color/);
  });
});
