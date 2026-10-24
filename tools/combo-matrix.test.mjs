// PR 576 — the matrix runner's pure parts on made-up runs (no browser): links, prices read off the page, the money
// check against the current look, the ranking and the report.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moneyOf, report, scoreRuns, withParam } from './combo-matrix.mjs';

const look = { overflow: false, words: 30, cut: 0, wrapped: 0, small: 0, first: [true, true, true, true], fullCards: 2, cardsTwoScreens: 6 };
const product = (template, over = {}) => ({ page: 'product', template, set: 'pair', setLabel: 'polo pair', screen: 'phone-393', phone: true, taps: 2, scrolls: 0, pages: 0, added: true, early: true, look, errors: [], ...over });
const bag = (template, over = {}) => ({
  page: 'bag',
  template,
  fill: '3 combos',
  sets: 3,
  screen: 'phone-393',
  phone: true,
  taps: 2,
  scrolls: 0,
  pages: 0,
  changed: true,
  inBag: true,
  look,
  facts: { sets: 3, full: 3, totalSeen: true, total: '৳ 9,240', prices: ['৳ 1,530', '৳ 1,530', '৳ 1,530'], features: [1, 1, 1], px: 70 },
  errors: [],
  ...over,
});

describe('the matrix runner', () => {
  it('adds a preview to any link and reads prices in either digits', () => {
    expect(withParam('/combo/x', 'tpl', 'P1')).toBe('/combo/x?tpl=P1');
    expect(withParam('/bag?gate=1', 'btpl', 'B5')).toBe('/bag?gate=1&btpl=B5');
    expect(moneyOf('৳ ৯,২৪০')).toBe(9240);
    expect(moneyOf('৳ 1,530')).toBe(1530);
    expect(moneyOf('')).toBeNull();
  });

  it('scores the runs, desktop points from the desktop run, the money against the current look', () => {
    const runs = {
      product: [product('P1'), product('P1', { screen: 'desktop-1280', phone: false }), product('P2', { taps: 4 })],
      category: [],
      bag: [bag('current'), bag('B5'), bag('B4', { facts: { ...bag('B4').facts, total: '৳ 9,999' } })],
    };
    const r = scoreRuns(runs);
    expect(r.product.find((x) => x.template === 'P1').parts.desktop).toBe(5);
    expect(r.product.find((x) => x.template === 'P2').parts.desktop).toBe(0);
    expect(r.ranking.product[0].template).toBe('P1');
    expect(r.bag.find((x) => x.template === 'B5').moneyOk).toBe(true);
    // a template that shows another total is knocked out
    expect(r.bag.find((x) => x.template === 'B4')).toMatchObject({ moneyOk: false, knockedOut: true });
    expect(r.ranking.bag.at(-1).template).toBe('B4');
  });

  it('writes the report with the Bengali summary first and every page`s table', () => {
    const r = scoreRuns({ product: [product('P1')], category: [], bag: [bag('current'), bag('B5')] });
    const md = report(r, { date: '2026-10-24', base: 'http://h', commit: 'abc', screens: '393×852' });
    expect(md.indexOf('মালিকের জন্য সংক্ষেপে')).toBeLessThan(md.indexOf('## Ranking'));
    expect(md).toContain('combos.template.bag');
    expect(md).toContain('### Bag');
  });

  it('the matrix lists every template of the three pages and the four screens of the method', () => {
    const cfg = JSON.parse(readFileSync(new URL('../docs/qa/combo-matrix.json', import.meta.url), 'utf8'));
    expect(cfg.product.templates).toEqual(['current', 'P1', 'P2', 'P3', 'P4', 'P5']);
    expect(cfg.category.templates).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    expect(cfg.bag.templates).toEqual(['current', 'B1', 'B2', 'B3', 'B4', 'B5']);
    expect(cfg.screens.map((s) => s.width)).toEqual([360, 393, 430, 1280]);
  });
});
