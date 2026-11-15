import { describe, expect, it } from 'vitest';
import { bucketHours, CHART_HOURS, fastShare, hourOf, peakHour } from './inbox-stats';

const TZ = 'Asia/Dhaka'; // UTC+6, no summer time

describe('Inbox response times — the hour charts', () => {
  it('reads the hour on the shop clock, not the server clock', () => {
    expect(hourOf(new Date('2026-11-15T16:30:00Z'), TZ)).toBe(22);
    expect(hourOf(new Date('2026-11-15T18:00:00Z'), TZ)).toBe(0); // midnight is hour 0, never 24
  });
  it('counts moments per hour from 8 to 23 and leaves the night out', () => {
    const c = bucketHours(
      [new Date('2026-11-15T16:05:00Z'), new Date('2026-11-15T16:55:00Z'), new Date('2026-11-15T02:00:00Z'), new Date('2026-11-14T22:00:00Z')],
      TZ,
    );
    expect(c).toHaveLength(CHART_HOURS.length);
    expect(c[CHART_HOURS.indexOf(22)]).toBe(2);
    expect(c[CHART_HOURS.indexOf(8)]).toBe(1);
    expect(c.reduce((a, b) => a + b, 0)).toBe(3); // 04:00 and 03:00 are outside 8–23
  });
  it('names the busiest hour, the earliest on a tie, and none while nothing is counted', () => {
    expect(peakHour([0, 3, 3, 1])).toBe(9);
    expect(peakHour([0, 0, 0])).toBeNull();
  });
  it('shares the chats answered within the minutes, ignoring unanswered ones', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 10, 15, 6, m));
    expect(fastShare([])).toBeNull();
    expect(fastShare([{ createdAt: at(0), firstResponseAt: null }])).toBeNull();
    expect(
      fastShare([
        { createdAt: at(0), firstResponseAt: at(10) },
        { createdAt: at(0), firstResponseAt: at(15) },
        { createdAt: at(0), firstResponseAt: at(40) },
        { createdAt: at(0), firstResponseAt: null },
      ]),
    ).toBeCloseTo(66.67, 1);
  });
});
