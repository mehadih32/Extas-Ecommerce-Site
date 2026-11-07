// PR 91 follow-up 172 — the set page's rules card: the delivery line and the paying line, from what the checkout reads.
import { describe, expect, it } from 'vitest';
import { cardDelivery, cardPay } from './rules-card';

const band = (id: string, chargeMinor: number | null, priced = true) => ({ id, nameEn: id, nameBn: null, priced, chargeMinor });

describe('rules card (follow-up 172)', () => {
  it('is free once the set reaches the live limit, which wins over the old number', () => {
    expect(cardDelivery({ freeOn: true, liveOverMinor: 300000, settingOverMinor: 999999, payMinor: 300000, rates: [] })).toEqual({ kind: 'free', overMinor: 300000 });
    expect(cardDelivery({ freeOn: true, liveOverMinor: null, settingOverMinor: 200000, payMinor: 250000, rates: null })).toEqual({ kind: 'free', overMinor: 200000 });
  });

  it('names the priced bands with their charges when not free, and only the priced ones', () => {
    const d = cardDelivery({ freeOn: true, liveOverMinor: 500000, settingOverMinor: null, payMinor: 100000, rates: [band('city', 7000), band('outside', 13000), band('far', null, false)] });
    expect(d).toEqual({ kind: 'rates', rates: [{ id: 'city', nameEn: 'city', nameBn: null, chargeMinor: 7000 }, { id: 'outside', nameEn: 'outside', nameBn: null, chargeMinor: 13000 }] });
  });

  it('says "at checkout" with free delivery off and no band priced', () => {
    expect(cardDelivery({ freeOn: false, liveOverMinor: 1, settingOverMinor: 1, payMinor: 10, rates: [band('city', null, false)] })).toEqual({ kind: 'checkout' });
  });

  it('lists Cash on Delivery and the prepaid ways the checkout offers now', () => {
    expect(cardPay({ cod: true, mobile: ['bkash', 'nagad'], card: ['visa'], online: false }, true)).toEqual({ cod: true, others: ['checkout.pm.bkash', 'checkout.pm.nagad', 'combo.rules.card'] });
    expect(cardPay({ cod: true, mobile: [], card: [], online: true }, false)).toEqual({ cod: false, others: ['combo.rules.card'] });
    expect(cardPay({ cod: false, mobile: [], card: [], online: false }, true)).toBeNull();
  });

  it('falls back to the COD switch alone when the checkout could not be read', () => {
    expect(cardPay(null, true)).toEqual({ cod: true, others: [] });
    expect(cardPay(null, false)).toBeNull();
  });
});
