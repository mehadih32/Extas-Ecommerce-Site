// PR 89 — the combo model with no database: when a combo is on sale, the store's days, and the one price rule (never
// above the regular total, "% off" rounded by the store's step, the saving never overstated). Made-up test values.
import { describe, expect, it } from 'vitest';
import { comboState, dayStart, daysFromWindow, eachMinor, fixedComboInputSchema, readiness, regularOf, roundMinor, setPricing, windowFromDays, ymdIn } from './model';

const TZ = 'Asia/Dhaka';
const NOW = new Date('2026-10-20T06:00:00Z');
const DOWN = { stepMinor: 1000, direction: 'down' as const };

describe('combo state (owner 11:51: nothing is deleted, ended and off sit in the archive)', () => {
  it('draft, off and ended by hand', () => {
    expect(comboState({ status: 'DRAFT', startsAt: null, endsAt: null }, NOW)).toBe('draft');
    expect(comboState({ status: 'PAUSED', startsAt: null, endsAt: null }, NOW)).toBe('off');
    expect(comboState({ status: 'ENDED', startsAt: null, endsAt: null }, NOW)).toBe('ended');
  });
  it('switched on: soon before the start, live inside, ended after; the end is exclusive', () => {
    const on = (startsAt: Date | null, endsAt: Date | null) => comboState({ status: 'RUNNING', startsAt, endsAt }, NOW);
    expect(on(null, null)).toBe('live');
    expect(on(new Date('2026-10-21T00:00:00Z'), null)).toBe('soon');
    expect(on(null, NOW)).toBe('ended');
    expect(on(null, new Date(NOW.getTime() + 1))).toBe('live');
  });
});

describe("the admin's days in the store's time zone", () => {
  it('a day starts at local midnight', () => {
    expect(dayStart('2026-10-20', TZ).toISOString()).toBe('2026-10-19T18:00:00.000Z');
    expect(ymdIn(new Date('2026-10-19T18:00:00Z'), TZ)).toBe('2026-10-20');
    expect(ymdIn(new Date('2026-10-19T17:59:59Z'), TZ)).toBe('2026-10-19');
  });
  it('the end date itself still sells, and the window round-trips', () => {
    const w = windowFromDays('2026-10-20', '2026-10-25', TZ);
    expect(w.endsAt!.toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(comboState({ status: 'RUNNING', ...w }, new Date('2026-10-25T17:59:00Z'))).toBe('live');
    expect(comboState({ status: 'RUNNING', ...w }, new Date('2026-10-25T18:00:00Z'))).toBe('ended');
    expect(daysFromWindow(w, TZ)).toEqual({ startsOn: '2026-10-20', endsOn: '2026-10-25' });
    expect(daysFromWindow({ startsAt: null, endsAt: null }, TZ)).toEqual({ startsOn: null, endsOn: null });
  });
});

describe('what a set costs (CN-009, R16 (5))', () => {
  const two = [
    { priceMinor: 100000, quantity: 1 },
    { priceMinor: 60000, quantity: 1 },
  ];
  it('the regular total is the sum of the real prices; a piece without a price makes it unsellable', () => {
    expect(regularOf(two)).toBe(160000);
    expect(regularOf([{ priceMinor: 50000, quantity: 3 }])).toBe(150000);
    expect(regularOf([{ priceMinor: null, quantity: 1 }, two[0]!])).toBeNull();
    expect(setPricing({ mode: 'FIXED', setMinor: 100 }, [{ priceMinor: null, quantity: 1 }], DOWN)).toMatchObject({ payMinor: null, reason: 'PIECE_NO_PRICE' });
  });
  it('a fixed set price below the regular total is an offer with an honest saving', () => {
    expect(setPricing({ mode: 'FIXED', setMinor: 140000 }, two, DOWN)).toEqual({ regularMinor: 160000, payMinor: 140000, savingMinor: 20000, savingPercent: 12, offer: true, reason: 'OFFER' });
  });
  it('never above the regular total: at or above it the regular total is charged and no saving shows', () => {
    for (const setMinor of [160000, 170000]) {
      expect(setPricing({ mode: 'FIXED', setMinor }, two, DOWN)).toMatchObject({ payMinor: 160000, savingMinor: 0, offer: false, reason: 'NOT_LOWER' });
    }
  });
  it('no set price yet: not sellable as a set', () => {
    expect(setPricing({ mode: 'FIXED', setMinor: null }, two, DOWN)).toMatchObject({ payMinor: null, reason: 'NO_SET_PRICE' });
    expect(setPricing({ mode: 'PERCENT', percentOff: null }, two, DOWN)).toMatchObject({ payMinor: null, reason: 'NO_SET_PRICE' });
  });
  it('"% off" is rounded by the store step and direction', () => {
    // 15% off 1,700.00 = 1,445.00 → down 1,440 · nearest 1,450 (1,445 rounds half up) · up 1,450
    const pieces = [{ priceMinor: 85000, quantity: 2 }];
    expect(setPricing({ mode: 'PERCENT', percentOff: 15 }, pieces, DOWN).payMinor).toBe(144000);
    expect(setPricing({ mode: 'PERCENT', percentOff: 15 }, pieces, { stepMinor: 1000, direction: 'nearest' }).payMinor).toBe(145000);
    expect(setPricing({ mode: 'PERCENT', percentOff: 15 }, pieces, { stepMinor: 1000, direction: 'up' }).payMinor).toBe(145000);
    expect(roundMinor(123456, { stepMinor: 1, direction: 'down' })).toBe(123456);
  });
  it('the saving percentage is rounded down: never more than the real saving', () => {
    expect(setPricing({ mode: 'FIXED', setMinor: 2001 }, [{ priceMinor: 3000, quantity: 1 }], DOWN).savingPercent).toBe(33);
  });
  it('"each" is for display only, rounded down', () => {
    expect(eachMinor(150000, 2)).toBe(75000);
    expect(eachMinor(100000, 3)).toBe(33333);
  });
});

describe('fixed combo input and readiness', () => {
  const P = '0190a000-0000-7000-8000-000000000001';
  it('a combo has at least two pieces and a sane window', () => {
    expect(fixedComboInputSchema.safeParse({ slug: 'polo-pair', nameEn: 'Polo pair', items: [{ productId: P, quantity: 2 }] }).success).toBe(true);
    expect(fixedComboInputSchema.safeParse({ slug: 'one', nameEn: 'One', items: [{ productId: P }] }).success).toBe(false);
    expect(fixedComboInputSchema.safeParse({ slug: 'Bad Slug', nameEn: 'x', items: [{ productId: P, quantity: 2 }] }).success).toBe(false);
    expect(fixedComboInputSchema.safeParse({ slug: 'w', nameEn: 'x', items: [{ productId: P, quantity: 2 }], startsOn: '2026-10-21', endsOn: '2026-10-20' }).success).toBe(false);
  });
  it('names every reason a combo cannot go on sale', () => {
    expect(readiness({ setPriceMinor: null, items: [{ productId: P, quantity: 1 }], pieces: [{ priceMinor: null }] })).toEqual(['NO_PIECES', 'NO_SET_PRICE', 'PIECE_NO_PRICE@1']);
    expect(readiness({ setPriceMinor: 1000, items: [{ productId: P, quantity: 2 }], pieces: [{ priceMinor: 900 }] })).toEqual([]);
  });
});
