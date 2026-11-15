// PR 828 (prototype v5): the Returns chip tabs, reminder strip and date range.
import { describe, expect, it } from 'vitest';
import { countByTab, inRange, isTab, LISTED_TABS, remindersOf, tabOf } from './lens';

const c = (status: string, kind = 'EXCHANGE', createdAt = '2026-11-10T08:00:00.000Z', oldPieceDueAt: string | null = null) => ({ status, kind, createdAt, oldPieceDueAt });

describe('returns lens', () => {
  it('puts every status in one tab, a replacement on its way back in Replacements', () => {
    expect(tabOf(c('REQUESTED'))).toBe('requests');
    expect(tabOf(c('APPROVED'))).toBe('coming');
    expect(tabOf(c('PICKUP_BOOKED', 'REPLACEMENT'))).toBe('replace');
    expect(tabOf(c('RECEIVED'))).toBe('waiting');
    expect(tabOf(c('QC_PASSED'))).toBe('approved');
    expect(tabOf(c('COMPLETED'))).toBe('approved');
    expect(tabOf(c('QC_FAILED'))).toBe('declined');
    expect(tabOf(c('REJECTED'))).toBe('declined');
    expect(tabOf(c('CANCELLED'))).toBe('cancelled');
  });
  it('the tab counts add up to the cases', () => {
    const rows = [c('REQUESTED'), c('APPROVED'), c('RECEIVED'), c('COMPLETED'), c('CANCELLED'), c('PICKUP_BOOKED', 'REPLACEMENT')];
    const n = countByTab(rows);
    expect(Object.values(n).reduce((a, b) => a + b, 0)).toBe(rows.length);
    expect(n.replace).toBe(1);
  });
  it('knows its listed tabs', () => {
    expect(LISTED_TABS).not.toContain('handed');
    expect(isTab('declined')).toBe(true);
    expect(isTab('handed')).toBe(false);
    expect(isTab(undefined)).toBe(false);
  });
  it('the reminder strip counts requests, old pieces due within a day or late, and cases waiting for the check', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const r = remindersOf(
      [c('REQUESTED'), c('REQUESTED'), c('APPROVED', 'EXCHANGE', undefined, '2026-11-15T20:00:00Z'), c('APPROVED', 'EXCHANGE', undefined, '2026-11-14T20:00:00Z'), c('APPROVED', 'EXCHANGE', undefined, '2026-11-20T20:00:00Z'), c('RECEIVED')],
      now,
    );
    expect(r).toEqual({ requests: 2, comingSoon: 2, waiting: 1 });
  });
  it('the date range keeps the cases opened on its days, both ends included, and no range keeps all', () => {
    const rows = [c('REQUESTED', 'EXCHANGE', '2026-11-09T20:00:00Z'), c('REQUESTED', 'EXCHANGE', '2026-11-10T08:00:00Z'), c('REQUESTED', 'EXCHANGE', '2026-11-12T08:00:00Z')];
    expect(inRange(rows, undefined, undefined, 'UTC')).toHaveLength(3);
    expect(inRange(rows, '2026-11-10', '2026-11-10', 'UTC')).toHaveLength(1);
    expect(inRange(rows, '2026-11-10', '2026-11-12', 'UTC')).toHaveLength(2);
    // Dhaka is six hours ahead: 20:00Z on the 9th is the 10th there
    expect(inRange(rows, '2026-11-10', '2026-11-10', 'Asia/Dhaka')).toHaveLength(2);
    expect(inRange(rows, 'not-a-day', undefined, 'UTC')).toHaveLength(3);
  });
});
