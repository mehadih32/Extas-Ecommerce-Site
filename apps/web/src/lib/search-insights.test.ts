// PR 72 follow-up 100 — the words a search is counted under, and the report's periods.
import { describe, expect, it } from 'vitest';
import { fromDay, periodsOf, termOf } from './search-insights';

describe('search words (follow-up 100)', () => {
  it('folds case and spaces, and cuts at 40 characters', () => {
    expect(termOf('  Linen   PANJABI ')).toBe('linen panjabi');
    expect(termOf('শার্ট')).toBe('শার্ট');
    expect([...termOf('x'.repeat(60))!].length).toBe(40);
  });
  it('never keeps a phone or order number, an e-mail, or a single letter', () => {
    expect(termOf('01712345678')).toBeNull();
    expect(termOf('order EX-100234')).toBeNull();
    expect(termOf('০১৭১২৩৪৫৬৭৮')).toBeNull();
    expect(termOf('rafi@example.com')).toBeNull();
    expect(termOf('a')).toBeNull();
    expect(termOf('polo 2024')).toBe('polo 2024');
  });
  it('periods: 7, 30 and 90 days, never past the longest, which is offered too', () => {
    expect(periodsOf(90)).toEqual([7, 30, 90]);
    expect(periodsOf(14)).toEqual([7, 14]);
    expect(periodsOf(365)).toEqual([7, 30, 90, 365]);
    expect(fromDay('2026-11-07', 7)).toBe('2026-11-01');
    expect(fromDay('2026-03-01', 1)).toBe('2026-03-01');
  });
});
