// PR 98, 100 — "Build your own set", pure: the picks checked against the group, live stock and the bag, the smallest
// and largest set, the card's "Add to set", and the set price from the tiers. Made-up test prices in poisha.
import { describe, expect, it } from 'vitest';
import { addProblem, checkBuild, picksByVariant, type BuildVariant } from './builder-model';

const TIERS = [
  { quantity: 2, priceMinor: 200000 },
  { quantity: 3, priceMinor: 270000 },
];
const V: BuildVariant[] = [
  { id: 'navy-m', productId: 'polo', colourId: 'navy', sizeId: 'm', sellable: 2, priceMinor: 120000 },
  { id: 'navy-l', productId: 'polo', colourId: 'navy', sizeId: 'l', sellable: 0, priceMinor: 120000 },
  { id: 'white-m', productId: 'polo', colourId: 'white', sizeId: 'm', sellable: 5, priceMinor: 110000 },
  { id: 'tee-m', productId: 'tee', colourId: 'black', sizeId: 'm', sellable: 5, priceMinor: 90000 },
  { id: 'unpriced', productId: 'tee', colourId: 'grey', sizeId: 'm', sellable: 5, priceMinor: null },
];
const base = { variants: V, tiers: TIERS, on: true };

describe('PR 98, 100 · the built set', () => {
  it('one piece is not a set yet; two and three get their tier, the dearest pieces first', () => {
    const one = checkBuild({ ...base, picks: ['navy-m'] });
    expect(one).toMatchObject({ ok: false, first: { code: 'TOO_FEW', need: 2 }, min: 2, max: 3, quote: { count: 1, payMinor: 120000, next: { quantity: 2, more: 1 } } });
    const two = checkBuild({ ...base, picks: ['navy-m', 'white-m'] });
    expect(two).toMatchObject({ ok: true, problems: [], quote: { regularMinor: 230000, payMinor: 200000, savingMinor: 30000, applied: { quantity: 2 }, next: { quantity: 3, more: 1 } } });
    const three = checkBuild({ ...base, picks: ['navy-m', 'white-m', 'tee-m'] });
    expect(three.quote).toMatchObject({ regularMinor: 320000, payMinor: 270000, applied: { quantity: 3 }, next: null });
  });

  it('never more pieces than the largest set; nothing while the builder is off or the rule has no price', () => {
    expect(checkBuild({ ...base, picks: ['navy-m', 'white-m', 'white-m', 'tee-m'] }).problems).toEqual([{ code: 'TOO_MANY', pick: null, need: 3 }]);
    expect(checkBuild({ ...base, on: false, picks: ['navy-m', 'white-m'] }).first).toEqual({ code: 'NOT_ON', pick: null });
    expect(checkBuild({ ...base, tiers: [], picks: ['navy-m', 'white-m'] }).first).toEqual({ code: 'NOT_ON', pick: null });
  });

  it('a piece outside the group, without a price, sold out, or more than can be sold counting the bag is refused at its pick', () => {
    expect(checkBuild({ ...base, picks: ['navy-m', 'shirt-m'] }).problems).toEqual([{ code: 'NOT_IN_GROUP', pick: 1 }]);
    expect(checkBuild({ ...base, picks: ['navy-m', 'unpriced'] }).problems).toEqual([{ code: 'NO_PRICE', pick: 1 }]);
    expect(checkBuild({ ...base, picks: ['navy-m', 'navy-l'] }).problems).toEqual([{ code: 'SOLD_OUT', pick: 1 }]);
    expect(checkBuild({ ...base, picks: ['navy-m', 'navy-m', 'navy-m'] }).problems).toEqual([{ code: 'NOT_ENOUGH', pick: 2, stock: 2, need: 3, inBag: 0 }]);
    // the audit's oversell bug: what the bag holds counts
    expect(checkBuild({ ...base, picks: ['navy-m', 'white-m'], inBag: { 'navy-m': 2 } }).problems).toEqual([{ code: 'NOT_ENOUGH', pick: 0, stock: 2, need: 1, inBag: 2 }]);
    // and the bag's most pieces of one item
    expect(checkBuild({ ...base, picks: ['white-m', 'white-m', 'white-m'], maxPerLine: 2 }).problems).toEqual([{ code: 'NOT_ENOUGH', pick: 2, stock: 2, need: 3, inBag: 0 }]);
  });

  it('the card says whether one more can go in, and why not', () => {
    expect(addProblem({ ...base, picks: [] }, 'navy-m')).toBeNull();
    expect(addProblem({ ...base, picks: ['navy-m', 'white-m', 'tee-m'] }, 'white-m')).toEqual({ code: 'FULL' });
    expect(addProblem({ ...base, picks: ['navy-m', 'navy-m'] }, 'navy-m')).toEqual({ code: 'NOT_ENOUGH', stock: 2, inBag: 0 });
    expect(addProblem({ ...base, picks: [], inBag: { 'navy-m': 2 } }, 'navy-m')).toEqual({ code: 'NOT_ENOUGH', stock: 2, inBag: 2 });
    expect(addProblem({ ...base, picks: [] }, 'navy-l')).toEqual({ code: 'SOLD_OUT' });
    expect(addProblem({ ...base, picks: [] }, 'unpriced')).toEqual({ code: 'NO_PRICE' });
    expect(addProblem({ ...base, picks: [] }, 'shirt-m')).toEqual({ code: 'NOT_IN_GROUP' });
  });

  it('the bag gets one line per variant with its quantity', () => {
    expect(picksByVariant(['navy-m', 'white-m', 'navy-m'])).toEqual([
      { variantId: 'navy-m', quantity: 2 },
      { variantId: 'white-m', quantity: 1 },
    ]);
  });
});
