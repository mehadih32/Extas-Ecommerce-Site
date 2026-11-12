// S23 · PR 442 — the auto-schedule rule's pure "next active day" preview (no database, no I/O; see schedule.ts's
// own header for why it previews only and does not yet dispatch anything).
import { describe, expect, it } from 'vitest';
import { nextActiveDayOf } from './schedule';

describe('PR 442 · nextActiveDayOf (pure)', () => {
  it('is null when no weekday is active', () => {
    expect(nextActiveDayOf([], '2026-11-11')).toBeNull();
  });

  it('is today when today\'s own weekday is active', () => {
    // 2026-11-11 is a Wednesday (3).
    expect(nextActiveDayOf([3], '2026-11-11')).toBe('2026-11-11');
  });

  it('steps forward to the next active weekday within the week', () => {
    // Friday (5), from a Wednesday (3).
    expect(nextActiveDayOf([5], '2026-11-11')).toBe('2026-11-13');
  });

  it('wraps to the next week when the only active weekday already passed this week', () => {
    // Monday (1), from a Wednesday (3) — the next Monday is 6 days later.
    expect(nextActiveDayOf([1], '2026-11-11')).toBe('2026-11-16');
  });

  it('picks the earliest of several active weekdays', () => {
    expect(nextActiveDayOf([0, 3, 5], '2026-11-11')).toBe('2026-11-11');
    expect(nextActiveDayOf([0, 5], '2026-11-11')).toBe('2026-11-13');
  });
});
