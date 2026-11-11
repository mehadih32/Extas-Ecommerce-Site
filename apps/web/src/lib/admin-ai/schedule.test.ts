// S15 · PR 308 — the pure parts of a per-agent schedule: validating an owner-submitted shape, reading a stored one
// back defensively, and computing the next time-based run (no Postgres needed, unlike control-room.db.test.ts's
// end-to-end coverage, which also checks `setAgentSchedule`'s own transaction and audit row).
import { describe, expect, it } from 'vitest';
import { isAiError } from './errors';
import { ALWAYS_SCHEDULE, isValidTime, nextRunAt, normalizeStoredSchedule, parseScheduleInput } from './schedule';

describe('isValidTime', () => {
  it('accepts a 24-hour HH:MM and rejects anything else', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('09:60')).toBe(false);
    expect(isValidTime('')).toBe(false);
    expect(isValidTime(undefined)).toBe(false);
  });
});

describe('parseScheduleInput', () => {
  it('reads null, undefined or {mode: "always"} all as the one "always" schedule', () => {
    expect(parseScheduleInput(null)).toEqual(ALWAYS_SCHEDULE);
    expect(parseScheduleInput(undefined)).toEqual(ALWAYS_SCHEDULE);
    expect(parseScheduleInput({ mode: 'always' })).toEqual(ALWAYS_SCHEDULE);
  });

  it('accepts a valid daily schedule', () => {
    expect(parseScheduleInput({ mode: 'daily', time: '02:00' })).toEqual({ mode: 'daily', time: '02:00' });
  });

  it('accepts a valid weekly schedule and sorts its days', () => {
    expect(parseScheduleInput({ mode: 'weekly', time: '09:00', days: [4, 1] })).toEqual({ mode: 'weekly', time: '09:00', days: [1, 4] });
  });

  it('refuses a daily schedule with no time, or a bad one', () => {
    expect(() => parseScheduleInput({ mode: 'daily' })).toThrow();
    expect(() => parseScheduleInput({ mode: 'daily', time: '9am' })).toThrow();
  });

  it('refuses a weekly schedule with no days, duplicate days, or an out-of-range day', () => {
    expect(() => parseScheduleInput({ mode: 'weekly', time: '09:00', days: [] })).toThrow();
    expect(() => parseScheduleInput({ mode: 'weekly', time: '09:00', days: [1, 1] })).toThrow();
    expect(() => parseScheduleInput({ mode: 'weekly', time: '09:00', days: [7] })).toThrow();
  });

  it('refuses an unknown mode or a non-object input, as an AiError', () => {
    try {
      parseScheduleInput({ mode: 'hourly' });
      throw new Error('expected a throw');
    } catch (e) {
      expect(isAiError(e)).toBe(true);
    }
    expect(() => parseScheduleInput('always')).toThrow();
    expect(() => parseScheduleInput(42)).toThrow();
  });
});

describe('normalizeStoredSchedule', () => {
  it('reads a valid stored shape back exactly', () => {
    expect(normalizeStoredSchedule({ mode: 'daily', time: '02:00' })).toEqual({ mode: 'daily', time: '02:00' });
  });

  it('reads null, corrupt or legacy data as "always" rather than throwing — a stored row never breaks the page', () => {
    expect(normalizeStoredSchedule(null)).toEqual(ALWAYS_SCHEDULE);
    expect(normalizeStoredSchedule({ mode: 'weekly', time: '09:00', days: [] })).toEqual(ALWAYS_SCHEDULE);
    expect(normalizeStoredSchedule('garbage')).toEqual(ALWAYS_SCHEDULE);
    expect(normalizeStoredSchedule({ some: 'old shape nobody uses any more' })).toEqual(ALWAYS_SCHEDULE);
  });
});

describe('nextRunAt', () => {
  const TZ = 'Asia/Dhaka'; // UTC+6, no DST

  it('is null for "always" — there is no time-based run to preview', () => {
    expect(nextRunAt(ALWAYS_SCHEDULE, new Date('2026-11-11T00:00:00Z'), TZ)).toBeNull();
  });

  it('daily: today\'s own time when it has not passed yet, in the store\'s time zone', () => {
    // 2026-11-11 00:30 UTC = 06:30 Dhaka; the 09:00 run is still ahead today.
    const at = nextRunAt({ mode: 'daily', time: '09:00' }, new Date('2026-11-11T00:30:00Z'), TZ);
    expect(at?.toISOString()).toBe('2026-11-11T03:00:00.000Z'); // 09:00 Dhaka = 03:00 UTC
  });

  it('daily: tomorrow\'s run once today\'s own time has already passed', () => {
    // 2026-11-11T05:00:00Z = 11:00 Dhaka — past today's 09:00, so the next run is tomorrow's.
    const at = nextRunAt({ mode: 'daily', time: '09:00' }, new Date('2026-11-11T05:00:00Z'), TZ);
    expect(at?.toISOString()).toBe('2026-11-12T03:00:00.000Z');
  });

  it('weekly: the next matching weekday, possibly next week, never today if today does not match', () => {
    // 2026-11-11 is a Wednesday. Asking for Monday & Thursday should land on Thursday (2 days later).
    const at = nextRunAt({ mode: 'weekly', time: '09:00', days: [1, 4] }, new Date('2026-11-11T00:00:00Z'), TZ);
    expect(at?.toISOString()).toBe('2026-11-12T03:00:00.000Z'); // Thursday 2026-11-12, 09:00 Dhaka
  });

  it('weekly: today itself counts when today matches and its time has not passed yet', () => {
    // 2026-11-11 is a Wednesday (weekday 3); 00:00 Dhaka is before 09:00.
    const at = nextRunAt({ mode: 'weekly', time: '09:00', days: [3] }, new Date('2026-11-10T18:30:00Z'), TZ);
    expect(at?.toISOString()).toBe('2026-11-11T03:00:00.000Z');
  });
});
