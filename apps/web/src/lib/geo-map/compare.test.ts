// S29 · PR 754 — the period compare of the Geography map, without a database.
import { describe, expect, it } from 'vitest';
import type { GeoAreaFigures } from '@extas/metrics';
import { ZERO_FIGURES, changeClass, changeOf, changeStep, compareFromSearch, compareParams, compareRange, dayCount, diffOf, earlier, maxChange, percentChange } from './compare';

const figs = (o: Partial<GeoAreaFigures> = {}): GeoAreaFigures => ({ orders: 10, delivered: 8, salesMinor: 80000, pieces: 12, returned: 2, returnRate: 0.2, ...o });

describe('compareRange: which days the earlier column covers', () => {
  it('previous = the same number of days straight before', () => {
    expect(compareRange({ from: '2026-11-01', to: '2026-11-15' }, 'previous')).toEqual({ from: '2026-10-17', to: '2026-10-31' });
    expect(compareRange({ from: '2026-11-15', to: '2026-11-15' }, 'previous')).toEqual({ from: '2026-11-14', to: '2026-11-14' });
  });
  it('previous crosses a year and a leap day correctly', () => {
    expect(compareRange({ from: '2026-01-01', to: '2026-01-31' }, 'previous')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(compareRange({ from: '2024-03-01', to: '2024-03-31' }, 'previous')).toEqual({ from: '2024-01-30', to: '2024-02-29' });
  });
  it('lastYear = the same dates a year earlier (29 Feb becomes 28 Feb)', () => {
    expect(compareRange({ from: '2026-11-01', to: '2026-11-15' }, 'lastYear')).toEqual({ from: '2025-11-01', to: '2025-11-15' });
    expect(compareRange({ from: '2024-02-29', to: '2024-02-29' }, 'lastYear')).toEqual({ from: '2023-02-28', to: '2023-02-28' });
  });
  it('custom = the typed days, only when they are real days in order; off = none', () => {
    const days = { from: '2026-11-01', to: '2026-11-15' };
    expect(compareRange(days, 'custom', { from: '2026-09-01', to: '2026-09-30' })).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(compareRange(days, 'custom', { from: '2026-09-30', to: '2026-09-01' })).toBeNull();
    expect(compareRange(days, 'custom', { from: '2026-02-30', to: '2026-03-01' })).toBeNull();
    expect(compareRange(days, 'custom', null)).toBeNull();
    expect(compareRange(days, 'off')).toBeNull();
  });
  it('a period that is not two real days in order has no earlier column', () => {
    expect(compareRange({ from: '2026-11-15', to: '2026-11-01' }, 'previous')).toBeNull();
    expect(compareRange({ from: 'x', to: 'y' }, 'lastYear')).toBeNull();
    expect(dayCount({ from: '2026-11-01', to: '2026-11-15' })).toBe(15);
  });
});

describe('differences', () => {
  it('diff and per cent change never divide by nothing', () => {
    expect(diffOf(12, 10)).toBe(2);
    expect(diffOf(null, 10)).toBeNull();
    expect(percentChange(12, 10)).toBeCloseTo(20);
    expect(percentChange(5, 10)).toBeCloseTo(-50);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(null, 4)).toBeNull();
  });
  it('an area with nothing in the earlier period counts as zero there, never as missing', () => {
    expect(earlier(null, true, false)).toEqual({ ...ZERO_FIGURES, salesMinor: 0 });
    expect(earlier(null, true, true)?.salesMinor).toBeNull();
    expect(earlier(null, false, false)).toBeNull();
    expect(earlier(figs(), true, false)).toEqual(figs());
  });
});

describe('the Change colour is two-sided and never rounds a real change to flat', () => {
  const row = (salesMinor: number | null, orders: number) => ({ delta: { orders, delivered: 0, salesMinor, returned: 0, returnRate: null } });
  it('follows sales, or orders when money is hidden', () => {
    expect(changeOf(row(5000, 2), false)).toBe(5000);
    expect(changeOf(row(5000, 2), true)).toBe(2);
    expect(changeOf(row(null, 2), false)).toBe(2);
    expect(changeOf({ delta: null }, false)).toBeNull();
  });
  it('steps run −n…+n, 0 only for no change', () => {
    expect(changeStep(100, 100, 5)).toBe(5);
    expect(changeStep(-100, 100, 5)).toBe(-5);
    expect(changeStep(1, 100, 5)).toBe(1);
    expect(changeStep(-1, 100, 5)).toBe(-1);
    expect(changeStep(0, 100, 5)).toBe(0);
    expect(changeStep(null, 100, 5)).toBe(0);
    expect(changeStep(50, 0, 5)).toBe(0);
    expect(changeStep(60, 100, 5)).toBe(3);
  });
  it('the biggest change of the map and the classes the CSS colours', () => {
    expect(maxChange([row(300, 1), row(-900, 2), { delta: null }], false)).toBe(900);
    expect(maxChange([], false)).toBe(0);
    expect(changeClass(0)).toBe('geo-flat');
    expect(changeClass(3)).toBe('geo-up-3');
    expect(changeClass(-2)).toBe('geo-down-2');
  });
});

describe('the compare choice in the address', () => {
  it('reads each mode, and the setting default when the address says nothing', () => {
    expect(compareFromSearch({}, false)).toEqual({ mode: 'off', custom: null });
    expect(compareFromSearch({}, true)).toEqual({ mode: 'previous', custom: null });
    expect(compareFromSearch({ compare: 'off' }, true)).toEqual({ mode: 'off', custom: null });
    expect(compareFromSearch({ compare: 'lastYear' }, false)).toEqual({ mode: 'lastYear', custom: null });
    expect(compareFromSearch({ compare: 'bogus' }, false).mode).toBe('off');
  });
  it('a custom choice needs two real days in order, else it is off', () => {
    expect(compareFromSearch({ compare: 'custom', cfrom: '2026-09-01', cto: '2026-09-30' }, false)).toEqual({ mode: 'custom', custom: { from: '2026-09-01', to: '2026-09-30' } });
    expect(compareFromSearch({ compare: 'custom', cfrom: '2026-09-30', cto: '2026-09-01' }, true)).toEqual({ mode: 'off', custom: null });
    expect(compareFromSearch({ compare: 'custom' }, false)).toEqual({ mode: 'off', custom: null });
  });
  it('writes a choice back, with off written out', () => {
    expect(compareParams('previous')).toEqual({ compare: 'previous' });
    expect(compareParams('off')).toEqual({ compare: 'off' });
    expect(compareParams('custom', { from: '2026-09-01', to: '2026-09-30' })).toEqual({ compare: 'custom', cfrom: '2026-09-01', cto: '2026-09-30' });
    expect(compareParams('custom', null)).toEqual({ compare: 'off' });
  });
});
