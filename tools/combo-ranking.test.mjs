// PR 576 — the ranking's weights and knock-outs on made-up runs (no browser).
import { describe, expect, it } from 'vitest';
import { humanSeconds, rankTemplates, RANKING, scoreBag, scoreCategory, scoreProduct } from './combo-ranking.mjs';

const perfect = { set: 'pair', added: true, taps: 2, scrolls: 0, first: 1, earlyError: true, jsErrors: 0, overflow: false, cut: 0, wrapped: 0, small: 0, words: 30, desktopAdded: true };

describe('the product page score', () => {
  it('a perfect run is 100; each weight is the method`s', () => {
    expect(scoreProduct(perfect)).toMatchObject({ total: 100, knockedOut: false });
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    for (const w of Object.values(RANKING.weights)) expect(sum(w)).toBe(100);
  });
  it('an extra tap costs 5 and some time; a top + bottom set may take 3', () => {
    const r = scoreProduct({ ...perfect, taps: 3 });
    expect(r.parts.taps).toBe(15);
    expect(r.parts.time).toBeLessThan(10);
    expect(scoreProduct({ ...perfect, set: 'topBottom', taps: 3 }).parts.taps).toBe(20);
  });
  it('the size row under the fold, a toast instead of an inline error, cut text and too many words cost points', () => {
    const r = scoreProduct({ ...perfect, first: 0.5, earlyError: false, cut: 1, words: 80, small: 2 });
    expect(r.parts).toMatchObject({ first: 10, errors: 0, layout: 10, words: 2.5, targets: 6 });
  });
  it('a journey that never reaches the bag is knocked out', () => {
    expect(scoreProduct({ ...perfect, added: false })).toMatchObject({ knockedOut: true, parts: { taps: 0, time: 0 } });
  });
});

describe('the category page and bag scores', () => {
  it('the category page counts the card tap and the cards on the first two screens', () => {
    const c = scoreCategory({ set: 'pair', added: true, taps: 3, scrolls: 0, pages: 1, first: 1, cards: 6, jsErrors: 0, small: 0, words: 30 });
    expect(c.parts.taps).toBe(20);
    expect(c.parts.choice).toBe(10);
    expect(scoreCategory({ set: 'pair', added: true, taps: 3, cards: 3, first: 1 }).parts.choice).toBe(5);
  });
  it('the bag: a size changed in 2 taps in a compact row scores top; a wrong price knocks it out', () => {
    const b = { changed: true, taps: 2, scrolls: 0, pages: 0, moneyOk: true, first: 1, features: 1, small: 0, pxPerSet: 70 };
    expect(scoreBag(b)).toMatchObject({ total: 100, knockedOut: false });
    expect(scoreBag({ ...b, taps: 4, pages: 1, pxPerSet: 300 }).parts).toMatchObject({ taps: 10, compact: 0 });
    expect(scoreBag({ ...b, moneyOk: false }).knockedOut).toBe(true);
  });
  it('estimates a person`s time from taps, scrolls and pages', () => {
    expect(humanSeconds({ taps: 2, scrolls: 1, pages: 1 })).toBeCloseTo(4);
  });
});

describe('ranking the templates', () => {
  it('best mean first, a knocked-out template last whatever its mean', () => {
    const rows = rankTemplates([
      { template: 'P1', total: 90, knockedOut: false },
      { template: 'P1', total: 80, knockedOut: false },
      { template: 'P2', total: 99, knockedOut: true },
      { template: 'P3', total: 88, knockedOut: false },
    ]);
    expect(rows.map((r) => [r.template, r.mean, r.knockedOut])).toEqual([
      ['P3', 88, 0],
      ['P1', 85, 0],
      ['P2', 99, 1],
    ]);
  });
});
