// S28 · PR 689 — the report library's rules without a database: the period bar, the change, the restock verdict.
import { describe, expect, it } from 'vitest';
import { scheduleDue, changePct, periodRange, restockVerdict } from '../src';

describe('report library rules (PR 689)', () => {
  it('periods are whole days with the span just before for compare', () => {
    expect(periodRange('today', '2026-11-13')).toEqual({ preset: 'today', from: '2026-11-13', to: '2026-11-13', prevFrom: '2026-11-12', prevTo: '2026-11-12' });
    expect(periodRange('last7', '2026-11-13')).toMatchObject({ from: '2026-11-07', to: '2026-11-13', prevFrom: '2026-10-31', prevTo: '2026-11-06' });
    expect(periodRange('last30', '2026-11-13')).toMatchObject({ from: '2026-10-15', to: '2026-11-13', prevFrom: '2026-09-15', prevTo: '2026-10-14' });
    expect(periodRange('month', '2026-11-13')).toMatchObject({ from: '2026-11-01', to: '2026-11-13', prevFrom: '2026-10-19', prevTo: '2026-10-31' });
  });
  it('last month is the whole month before, compared with the month before that span', () => {
    expect(periodRange('lastmonth', '2026-11-13')).toMatchObject({ from: '2026-10-01', to: '2026-10-31', prevFrom: '2026-09-01', prevTo: '2026-09-30' });
    expect(periodRange('lastmonth', '2026-01-05')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('the change is whole percent, and null with nothing before', () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(50, 100)).toBe(-50);
    expect(changePct(10, 0)).toBeNull();
    expect(changePct(Number.NaN, 5)).toBeNull();
  });
  it('restock when a size that sold is out or the stock is short; unsold when old, in stock and nothing sold', () => {
    const s = { restockCoverDays: 14, deadAfterDays: 60 };
    const base = { sold30: 10, sizesTotal: 3, sizesInStock: 3, stockDays: 40, ageDays: 20 };
    expect(restockVerdict(base, s)).toBe('ENOUGH');
    expect(restockVerdict({ ...base, stockDays: 14 }, s)).toBe('RESTOCK');
    expect(restockVerdict({ ...base, sizesInStock: 2 }, s)).toBe('RESTOCK');
    expect(restockVerdict({ ...base, sold30: 0, stockDays: null, ageDays: 59 }, s)).toBe('ENOUGH');
    expect(restockVerdict({ ...base, sold30: 0, stockDays: null, ageDays: 60 }, s)).toBe('UNSOLD');
    expect(restockVerdict({ ...base, sold30: 0, stockDays: null, ageDays: 90, sizesInStock: 0 }, s)).toBe('ENOUGH');
  });
  it('a weekly pack is due on Monday, a monthly pack on the 1st', () => {
    expect(scheduleDue('weekly', '2026-11-16')).toBe('W:2026-11-16');
    expect(scheduleDue('weekly', '2026-11-17')).toBeNull();
    expect(scheduleDue('monthly', '2026-12-01')).toBe('M:2026-12');
    expect(scheduleDue('monthly', '2026-12-02')).toBeNull();
  });
});
