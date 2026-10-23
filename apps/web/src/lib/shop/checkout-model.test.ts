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

describe('the store-wide delivery promise (PR 119)', () => {
  it('runs from the quickest priced band to the slowest; off bands promise nothing', async () => {
    const { anyBandHours } = await import('./checkout-model');
    const city = { hoursMin: 24, hoursMax: 48, priced: true };
    const outside = { hoursMin: 48, hoursMax: 72, priced: true };
    expect(anyBandHours([city, outside])).toEqual({ hoursMin: 24, hoursMax: 72 });
    expect(anyBandHours([city, { ...outside, priced: false }])).toEqual({ hoursMin: 24, hoursMax: 48 });
    expect(anyBandHours([{ ...city, priced: false }])).toEqual({ hoursMin: null, hoursMax: null });
    expect(anyBandHours([{ hoursMin: null, hoursMax: 72, priced: true }])).toEqual({ hoursMin: 72, hoursMax: 72 });
  });
});

describe('the payment boxes open on a phone (PR 120, demo rule 39)', () => {
  it('after one finished word or two words, in English or Bengali', async () => {
    const { payOpens } = await import('./checkout-model');
    expect(payOpens('')).toBe(false);
    expect(payOpens('Mirpur')).toBe(false);
    expect(payOpens('Mirpur ')).toBe(true);
    expect(payOpens('Mi,')).toBe(false);
    expect(payOpens('Mir,')).toBe(true);
    expect(payOpens('মিরপুর ')).toBe(true);
    expect(payOpens('ab cd')).toBe(true);
  });
});

describe('a kept payment choice (PR 120)', () => {
  it('is checked before it is sent again', async () => {
    const { payChoiceOf } = await import('./checkout-model');
    expect(payChoiceOf({ method: 'mobile', option: 'nagad' })).toEqual({ method: 'mobile', option: 'nagad' });
    expect(payChoiceOf({ method: 'cod' })).toEqual({ method: 'cod', option: null });
    expect(payChoiceOf({ method: 'cheque' })).toBeNull();
    expect(payChoiceOf(null)).toBeNull();
  });
});

describe('a refused Confirm (PR 124)', () => {
  it('points at the field with its own line, and lets go once the field is fixed', async () => {
    const { askKey, stillAsked } = await import('./checkout-model');
    const { checkForm } = await import('@extas/checkout/pure');
    const limits = { nameMin: 2, addressMin: 8 };
    const empty = checkForm({ name: '', phone: '', address: '' }, limits);
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.field).toBe('name');
    expect(askKey('name', empty)).toBe('name');
    expect(askKey('phone', empty)).toBe('phone');
    const bad = checkForm({ name: 'Rahim', phone: '0171', address: 'House 4, Road 2' }, limits);
    expect(askKey('phone', bad)).toBe('phoneBad');
    expect(stillAsked('phone', bad)).toBe('phone');
    const fixed = checkForm({ name: 'Rahim', phone: '01712345678', address: 'House 4, Road 2' }, limits);
    expect(stillAsked('phone', fixed)).toBeNull();
    expect(stillAsked(null, bad)).toBeNull();
  });
});
