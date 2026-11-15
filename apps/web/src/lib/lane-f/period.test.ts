import { describe, expect, it } from 'vitest';
import { periodKey, previousPeriod, resolvePeriod } from './period';

describe('lane F periods', () => {
  it('opens on 30 days and ignores unknown keys', () => {
    expect(periodKey(undefined)).toBe('30d');
    expect(periodKey('x')).toBe('30d');
    expect(periodKey('month')).toBe('month');
    expect(periodKey(['7d', 'today'])).toBe('7d');
  });
  it('works out each period from the store date', () => {
    expect(resolvePeriod('today', '2026-11-12')).toEqual({ from: '2026-11-12', to: '2026-11-12' });
    expect(resolvePeriod('7d', '2026-11-12')).toEqual({ from: '2026-11-06', to: '2026-11-12' });
    expect(resolvePeriod('30d', '2026-11-12')).toEqual({ from: '2026-10-14', to: '2026-11-12' });
    expect(resolvePeriod('month', '2026-11-12')).toEqual({ from: '2026-11-01', to: '2026-11-12' });
    expect(resolvePeriod('lastmonth', '2026-11-12')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolvePeriod('lastmonth', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('the period before has the same length', () => {
    expect(previousPeriod('2026-11-01', '2026-11-12')).toEqual({ from: '2026-10-20', to: '2026-10-31' });
    expect(previousPeriod('2026-11-12', '2026-11-12')).toEqual({ from: '2026-11-11', to: '2026-11-11' });
  });
});
