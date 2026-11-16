// S29 · PR 751 — the parts of `geoByArea` that need no database: which days a compare mode means, and the difference of
// two periods. The figures themselves are tested on PostgreSQL in geo.db.test.ts.
import { describe, expect, it } from 'vitest';
import { compareDaysOf, dayCount, deltaOf } from './geo-pure';
import { GEO_COMPARES, GEO_LENSES, GEO_LEVELS, GEO_METRICS, GEO_PERIODS, type GeoAreaFigures } from './geo-types';

const fig = (o: Partial<GeoAreaFigures>): GeoAreaFigures => ({ orders: 0, delivered: 0, salesMinor: 0, pieces: 0, returned: 0, returnRate: null, ...o });

describe('compare days', () => {
  it('counts days with both ends included', () => {
    expect(dayCount({ from: '2026-10-01', to: '2026-10-01' })).toBe(1);
    expect(dayCount({ from: '2026-10-01', to: '2026-10-31' })).toBe(31);
    expect(dayCount({ from: '2026-02-01', to: '2026-03-01' })).toBe(29);
  });

  it('previous period = the same number of days straight before', () => {
    expect(compareDaysOf({ from: '2026-10-01', to: '2026-10-31' }, 'previous')).toEqual({ from: '2026-08-31', to: '2026-09-30' });
    expect(compareDaysOf({ from: '2026-11-15', to: '2026-11-15' }, 'previous')).toEqual({ from: '2026-11-14', to: '2026-11-14' });
    expect(compareDaysOf({ from: '2026-01-01', to: '2026-01-07' }, 'previous')).toEqual({ from: '2025-12-25', to: '2025-12-31' });
  });

  it('same period last year, 29 February becomes 28 February', () => {
    expect(compareDaysOf({ from: '2026-10-01', to: '2026-10-31' }, 'lastYear')).toEqual({ from: '2025-10-01', to: '2025-10-31' });
    expect(compareDaysOf({ from: '2028-02-29', to: '2028-03-02' }, 'lastYear')).toEqual({ from: '2027-02-28', to: '2027-03-02' });
  });

  it('custom takes the caller\'s own days and refuses missing or backwards ones', () => {
    const own = { from: '2026-05-01', to: '2026-05-10' };
    expect(compareDaysOf({ from: '2026-10-01', to: '2026-10-31' }, 'custom', own)).toEqual(own);
    expect(() => compareDaysOf({ from: '2026-10-01', to: '2026-10-31' }, 'custom')).toThrow(/own days/);
    expect(() => compareDaysOf({ from: '2026-10-01', to: '2026-10-31' }, 'custom', { from: '2026-05-10', to: '2026-05-01' })).toThrow(/end before/);
  });

  it('is null when compare is off or not given, and refuses a bad day', () => {
    expect(compareDaysOf({ from: '2026-10-01', to: '2026-10-31' }, 'off')).toBeNull();
    expect(compareDaysOf({ from: '2026-10-01', to: '2026-10-31' }, undefined)).toBeNull();
    expect(() => compareDaysOf({ from: '10/01/2026', to: '2026-10-31' }, 'previous')).toThrow(/not a day/);
  });
});

describe('the difference of two periods', () => {
  it('subtracts every figure, an area with nothing before is zero before', () => {
    const d = deltaOf(fig({ orders: 12, delivered: 9, salesMinor: 500_000, returned: 2, returnRate: 2 / 11 }), fig({ orders: 0, delivered: 0, salesMinor: 0, returned: 0, returnRate: null }));
    expect(d).toEqual({ orders: 12, delivered: 9, salesMinor: 500_000, returned: 2, returnRate: null });
  });

  it('a falling figure is negative; the rate difference needs both rates', () => {
    const d = deltaOf(fig({ orders: 5, delivered: 4, salesMinor: 100, returned: 1, returnRate: 0.2 }), fig({ orders: 9, delivered: 8, salesMinor: 300, returned: 1, returnRate: 1 / 9 }));
    expect(d.orders).toBe(-4);
    expect(d.salesMinor).toBe(-200);
    expect(d.returnRate).toBeCloseTo(0.2 - 1 / 9);
  });

  it('never makes up a money difference when the viewer may not see money', () => {
    expect(deltaOf(fig({ salesMinor: null }), fig({ salesMinor: 100 })).salesMinor).toBeNull();
    expect(deltaOf(fig({ salesMinor: 100 }), fig({ salesMinor: null })).salesMinor).toBeNull();
  });
});

describe('the shared words of the map', () => {
  it('lists the levels, figures, compares, periods and lenses the screen and the API share', () => {
    expect(GEO_LEVELS).toEqual(['division', 'district', 'upazila', 'area']);
    expect(GEO_METRICS).toContain('returnRate');
    expect(GEO_COMPARES).toEqual(['off', 'previous', 'lastYear', 'custom']);
    expect(GEO_PERIODS).toContain('sixMonths');
    expect(GEO_LENSES[0]).toBe('overview');
  });
});
