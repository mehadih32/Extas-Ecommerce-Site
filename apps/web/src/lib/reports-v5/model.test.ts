// S28 · PR 714-717 — the pure part of the v5 report pages: spans, changes, the hero series, the Monthly review's rules, the CSV.
import { describe, expect, it } from 'vitest';
import { addDays, change, changePerDay, daysBetween, heroRange, leaves, pct, previousSpan, reviewLines, seriesOf, spanDays, toCsv, type ReviewFacts } from './model';

describe('spans', () => {
  it('moves a day and counts a span with both ends', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(spanDays('2026-11-01', '2026-11-30')).toBe(30);
    expect(spanDays('2026-11-05', '2026-11-05')).toBe(1);
  });
  it('the span before has the same length and ends the day before', () => {
    expect(previousSpan('2026-11-01', '2026-11-14')).toEqual({ from: '2026-10-18', to: '2026-10-31' });
    expect(previousSpan('2026-11-10', '2026-11-10')).toEqual({ from: '2026-11-09', to: '2026-11-09' });
  });
  it('lists the days oldest first and keeps the newest when it is capped', () => {
    expect(daysBetween('2026-11-01', '2026-11-03', 10)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(daysBetween('2026-11-01', '2026-11-05', 2)).toEqual(['2026-11-04', '2026-11-05']);
    expect(daysBetween('2026-11-05', '2026-11-01', 10)).toEqual([]);
    expect(daysBetween('nope', '2026-11-01', 10)).toEqual([]);
  });
});

describe('changes', () => {
  it('is a fraction, and null when there is nothing to compare', () => {
    expect(change(110, 100)).toBeCloseTo(0.1);
    expect(change(50, 100)).toBeCloseTo(-0.5);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 100)).toBeNull();
    expect(change(100, null)).toBeNull();
    expect(change(-50, -100)).toBeCloseTo(0.5);
  });
  it('compares per day when the spans differ in length', () => {
    expect(changePerDay(300, 10, 400, 20)).toBeCloseTo(0.5);
    expect(changePerDay(null, 10, 400, 20)).toBeNull();
  });
  it('a share with one decimal, null with no base', () => {
    expect(pct(25, 200)).toBe(12.5);
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(null, 100)).toBeNull();
    expect(pct(5, 0)).toBeNull();
  });
});

describe('the hero series', () => {
  it('fills days with no row with 0', () => {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03'];
    expect(seriesOf(days, [{ day: '2026-11-02', v: 7 }], (r) => r.v)).toEqual([0, 7, 0]);
  });
  it('draws the span before only when it has the same number of points', () => {
    const base = { key: 'p', label: 'L', days: ['a', 'b'], values: [1, 2], amount: (m: number) => `T${m}`, dayLabel: (d: string) => d.toUpperCase() };
    const withPrev = heroRange({ ...base, before: [3, 4], delta: 0.5 });
    expect(withPrev.prev).toEqual([3, 4]);
    expect(withPrev.points[1]).toEqual({ label: 'B', value: 2, shown: 'T2', prevShown: 'T4' });
    expect(withPrev.total).toBe(3);
    expect(withPrev.shown).toBe('T3');
    expect(withPrev.delta).toBe(0.5);
    const noPrev = heroRange({ ...base, before: [3] });
    expect(noPrev.prev).toBeUndefined();
    expect(noPrev.points[0]).not.toHaveProperty('prevShown');
    expect(heroRange({ ...base, total: 99 }).shown).toBe('T99');
  });
});

describe('leaves', () => {
  it('keeps only the rows with nothing under them', () => {
    const rows = [{ depth: 0, n: 'a' }, { depth: 1, n: 'a1' }, { depth: 1, n: 'a2' }, { depth: 0, n: 'b' }];
    expect(leaves(rows).map((r) => r.n)).toEqual(['a1', 'a2', 'b']);
  });
});

const facts = (o: Partial<ReviewFacts> = {}): ReviewFacts => ({
  salesChange: 0.2,
  profitChange: 0.1,
  netProfitMinor: 500_00,
  adsUnknown: false,
  uncostedOrders: 0,
  returnRate: 8,
  returnRateBefore: 10,
  groups: [
    { name: 'Polo', salesMinor: 1000_00, costedSalesMinor: 1000_00, profitMinor: 400_00 },
    { name: 'Denim', salesMinor: 800_00, costedSalesMinor: 800_00, profitMinor: 80_00 },
  ],
  restockStyles: 3,
  unsoldStyles: 2,
  ...o,
});
const fmt = { money: (m: number) => `T${m}`, pct: (f: number) => `${Math.round(f * 100)}%` };
const keys = (xs: { key: string }[]) => xs.map((x) => x.key);

describe('the Monthly review rules', () => {
  it('a good month: sales and profit up, best category, returns down; the bad side holds only real problems', () => {
    const r = reviewLines(facts(), fmt);
    expect(keys(r.good)).toEqual(['salesUp', 'profitUp', 'bestGroup', 'returnsDown']);
    expect(r.good.find((x) => x.key === 'bestGroup')!.vars).toEqual({ name: 'Polo', amount: 'T40000' });
    expect(keys(r.bad)).toEqual(['lowGroup', 'unsold']);
    expect(r.bad.find((x) => x.key === 'lowGroup')!.vars.name).toBe('Denim');
  });
  it('a bad month: sales and profit down, a loss, returns up, a category at a loss', () => {
    const r = reviewLines(facts({ salesChange: -0.3, profitChange: -0.4, netProfitMinor: -100_00, returnRate: 12, returnRateBefore: 9, groups: [{ name: 'Polo', salesMinor: 10, costedSalesMinor: 10, profitMinor: 5 }, { name: 'Cap', salesMinor: 10, costedSalesMinor: 10, profitMinor: -2 }] }), fmt);
    expect(keys(r.bad)).toEqual(['salesDown', 'loss', 'returnsUp', 'thinGroup']);
    expect(r.good.map((x) => x.key)).toContain('bestGroup');
  });
  it('a month that made money but less than before says so', () => {
    expect(keys(reviewLines(facts({ profitChange: -0.2 }), fmt).bad)).toContain('profitDown');
  });
  it('says nothing it cannot know: no change to compare means no sales or profit line', () => {
    const r = reviewLines(facts({ salesChange: null, profitChange: null, returnRate: null, returnRateBefore: null, groups: [], restockStyles: null, unsoldStyles: null }), fmt);
    expect(r.good).toEqual([]);
    expect(r.bad).toEqual([]);
    expect(r.next).toEqual([]);
  });
  it('missing ad spend and costs are problems with a way to fix them', () => {
    const r = reviewLines(facts({ adsUnknown: true, uncostedOrders: 4 }), fmt);
    expect(keys(r.bad)).toEqual(expect.arrayContaining(['adsUnknown', 'uncosted']));
    expect(keys(r.next)).toEqual(['adsNext', 'costsNext', 'restock']);
  });
  it('at most three next steps, each with its page', () => {
    const r = reviewLines(facts({ adsUnknown: true, uncostedOrders: 4 }), fmt);
    expect(r.next.length).toBeLessThanOrEqual(3);
    expect(r.next.every((x) => x.href?.startsWith('/admin/'))).toBe(true);
    expect(keys(reviewLines(facts(), fmt).next)).toEqual(['restock', 'unsoldNext', 'checkPrices']);
  });
  it('a single category is neither best-and-lowest nor "low"', () => {
    const r = reviewLines(facts({ groups: [{ name: 'Polo', salesMinor: 10, costedSalesMinor: 10, profitMinor: 5 }] }), fmt);
    expect(keys(r.bad)).not.toContain('lowGroup');
    expect(keys(r.next)).not.toContain('checkPrices');
  });
});

describe('CSV', () => {
  it('quotes, guards a formula and leaves unknown empty', () => {
    expect(toCsv([['a', 'b,c', '=x', null, 5], []])).toBe('a,"b,c",\'=x,,5\r\n\r\n');
  });
});
