// PR 56 follow-up (114) — a long size word is fitted (smaller type, then two lines), never cut with "…".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fitFloor, SIZE_WORD_FIT } from './fit';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('the size word fit (follow-up 114)', () => {
  it('steps down to 9 px on a phone and 11 px on a desktop, then collapses to two lines', () => {
    expect(SIZE_WORD_FIT.sel).toBe('.pdp-page .size-pill .size-w');
    expect(fitFloor(SIZE_WORD_FIT, false)).toBe(9);
    expect(fitFloor(SIZE_WORD_FIT, true)).toBe(11);
    expect(SIZE_WORD_FIT.collapse).toBe(true);
  });

  it('the collapsed word wraps instead of ending in "…", and the shell runs the fit before it says it is done', () => {
    const css = read('../../components/shop/product/pdp.css');
    const rule = css.split('\n').find((l) => l.startsWith('.shop .pdp-page .size-w.fit-x'));
    expect(rule).toMatch(/white-space: normal/);
    expect(rule).toMatch(/text-overflow: clip/);
    const fx = read('../../components/shop/ShellEffects.tsx');
    expect(fx).toContain('fitAll(root, [SIZE_WORD_FIT])');
    expect(fx.match(/footer, words, bars, done/g)?.length).toBe(2);
  });
});
