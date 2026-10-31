// S21 · PR 417 — the Speed page's month arithmetic, its cells against the targets, and when "Measure now" still waits.
import { describe, expect, it } from 'vitest';
import { bucketOf, p75 } from '../seo/vitals';
import { addMonths, cellFrom, monthOf, speedAsked } from './speed';

const counts = (metric: 'LCP' | 'CLS', ...values: number[]) => {
  const out: number[] = [];
  for (const v of values) {
    const i = bucketOf(metric, v);
    out[i] = (out[i] ?? 0) + 1;
  }
  return Array.from(out, (x) => x ?? 0);
};

describe('Speed page helpers (PR 417)', () => {
  it('moves months across years both ways', () => {
    expect(addMonths('2026-10', 0)).toBe('2026-10');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', -23)).toBe('2024-11');
    expect(addMonths('2026-10', -36)).toBe('2023-10');
  });

  it('reads the month in the shop time zone', () => {
    const at = new Date('2026-10-31T20:00:00Z');
    expect(monthOf(at, 'UTC')).toBe('2026-10');
    expect(monthOf(at, 'Asia/Dhaka')).toBe('2026-11');
  });

  it('judges a cell against its target; no reading and no target judge nothing', () => {
    expect(cellFrom('LCP', [], 2500)).toEqual({ p75: null, over: false, count: 0, ok: null });
    const fast = counts('LCP', 900, 1100, 1300, 1400);
    expect(cellFrom('LCP', fast, 2500)).toEqual({ p75: p75('LCP', fast)!.value, over: false, count: 4, ok: true });
    const slow = counts('LCP', 3200, 3300, 3400, 3600);
    expect(cellFrom('LCP', slow, 2500).ok).toBe(false);
    expect(cellFrom('LCP', slow, null).ok).toBeNull();
    const off = counts('LCP', 59_000, 59_000);
    expect(cellFrom('LCP', off, 2500)).toMatchObject({ over: true, ok: false });
    expect(cellFrom('CLS', counts('CLS', 20, 30, 40), 100).ok).toBe(true);
  });

  it('waits only while the press is newer than the newest lab run', () => {
    const lab = { at: '2026-10-02T03:00:00.000Z' };
    expect(speedAsked({ months: 12, runRequestedAt: null }, lab)).toBe(false);
    expect(speedAsked({ months: 12, runRequestedAt: '2026-10-31T10:00:00.000Z' }, null)).toBe(true);
    expect(speedAsked({ months: 12, runRequestedAt: '2026-10-31T10:00:00.000Z' }, lab)).toBe(true);
    expect(speedAsked({ months: 12, runRequestedAt: '2026-10-01T10:00:00.000Z' }, lab)).toBe(false);
  });
});
