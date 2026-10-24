// PR 185 (Blueprint B1.8) — the exchange engine's pure rules: the four tiers strictly in order, the window from the
// courier's delivered mark, the per-piece limit and the money box. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import { exchangeCharge, exchangeOffer, exchangeWindow, isOurMistake, lineOnNewOrder, moneyBox, perItemLeft, tierOf, type Candidate, type ChargeRules, type OriginalPiece, type TierSettings } from './exchange-pure';

const ALL: TierSettings = { sameColour: true, otherColours: true, sameCategory: true, collectionFirst: true, otherCategories: true, maxOptions: 12 };
const orig: OriginalPiece = { productId: 'oxford', colourId: 'sky', categoryIds: ['shirts'], collectionIds: ['eid'] };
const c = (variantId: string, more: Partial<Candidate>): Candidate => ({ variantId, productId: 'oxford', colourId: 'sky', sizeKey: 'L', categoryIds: ['shirts'], collectionIds: [], sellable: 5, excluded: false, ...more });

describe('the four tiers (B1.8)', () => {
  const pool = [
    c('oxford-sky-L', {}),
    c('oxford-white-L', { colourId: 'white' }),
    c('linen-L', { productId: 'linen', colourId: 'white', collectionIds: [] }),
    c('poplin-L', { productId: 'poplin', colourId: 'blue', collectionIds: ['eid'] }),
    c('tee-L', { productId: 'tee', colourId: 'sky', categoryIds: ['tees'] }),
  ];

  it('names the tier of every candidate', () => {
    expect(pool.map((x) => tierOf(orig, x))).toEqual([1, 2, 3, 3, 4]);
  });

  it('offers only the first tier with stock, so no tier is skipped', () => {
    expect(exchangeOffer(ALL, orig, 'L', 1, pool)).toMatchObject({ tier: 1, options: [{ variantId: 'oxford-sky-L' }] });
    const noSame = pool.filter((x) => x.variantId !== 'oxford-sky-L');
    expect(exchangeOffer(ALL, orig, 'L', 1, noSame)).toMatchObject({ tier: 2, options: [{ variantId: 'oxford-white-L' }] });
  });

  it('tier 3 lists the same collection first; tier 4 only when the category has nothing', () => {
    const t3 = pool.filter((x) => x.productId !== 'oxford');
    expect(exchangeOffer(ALL, orig, 'L', 1, t3).options.map((x) => x.variantId)).toEqual(['poplin-L', 'linen-L']);
    expect(exchangeOffer({ ...ALL, collectionFirst: false }, orig, 'L', 1, t3).options.map((x) => x.variantId)).toEqual(['linen-L', 'poplin-L']);
    expect(exchangeOffer(ALL, orig, 'L', 1, [pool[4]!])).toMatchObject({ tier: 4, options: [{ variantId: 'tee-L' }] });
  });

  it('a switched-off tier is never offered; the next one is', () => {
    expect(exchangeOffer({ ...ALL, sameColour: false }, orig, 'L', 1, pool)).toMatchObject({ tier: 2 });
    expect(exchangeOffer({ ...ALL, sameColour: false, otherColours: false, sameCategory: false, otherCategories: false }, orig, 'L', 1, pool)).toEqual({ tier: null, options: [] });
  });

  it('only the needed size, only with enough stock, never an excluded category; capped', () => {
    expect(exchangeOffer(ALL, orig, 'XL', 1, pool)).toEqual({ tier: null, options: [] });
    expect(exchangeOffer(ALL, orig, 'L', 6, pool)).toEqual({ tier: null, options: [] });
    expect(exchangeOffer(ALL, orig, 'L', 1, [c('x', { excluded: true })])).toEqual({ tier: null, options: [] });
    const many = Array.from({ length: 20 }, (_, i) => c(`v${String(i).padStart(2, '0')}`, { colourId: 'white' }));
    expect(exchangeOffer({ ...ALL, maxOptions: 3 }, orig, 'L', 1, many).options).toHaveLength(3);
  });
});

describe('the window and the limit', () => {
  const at = new Date('2026-10-20T10:00:00Z');
  it('counts from the delivered mark; a missing mark is UNKNOWN, never open', () => {
    expect(exchangeWindow(at, 72, new Date('2026-10-22T10:00:00Z'))).toEqual({ state: 'OPEN', endsAt: new Date('2026-10-23T10:00:00Z'), hoursLeft: 24 });
    expect(exchangeWindow(at, 72, new Date('2026-10-23T10:00:00Z'))).toMatchObject({ state: 'CLOSED' });
    expect(exchangeWindow(null, 72, at)).toEqual({ state: 'UNKNOWN' });
  });
  it('exchanges per piece: null is no limit', () => {
    expect(perItemLeft(null, 5)).toBeNull();
    expect(perItemLeft(1, 0)).toBe(1);
    expect(perItemLeft(1, 1)).toBe(0);
  });
});

describe('the money box (B1.8)', () => {
  it('dearer: the difference and the charge as Cash on Delivery', () => {
    expect(moneyBox([{ oldUnitMinor: 150_000, newUnitMinor: 180_000, quantity: 1 }], { ourMistake: false, chargeMinor: 6_000 })).toEqual({ differenceMinor: 30_000, owedMinor: 30_000, creditMinor: 0, chargeMinor: 6_000, chargeState: 'SET', codMinor: 36_000, coveredMinor: 150_000 });
  });
  it('cheaper: the difference is a wallet credit, the charge is still collected', () => {
    expect(moneyBox([{ oldUnitMinor: 180_000, newUnitMinor: 150_000, quantity: 1 }], { ourMistake: false, chargeMinor: 6_000 })).toMatchObject({ owedMinor: 0, creditMinor: 30_000, codMinor: 6_000 });
  });
  it('same price: the charge only; no charge figure yet → nothing collected, NOT_SET', () => {
    expect(moneyBox([{ oldUnitMinor: 150_000, newUnitMinor: 150_000, quantity: 2 }], { ourMistake: false, chargeMinor: 6_000 })).toMatchObject({ differenceMinor: 0, codMinor: 6_000 });
    expect(moneyBox([{ oldUnitMinor: 150_000, newUnitMinor: 150_000, quantity: 1 }], { ourMistake: false, chargeMinor: null })).toMatchObject({ chargeState: 'NOT_SET', codMinor: 0 });
  });
  it('our mistake: nothing to pay; a cheaper piece still leaves its credit', () => {
    expect(moneyBox([{ oldUnitMinor: 150_000, newUnitMinor: 180_000, quantity: 1 }], { ourMistake: true, chargeMinor: 6_000 })).toMatchObject({ owedMinor: 0, chargeMinor: 0, codMinor: 0, chargeState: 'FREE_OUR_MISTAKE' });
    expect(moneyBox([{ oldUnitMinor: 180_000, newUnitMinor: 150_000, quantity: 1 }], { ourMistake: true, chargeMinor: 6_000 })).toMatchObject({ creditMinor: 30_000, codMinor: 0 });
    expect(['size', 'defect', 'damage', 'wrong'].map((r) => isOurMistake(r as 'size'))).toEqual([false, true, true, true]);
  });
  it('piece by piece: a dearer and a cheaper piece are not netted', () => {
    expect(moneyBox([{ oldUnitMinor: 100, newUnitMinor: 150, quantity: 1 }, { oldUnitMinor: 200, newUnitMinor: 150, quantity: 1 }], { ourMistake: false, chargeMinor: 0 })).toMatchObject({ differenceMinor: 0, owedMinor: 50, creditMinor: 50, codMinor: 50 });
  });
  it('the new order line: its price, what the old piece covers, the rest owed', () => {
    expect(lineOnNewOrder({ oldUnitMinor: 150, newUnitMinor: 180, quantity: 2 }, false)).toEqual({ unitPriceMinor: 180, discountMinor: 300, lineTotalMinor: 60 });
    expect(lineOnNewOrder({ oldUnitMinor: 180, newUnitMinor: 150, quantity: 1 }, false)).toEqual({ unitPriceMinor: 150, discountMinor: 150, lineTotalMinor: 0 });
    expect(lineOnNewOrder({ oldUnitMinor: 150, newUnitMinor: 180, quantity: 1 }, true)).toEqual({ unitPriceMinor: 180, discountMinor: 180, lineTotalMinor: 0 });
  });
  it('refuses a broken amount', () => {
    expect(() => moneyBox([{ oldUnitMinor: -1, newUnitMinor: 1, quantity: 1 }], { ourMistake: false, chargeMinor: null })).toThrow();
  });
});

describe('PR 190 · who pays the second delivery (CN-018 (5), CN-014e)', () => {
  const rules: ChargeRules = { sizePays: 'customer', fallbackMinor: null, reshipFree: false };
  const one = [{ oldUnitMinor: 150_000, newUnitMinor: 150_000, quantity: 1 }];
  it('the customer pays for his own size choice: the rule for his band, else the owner fallback, else nothing set', () => {
    expect(exchangeCharge({ reason: 'size', ruleChargeMinor: 6_000, rules, reship: false, oneTrip: null })).toEqual({ chargeMinor: 6_000 });
    expect(exchangeCharge({ reason: 'size', ruleChargeMinor: null, rules: { ...rules, fallbackMinor: 8_000 }, reship: false, oneTrip: null })).toEqual({ chargeMinor: 8_000 });
    expect(moneyBox(one, { ourMistake: false, ...exchangeCharge({ reason: 'size', ruleChargeMinor: null, rules, reship: false, oneTrip: null }) })).toMatchObject({ chargeState: 'NOT_SET', codMinor: 0 });
  });
  it('the shop pays when the owner says so, a waiver or an accepted claim — nothing collected for the charge', () => {
    const store = exchangeCharge({ reason: 'size', ruleChargeMinor: 6_000, rules: { ...rules, sizePays: 'store' }, reship: false, oneTrip: null });
    expect(moneyBox(one, { ourMistake: false, ...store })).toMatchObject({ chargeMinor: 0, chargeState: 'STORE', codMinor: 0 });
    for (const state of ['WAIVED', 'CLAIM_ACCEPTED'] as const) expect(moneyBox([{ oldUnitMinor: 100, newUnitMinor: 150, quantity: 1 }], { ourMistake: false, chargeMinor: 6_000, state })).toMatchObject({ chargeMinor: 0, chargeState: state, codMinor: 50 });
  });
  it('a re-ship after a try-on pays like any size choice unless the perk is on; the one-trip swap has its own price', () => {
    expect(exchangeCharge({ reason: 'size', ruleChargeMinor: 6_000, rules, reship: true, oneTrip: null })).toEqual({ chargeMinor: 6_000 });
    expect(exchangeCharge({ reason: 'size', ruleChargeMinor: 6_000, rules: { ...rules, reshipFree: true }, reship: true, oneTrip: null })).toEqual({ chargeMinor: null, state: 'STORE' });
    const trip = exchangeCharge({ reason: 'size', ruleChargeMinor: 6_000, rules, reship: false, oneTrip: { chargeMinor: 9_000 } });
    expect(moneyBox(one, { ourMistake: false, ...trip })).toMatchObject({ chargeMinor: 9_000, chargeState: 'ONE_TRIP', codMinor: 9_000 });
    expect(exchangeCharge({ reason: 'size', ruleChargeMinor: 6_000, rules, reship: false, oneTrip: { chargeMinor: null } })).toEqual({ chargeMinor: null });
  });
  it('our mistake stays free whatever the charge says', () => {
    expect(moneyBox(one, { ourMistake: true, chargeMinor: 9_000, state: 'ONE_TRIP' })).toMatchObject({ chargeMinor: 0, chargeState: 'FREE_OUR_MISTAKE' });
  });
});
