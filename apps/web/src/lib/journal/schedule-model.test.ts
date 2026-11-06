// S12 · PR 245 — the publish calendar's arithmetic: shop-time days and times, free times (lead time, taken times, the
// day's target, a short day flagged), the fill order (topic priority, then the longest waiting) and the month grid.
import { describe, expect, it } from 'vitest';
import { addDays, dayOf, daysAhead, fillPlan, freeTimes, monthGrid, shiftMonth, slotAt, slotsOf, timeOf } from './schedule-model';

const TZ = 'Asia/Dhaka';
const base = { slots: '18:00, 09:00, 12:00, 09:00, 15:00', perDayMin: 2, perDayTarget: 3, perDayMax: 4, daysAhead: 3, leadMinutes: 15, autoFill: false, weekStart: 6 };

describe('the publish calendar arithmetic (PR 245)', () => {
  it('reads the publishing times sorted and once each', () => {
    expect(slotsOf(base)).toEqual(['09:00', '12:00', '15:00', '18:00']);
  });

  it('turns shop-time days and times into moments and back', () => {
    const at = slotAt('2026-11-06', '09:00', TZ);
    expect(at.toISOString()).toBe('2026-11-06T03:00:00.000Z');
    expect(dayOf(new Date('2026-11-06T19:30:00Z'), TZ)).toBe('2026-11-07');
    expect(timeOf(new Date('2026-11-06T19:30:00Z'), TZ)).toBe('01:30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('gives the free times: never past or too close, never a taken time, never over the target', () => {
    const now = new Date('2026-11-06T05:50:00Z'); // 11:50 in Dhaka: 12:00 is too close
    const placed = [{ at: slotAt('2026-11-07', '09:00', TZ) }, { at: slotAt('2026-11-07', '10:30', TZ) }];
    const days = daysAhead(placed, base, now, TZ);
    expect(days.map((d) => d.day)).toEqual(['2026-11-06', '2026-11-07', '2026-11-08']);
    expect(days[0]!.free.map((x) => timeOf(x, TZ))).toEqual(['15:00', '18:00']);
    expect(days[0]!.low).toBe(false); // today is never flagged
    expect(days[1]).toMatchObject({ count: 2, low: false });
    expect(days[1]!.free.map((x) => timeOf(x, TZ))).toEqual(['12:00']);
    expect(days[2]).toMatchObject({ count: 0, low: true });
    expect(days[2]!.free).toHaveLength(3);
    expect(freeTimes(days)).toHaveLength(6);
  });

  it('places the highest priority first, then the one waiting longest, one per free time', () => {
    const free = [new Date('2026-11-06T09:00:00Z'), new Date('2026-11-06T12:00:00Z')];
    const ready = [
      { id: 'a', priority: 2, updatedAt: new Date('2026-11-01T00:00:00Z') },
      { id: 'b', priority: 1, updatedAt: new Date('2026-11-05T00:00:00Z') },
      { id: 'c', priority: 2, updatedAt: new Date('2026-10-01T00:00:00Z') },
    ];
    expect(fillPlan(ready, free).map((x) => [x.post.id, x.at.toISOString()])).toEqual([
      ['b', '2026-11-06T09:00:00.000Z'],
      ['c', '2026-11-06T12:00:00.000Z'],
    ]);
    expect(fillPlan([], free)).toEqual([]);
  });

  it('lays a month out in weeks from the chosen first day', () => {
    const sat = monthGrid('2026-11', 6); // 1 November 2026 is a Sunday
    expect(sat).toHaveLength(5);
    expect(sat[0]!.slice(0, 2)).toEqual([null, '2026-11-01']);
    expect(sat.flat().filter(Boolean)).toHaveLength(30);
    expect(monthGrid('2026-11', 0)[0]![0]).toBe('2026-11-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
