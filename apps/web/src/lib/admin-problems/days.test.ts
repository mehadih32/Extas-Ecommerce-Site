// S21 · PR 423 — the Customer problems views in the shop's own time zone.
import { describe, expect, it } from 'vitest';
import { addDays, dayOf, dayStartAt, parseWhen, windowOf } from './days';

const TZ = 'Asia/Dhaka'; // the sample store's zone (UTC+6, no summer time)

describe('days', () => {
  it('knows the day and its start in the zone', () => {
    expect(dayOf(new Date('2026-10-31T19:30:00Z'), TZ)).toBe('2026-11-01');
    expect(dayStartAt('2026-11-01', TZ).toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(dayStartAt('2026-03-29', 'Europe/London').toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(dayStartAt('2026-07-01', 'Europe/London').toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('reads the view, anything else is today', () => {
    expect(parseWhen('week')).toBe('week');
    expect(parseWhen('2026-10-30')).toEqual({ day: '2026-10-30' });
    expect(parseWhen('2026-13-45')).toBe('today');
    expect(parseWhen('drop table')).toBe('today');
    expect(parseWhen(undefined)).toBe('today');
  });
  it('gives each view its window', () => {
    const now = new Date('2026-10-31T10:00:00Z');
    const w = (x: Parameters<typeof windowOf>[0]) => {
      const r = windowOf(x, now, TZ, 30);
      return [r.from.toISOString(), r.to.toISOString(), r.days];
    };
    expect(w('today')).toEqual(['2026-10-30T18:00:00.000Z', '2026-10-31T18:00:00.000Z', 1]);
    expect(w('yesterday')).toEqual(['2026-10-29T18:00:00.000Z', '2026-10-30T18:00:00.000Z', 1]);
    expect(w('week')).toEqual(['2026-10-24T18:00:00.000Z', '2026-10-31T18:00:00.000Z', 7]);
    expect(w('all')[2]).toBe(30);
    expect(w({ day: '2026-10-01' })).toEqual(['2026-09-30T18:00:00.000Z', '2026-10-01T18:00:00.000Z', 1]);
  });
});
