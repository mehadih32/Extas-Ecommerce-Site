// S28 · PR 702 — the pure parts of Staff controls: hidden phone and address, the discount limit of a person with several
// roles (a role with nothing set is unlimited; the owner never is limited), and the newest handover count winning.
import { describe, expect, it } from 'vitest';
import { checkDiscount, discountLimitOf, hidesContact, maskAddress, maskContactDeep, maskPhone, newestHandovers, type HandoverRow } from './staff-controls';

const limits = {
  desk: { maxDiscountMinor: 50_000, maxDiscountPct: 10, hideContact: false },
  packer: { maxDiscountMinor: 0, maxDiscountPct: 0, hideContact: true },
  empty: { maxDiscountMinor: null, maxDiscountPct: null, hideContact: false },
};

describe('hidden contact (PR 702)', () => {
  it('a phone keeps its first two and last four digits', () => {
    expect(maskPhone('01712345678')).toBe('01•••••5678');
    expect(maskPhone('+8801712345678')).toBe('+88•••••••5678');
    expect(maskPhone('0171')).toBe('••••');
  });
  it('an address keeps its last two parts; one part alone is hidden', () => {
    expect(maskAddress('House 4, Road 2, Dhanmondi, Dhaka')).toBe('Dhanmondi, Dhaka');
    expect(maskAddress('House 4')).toBe('•••');
  });
  it('hides only the phone and address fields, at any depth, and leaves the rest', () => {
    const out = maskContactDeep({ order: { id: 'a', phone: '01712345678', customer: { name: 'Sample', address: 'H 1, Gulshan, Dhaka' }, lines: [{ sku: 'X', phone: '01812345678' }], total: 5 } });
    expect(out).toEqual({ order: { id: 'a', phone: '01•••••5678', customer: { name: 'Sample', address: 'Gulshan, Dhaka' }, lines: [{ sku: 'X', phone: '01•••••5678' }], total: 5 } });
  });
  it('the owner is never hidden; any hiding role hides', () => {
    expect(hidesContact({ limits }, ['packer'], true)).toBe(false);
    expect(hidesContact({ limits }, ['desk', 'packer'], false)).toBe(true);
    expect(hidesContact({ limits }, ['desk'], false)).toBe(false);
    expect(hidesContact({ limits }, [], false)).toBe(false);
  });
});

describe('discount limit (PR 702)', () => {
  it('the owner, a person with no roles and a role with nothing set are unlimited', () => {
    expect(discountLimitOf({ limits }, ['desk'], true).unlimited).toBe(true);
    expect(discountLimitOf({ limits }, [], false).unlimited).toBe(true);
    expect(discountLimitOf({ limits }, ['empty'], false).unlimited).toBe(true);
    expect(discountLimitOf({ limits }, ['desk', 'unlisted'], false).unlimited).toBe(true);
  });
  it('several roles give the widest limit', () => {
    const l = discountLimitOf({ limits: { ...limits, wide: { maxDiscountMinor: 90_000, maxDiscountPct: 5, hideContact: false } } }, ['desk', 'wide'], false);
    expect(l).toEqual({ unlimited: false, maxMinor: 90_000, maxPct: 10 });
  });
  it('within the limit it goes on; above it the owner must approve (amount or percent)', () => {
    const l = discountLimitOf({ limits }, ['desk'], false);
    expect(checkDiscount(l, 40_000, 1_000_000)).toEqual({ ok: true });
    expect(checkDiscount(l, 60_000, 1_000_000)).toEqual({ ok: false, reason: 'OVER_AMOUNT', limit: 50_000 });
    expect(checkDiscount(l, 30_000, 200_000)).toEqual({ ok: false, reason: 'OVER_PERCENT', limit: 10 });
    expect(checkDiscount(l, 0, 200_000)).toEqual({ ok: true });
    const pk = discountLimitOf({ limits }, ['packer'], false);
    expect(checkDiscount(pk, 1, 100)).toMatchObject({ ok: false });
  });
});

describe('handover sheet (PR 702)', () => {
  const row = (id: string, at: string, counted: number): HandoverRow => ({ id, day: '2026-11-12', staffUserId: 's1', method: 'CASH', expectedMinor: 1000, countedMinor: counted, differenceMinor: counted - 1000, note: null, at });
  it('the newest count for the same day, person and money replaces the older', () => {
    const out = newestHandovers([row('a', '2026-11-12T15:00:00Z', 900), row('b', '2026-11-12T16:00:00Z', 1000), { ...row('c', '2026-11-12T14:00:00Z', 5), method: 'WALLET' }]);
    expect(out.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });
});
