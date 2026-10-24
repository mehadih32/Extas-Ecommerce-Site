// The tracking steps read from what the order stores (PR 131, 135): never a step the order has not reached.
import { describe, expect, it } from 'vitest';
import { courierNewsOf, firstNameOf, initialsOf, lateOf, riderAmountOf, trackOf } from './pure';

const T = { placedAt: '2026-10-20T06:00:00Z', confirmedAt: '2026-10-20T08:00:00Z', packedAt: '2026-10-21T06:00:00Z', handedOverAt: '2026-10-21T10:00:00Z' };

describe('tracking steps from the stored order', () => {
  it('each state reaches its own step, with the times stored', () => {
    expect(trackOf('PLACED', { placedAt: T.placedAt })).toMatchObject({ reached: 0, ended: null, done: false, at: { placed: '2026-10-20T06:00:00.000Z' } });
    expect(trackOf('CONFIRMED', T).reached).toBe(1);
    expect(trackOf('PACKED', T).reached).toBe(2);
    expect(trackOf('IN_TRANSIT', T)).toMatchObject({ reached: 3, at: { courier: '2026-10-21T10:00:00.000Z' } });
    expect(trackOf('DELIVERED', { ...T, deliveredAt: '2026-10-22T06:00:00Z' })).toMatchObject({ reached: 4, done: true });
    expect(trackOf('ON_HOLD', T).reached).toBe(0);
  });

  it('a cancelled or returned order is a state, showing how far it came', () => {
    expect(trackOf('CANCELLED', { placedAt: T.placedAt, confirmedAt: T.confirmedAt })).toMatchObject({ reached: 1, ended: 'cancelled', done: false });
    expect(trackOf('RETURNED', T)).toMatchObject({ reached: 3, ended: 'returned' });
  });

  it('names', () => {
    expect(firstNameOf('  Rahim  Uddin ')).toBe('Rahim');
    expect(firstNameOf(null)).toBe('');
    expect(initialsOf('rahim uddin khan')).toBe('RU');
    expect(initialsOf('')).toBe('');
  });
});

describe('the late flag (SIM-F-018) and the amount for the rider (CN-014 idea 10)', () => {
  const ON = { enabled: true, graceHours: 0 };
  const placed = '2026-10-20T06:00:00Z';
  const at = (iso: string) => new Date(iso);

  it('a parcel past its band promise in hours is late; before it, or delivered, it is not', () => {
    // SIM-F-018: booked four days ago, the band promises 72 hours, the page still says "with the courier"
    const withCourier = { status: 'HANDED_OVER' as const, placedAt: placed, hoursMax: 72 };
    expect(lateOf(withCourier, ON, at('2026-10-24T06:00:00Z'))).toEqual({ late: true, dueBy: '2026-10-23T06:00:00.000Z' });
    expect(lateOf(withCourier, ON, at('2026-10-23T05:59:00Z')).late).toBe(false);
    expect(lateOf({ ...withCourier, status: 'DELIVERED' }, ON, at('2026-10-30T06:00:00Z')).late).toBe(false);
    expect(lateOf({ ...withCourier, status: 'CANCELLED' }, ON, at('2026-10-30T06:00:00Z')).late).toBe(false);
  });

  it('the grace and the switch are the owner settings; a band without hours is never late', () => {
    const o = { status: 'IN_TRANSIT' as const, placedAt: placed, hoursMax: 24 };
    expect(lateOf(o, { enabled: true, graceHours: 12 }, at('2026-10-21T12:00:00Z')).late).toBe(false);
    expect(lateOf(o, { enabled: true, graceHours: 12 }, at('2026-10-21T18:01:00Z')).late).toBe(true);
    expect(lateOf(o, { enabled: false, graceHours: 0 }, at('2026-10-29T00:00:00Z'))).toEqual({ late: false, dueBy: '2026-10-21T06:00:00.000Z' });
    expect(lateOf({ ...o, hoursMax: null }, ON, at('2026-12-01T00:00:00Z'))).toEqual({ late: false, dueBy: null });
  });

  it('the rider takes the Cash-on-Delivery amount, nothing for a paid order, and no line while a payment waits', () => {
    expect(riderAmountOf({ kind: 'cod', dueMinor: 245000 })).toBe(245000);
    expect(riderAmountOf({ kind: 'paid' })).toBe(0);
    expect(riderAmountOf({ kind: 'due', dueMinor: 1000 })).toBeNull();
    expect(riderAmountOf({ kind: 'failed', dueMinor: 1000 })).toBeNull();
  });
});

describe('PR 184: the courier news on his order page', () => {
  const ON = { enabled: true, exceptions: true };
  it('says what the courier last told us while the order is on its way, never once it is finished', () => {
    expect(courierNewsOf({ status: 'OUT_FOR_DELIVERY' }, 'IN_TRANSIT', ON)).toBe('out');
    expect(courierNewsOf({ status: 'ATTEMPT_FAILED' }, 'IN_TRANSIT', ON)).toBe('tryFailed');
    expect(courierNewsOf({ status: 'ADDRESS_PROBLEM' }, 'IN_TRANSIT', ON)).toBe('address');
    expect(courierNewsOf({ status: 'LOST' }, 'IN_TRANSIT', ON)).toBe('checking');
    expect(courierNewsOf({ status: 'DAMAGED' }, 'HANDED_OVER', ON)).toBe('checking');
    expect(courierNewsOf({ status: 'IN_TRANSIT' }, 'IN_TRANSIT', ON)).toBeNull();
    expect(courierNewsOf({ status: 'OUT_FOR_DELIVERY' }, 'DELIVERED', ON)).toBeNull();
    expect(courierNewsOf(null, 'IN_TRANSIT', ON)).toBeNull();
  });

  it('off by default; the problems only with their own switch', () => {
    expect(courierNewsOf({ status: 'OUT_FOR_DELIVERY' }, 'IN_TRANSIT', { enabled: false, exceptions: true })).toBeNull();
    expect(courierNewsOf({ status: 'ATTEMPT_FAILED' }, 'IN_TRANSIT', { enabled: true, exceptions: false })).toBeNull();
    expect(courierNewsOf({ status: 'OUT_FOR_DELIVERY' }, 'IN_TRANSIT', { enabled: true, exceptions: false })).toBe('out');
  });
});
