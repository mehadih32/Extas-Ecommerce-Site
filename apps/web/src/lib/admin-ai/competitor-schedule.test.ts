// S15 · PR 337 — the saved competitor's schedule preview: pure, no DB.
import { describe, expect, it } from 'vitest';
import { isDue, nextDueAt } from './competitor-schedule';

const NOW = new Date('2026-11-12T10:00:00Z');

describe('competitor schedule preview (PR 337)', () => {
  it('is null with no schedule at all, whatever lastRunAt says', () => {
    expect(nextDueAt(null, null, NOW)).toBeNull();
    expect(nextDueAt(null, new Date('2020-01-01'), NOW)).toBeNull();
  });

  it('a never-run competitor with a schedule is due right now', () => {
    expect(nextDueAt('weekly', null, NOW)).toEqual(NOW);
    expect(isDue('weekly', null, NOW)).toBe(true);
  });

  it('weekly adds 7 days, monthly adds 30, to the last real run', () => {
    const last = new Date('2026-11-05T10:00:00Z');
    expect(nextDueAt('weekly', last, NOW)?.toISOString()).toBe('2026-11-12T10:00:00.000Z');
    expect(nextDueAt('monthly', last, NOW)?.toISOString()).toBe('2026-12-05T10:00:00.000Z');
  });

  it('is due only once the next run time has actually arrived', () => {
    const last = new Date('2026-11-10T10:00:00Z'); // weekly: due 2026-11-17
    expect(isDue('weekly', last, NOW)).toBe(false);
    expect(isDue('weekly', last, new Date('2026-11-17T10:00:01Z'))).toBe(true);
  });
});
