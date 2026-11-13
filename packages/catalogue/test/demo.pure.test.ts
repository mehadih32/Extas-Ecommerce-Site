// S28 · PR 684 — when a category's demo products show.
import { describe, expect, it } from 'vitest';
import { demoShowsIn, realInBranch, type DemoRule } from '../src/demo-pick';

const cats = [
  { id: 'polo', parentId: null },
  { id: 'polo-pique', parentId: 'polo' },
  { id: 'shirt', parentId: null },
];
const rule: DemoRule = { on: true, off: [], auto: true, autoN: 3 };
const none = new Map<string, number>();

describe('demoShowsIn', () => {
  it('shows nothing while the master switch is off', () => {
    expect(demoShowsIn({ ...rule, on: false }, cats, none, 'polo')).toBe(false);
  });
  it('shows in a category with few real products, and nothing for no category or an unknown one', () => {
    expect(demoShowsIn(rule, cats, none, 'polo')).toBe(true);
    expect(demoShowsIn(rule, cats, none, null)).toBe(false);
    expect(demoShowsIn(rule, cats, none, 'ghost')).toBe(false);
  });
  it('a switch turned off hides its whole branch, not the sibling', () => {
    const r = { ...rule, off: ['polo'] };
    expect(demoShowsIn(r, cats, none, 'polo')).toBe(false);
    expect(demoShowsIn(r, cats, none, 'polo-pique')).toBe(false);
    expect(demoShowsIn(r, cats, none, 'shirt')).toBe(true);
  });
  it('hides by itself once the category and what is under it have enough real products', () => {
    const real = new Map([
      ['polo', 1],
      ['polo-pique', 2],
    ]);
    expect(realInBranch('polo', cats, real)).toBe(3);
    expect(demoShowsIn(rule, cats, real, 'polo')).toBe(false);
    expect(demoShowsIn(rule, cats, real, 'polo-pique')).toBe(true);
    expect(demoShowsIn({ ...rule, auto: false }, cats, real, 'polo')).toBe(true);
  });
});
