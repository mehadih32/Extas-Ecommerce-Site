// The tracking steps read from what the order stores (PR 131, 135): never a step the order has not reached.
import { describe, expect, it } from 'vitest';
import { firstNameOf, initialsOf, trackOf } from './pure';

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
