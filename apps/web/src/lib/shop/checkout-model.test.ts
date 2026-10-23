import { describe, expect, it } from 'vitest';
import { confirmedOf, hoursOf, named, placeLine } from './checkout-model';

const p = { id: 'a1', nameEn: 'Mirpur 12', nameBn: 'মিরপুর ১২', parentEn: 'Dhaka', parentBn: 'ঢাকা' };

describe('checkout model (S04)', () => {
  it('names a place in the page language with the district that tells it apart', () => {
    expect(placeLine('en', p)).toBe('Mirpur 12 · Dhaka');
    expect(placeLine('bn', p)).toBe('মিরপুর ১২ · ঢাকা');
    expect(placeLine('bn', { ...p, nameBn: null })).toBe('Mirpur 12 · ঢাকা');
    expect(placeLine('en', { ...p, parentEn: 'Mirpur 12', parentBn: null })).toBe('Mirpur 12');
    expect(placeLine('en', null)).toBe('');
    expect(named('bn', 'Dhaka', '')).toBe('Dhaka');
  });

  it('reads the band hours: a range, one figure, or nothing when unset', () => {
    const n = (x: number) => String(x);
    expect(hoursOf({ hoursMin: 24, hoursMax: 48 }, n)).toBe('24–48');
    expect(hoursOf({ hoursMin: 24, hoursMax: 24 }, n)).toBe('24');
    expect(hoursOf({ hoursMin: null, hoursMax: 72 }, n)).toBe('72');
    expect(hoursOf({ hoursMin: null, hoursMax: null }, n)).toBeNull();
  });

  it('a kept band choice is checked before it is sent again', () => {
    expect(confirmedOf({ bandId: 'b1', areaId: 'a1' })).toEqual({ bandId: 'b1', areaId: 'a1' });
    expect(confirmedOf({ bandId: 'b1' })).toEqual({ bandId: 'b1', areaId: null });
    expect(confirmedOf({ bandId: '' })).toBeNull();
    expect(confirmedOf({ bandId: 4 })).toBeNull();
    expect(confirmedOf('b1')).toBeNull();
    expect(confirmedOf(null)).toBeNull();
  });
});
