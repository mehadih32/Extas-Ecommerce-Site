import { describe, expect, it } from 'vitest';
import { ctrOf, fatigueOf, overlaps, planBudget, salesPerTk, verdictOf } from './overview-model';

const V = { scale: 4, keep: 2.5, fix: 1.5, shiftPct: 20 };

describe('PR 699 · overview figures', () => {
  it('sales per Tk 1 needs spend', () => {
    expect(salesPerTk(30000, 10000)).toBe(3);
    expect(salesPerTk(30000, 0)).toBeNull();
    expect(salesPerTk(30000, null)).toBeNull();
  });
  it('chips follow the owner numbers at the edges', () => {
    expect(verdictOf(4, V)).toBe('SCALE');
    expect(verdictOf(3.99, V)).toBe('KEEP');
    expect(verdictOf(2.5, V)).toBe('KEEP');
    expect(verdictOf(1.5, V)).toBe('FIX');
    expect(verdictOf(1.49, V)).toBe('STOP');
    expect(verdictOf(null, V)).toBe('NONE');
  });
  it('clicks per 100 shows', () => {
    expect(ctrOf(2, 100)).toBe(2);
    expect(ctrOf(1, 0)).toBeNull();
  });
  it('a tired ad: clicks per 100 shows fell by the set share against the week before', () => {
    const days = [
      ...[0, 1, 2].map((n) => ({ day: `2026-11-1${3 - n}`, impressions: 1000, clicks: 10 })),
      ...[7, 8, 9].map((n) => ({ day: `2026-11-0${13 - n > 9 ? 9 : 13 - n}`, impressions: 1000, clicks: 30 })),
    ];
    const f = fatigueOf(days, '2026-11-13', 30);
    expect(f.now).toBe(1);
    expect(f.dropPct).toBeGreaterThan(60);
    expect(f.tired).toBe(true);
    expect(fatigueOf([], '2026-11-13', 30)).toEqual({ now: null, before: null, dropPct: null, tired: false });
  });
  it('the plan moves a share from the weakest to the strongest, and only when it is clear', () => {
    const rows = planBudget(
      [
        { key: 'a', spendMinor: 10000, salesMinor: 50000 },
        { key: 'b', spendMinor: 20000, salesMinor: 10000 },
        { key: 'c', spendMinor: 0, salesMinor: 5000 },
      ],
      V,
    );
    expect(rows.find((r) => r.key === 'a')?.moveMinor).toBe(4000);
    expect(rows.find((r) => r.key === 'b')?.moveMinor).toBe(-4000);
    expect(rows.find((r) => r.key === 'c')?.moveMinor).toBe(0);
    const same = planBudget([{ key: 'a', spendMinor: 10000, salesMinor: 30000 }, { key: 'b', spendMinor: 10000, salesMinor: 30000 }], V);
    expect(same.every((r) => r.moveMinor === 0)).toBe(true);
    expect(planBudget([{ key: 'a', spendMinor: 100, salesMinor: 1 }], V)[0]?.moveMinor).toBe(0);
  });
  it('overlap: items that share a day, open ones run on', () => {
    const it = (id: string, starts: string, ends: string | null, open = false) => ({ id, title: id, starts, ends, open });
    expect(overlaps([it('a', '2026-11-01', '2026-11-05'), it('b', '2026-11-05', '2026-11-06'), it('c', '2026-11-07', '2026-11-08')]).map(([x, y]) => x.id + y.id)).toEqual(['ab']);
    expect(overlaps([it('a', '2026-11-01', null, true), it('b', '2027-01-01', null)]).length).toBe(1);
    expect(overlaps([it('a', '2026-11-01', null), it('b', '2026-11-02', null)]).length).toBe(0);
  });
});
