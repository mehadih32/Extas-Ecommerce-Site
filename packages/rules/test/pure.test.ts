// S10 pure logic: the engine (PR 208), delivery (210), exchange (211), set tiers (212), discounts and the "was" price
// guard (213), festive cut-offs (214), rule text (215), notices and pop-ups (216), conflicts and the resolution order
// (217), history (218), and the templates. No database. Every number below is a made-up test value.
import { describe, expect, it } from 'vitest';
import {
  ALL_SCOPE,
  percentCut,
  ALWAYS,
  bestTierGrouping,
  capAllows,
  checkNotice,
  checkRule,
  conditionHolds,
  detectConflicts,
  diffContent,
  discountWasPrice,
  setWasPrice,
  exchangeOpen,
  exchangeTerms,
  floorMinorOf,
  fixDrift,
  isSearchReferrer,
  literalsIn,
  moneyChanges,
  needsOwnerOk,
  noticeInputSchema,
  pauseTimer,
  popupVerdict,
  quote,
  resolutionOrder,
  resumeTimer,
  ruleContentSchema,
  ruleText,
  scopesOverlap,
  spread,
  startTimer,
  timerRemaining,
  tokensIn,
  type CartFacts,
  type CheckLimits,
  type LineFact,
  type Rule,
  type RuleContent,
} from '../src/pure';
import { contentFromTemplate, TEMPLATES, templateById } from '../src/templates';
import { ownerOkNeeded } from '../src/core';

const NOW = new Date('2026-10-20T06:00:00Z');
const CTX = { locale: 'en-BD', currency: 'BDT', timeZone: 'Asia/Dhaka' };
const BN = { ...CTX, locale: 'bn-BD' };
const LIMITS: CheckLimits = { shortMaxChars: 90, fullMaxChars: 2000, maxPercentOff: 90, placements: ['product', 'bag', 'checkout', 'faq', 'announcement', 'thank-you', 'account', 'messages', 'assistant', 'footer', 'build-set'] };
const ENGINE = { maxPercentOff: 90 };
const CAT_POLO = '00000000-0000-7000-8000-000000000001';
const CAT_TEE = '00000000-0000-7000-8000-000000000002';
const CAT_TOPS = '00000000-0000-7000-8000-000000000003';
const PROD_A = '00000000-0000-7000-8000-0000000000a1';
const PROD_B = '00000000-0000-7000-8000-0000000000b1';

let n = 0;
function rule(c: Partial<RuleContent> & Pick<RuleContent, 'kind'>, extra: Partial<Rule> = {}): Rule {
  n++;
  return {
    key: `rule-${n}`,
    nameEn: `Rule ${n}`,
    text: { short: { en: 'Test rule' } },
    params: [],
    scope: ALL_SCOPE,
    conditions: ALWAYS,
    actions: [],
    placements: [],
    priority: 0,
    stackable: false,
    status: 'ACTIVE',
    startsAt: null,
    endsAt: null,
    id: `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`,
    version: 1,
    archived: false,
    ...c,
    ...extra,
  };
}
const money = (key: string, value: number | null) => ({ key, type: 'money' as const, value, labelEn: key });
const line = (id: string, price: number, qty = 1, over: Partial<LineFact> = {}): LineFact => ({ id, unitPriceMinor: price, quantity: qty, productId: PROD_A, categoryIds: [CAT_POLO, CAT_TOPS], collectionIds: [], ...over });
const cart = (lines: LineFact[], over: Partial<CartFacts> = {}): CartFacts => ({
  now: NOW,
  lines,
  bandKey: 'dhaka-city',
  paymentMethod: 'COD',
  couponCode: null,
  couponRuleIds: [],
  customer: { loggedIn: false, deliveredOrders: null },
  source: 'WEBSITE',
  weekday: 2,
  hour: 12,
  ...over,
});

const delivery = (vals: { city?: number | null; out?: number | null; free?: number | null } = {}) =>
  rule({
    kind: 'delivery',
    params: [money('city', vals.city === undefined ? 8000 : vals.city), money('out', vals.out === undefined ? 12000 : vals.out), money('freeOver', vals.free === undefined ? 150000 : vals.free)],
    actions: [{ type: 'deliveryCharge', byBand: { 'dhaka-city': 'city', 'outside-dhaka': 'out' } }, { type: 'freeDeliveryOver', param: 'freeOver' }],
    text: { short: { en: 'Inside Dhaka {city}' }, progress: { en: 'Add {remaining} more for free delivery' }, unlocked: { en: 'Free delivery' } },
  });

describe('PR 208 · conditions, window, resolution order', () => {
  it('conditions: leaf ops, all / any / not, text compared without case', () => {
    const facts = { 'cart.subtotal': 5000, 'delivery.band': 'dhaka-city', 'cart.couponCode': 'eid10', 'customer.loggedIn': true };
    expect(conditionHolds({ field: 'cart.subtotal', op: 'gte', value: 5000 }, facts)).toBe(true);
    expect(conditionHolds({ field: 'cart.subtotal', op: 'gt', value: 5000 }, facts)).toBe(false);
    expect(conditionHolds({ field: 'cart.couponCode', op: 'eq', value: 'EID10' }, facts)).toBe(true);
    expect(conditionHolds({ field: 'delivery.band', op: 'in', value: ['outside-dhaka', 'dhaka-city'] }, facts)).toBe(true);
    expect(conditionHolds({ any: [{ field: 'customer.loggedIn', op: 'eq', value: false }, { field: 'payment.method', op: 'missing' }] }, facts)).toBe(true);
    expect(conditionHolds({ not: { field: 'customer.loggedIn', op: 'eq', value: true } }, facts)).toBe(false);
    expect(conditionHolds(ALWAYS, {})).toBe(true);
  });

  it('a rule outside its window, paused or archived does nothing', () => {
    const r = (extra: Partial<Rule>) => rule({ kind: 'discount', params: [{ key: 'pct', type: 'percent', value: 10, labelEn: 'p' }], actions: [{ type: 'discount', mode: 'percent', param: 'pct', target: 'lines', requiresCoupon: false, showWas: false }] }, extra);
    const c = cart([line('l1', 100000)]);
    expect(quote([r({})], c, ENGINE).discountMinor).toBe(10000);
    expect(quote([r({ startsAt: '2026-10-21T00:00:00Z' })], c, ENGINE).discountMinor).toBe(0);
    expect(quote([r({ endsAt: '2026-10-20T06:00:00Z' })], c, ENGINE).discountMinor).toBe(0);
    expect(quote([r({ status: 'PAUSED' })], c, ENGINE).discountMinor).toBe(0);
    expect(quote([r({ archived: true })], c, ENGINE).discountMinor).toBe(0);
  });

  it('resolution order: priority, then the narrower scope, then the newer start, then the key', () => {
    const base = { kind: 'delivery' as const };
    const a = rule({ ...base, priority: 5 });
    const b = rule({ ...base, priority: 1 });
    expect(resolutionOrder(a, b)).toBeLessThan(0);
    const product = rule({ ...base, scope: { include: [{ type: 'product', id: PROD_A }], exclude: [] } });
    const everything = rule(base);
    expect(resolutionOrder(product, everything)).toBeLessThan(0);
    const newer = rule({ ...base, startsAt: '2026-10-01T00:00:00Z' });
    const older = rule({ ...base, startsAt: '2026-01-01T00:00:00Z' });
    expect(resolutionOrder(newer, older)).toBeLessThan(0);
    expect(resolutionOrder(rule({ ...base, key: 'a-rule' }), rule({ ...base, key: 'b-rule' }))).toBeLessThan(0);
  });

  it('scopes: category lines with parents are seen to overlap; two products apart are apart', () => {
    const parents = new Map<string, string | null>([[CAT_POLO, CAT_TOPS], [CAT_TEE, CAT_TOPS], [CAT_TOPS, null]]);
    expect(scopesOverlap({ include: [{ type: 'category', id: CAT_POLO }], exclude: [] }, { include: [{ type: 'category', id: CAT_TOPS }], exclude: [] }, parents)).toBe(true);
    expect(scopesOverlap({ include: [{ type: 'category', id: CAT_POLO }], exclude: [] }, { include: [{ type: 'category', id: CAT_TEE }], exclude: [] }, parents)).toBe(false);
    expect(scopesOverlap({ include: [{ type: 'product', id: PROD_A }], exclude: [] }, { include: [{ type: 'product', id: PROD_B }], exclude: [] })).toBe(false);
  });

  it('spread never gives more than the total and rounds down', () => {
    expect(spread(100, [50, 50, 50])).toEqual([34, 33, 33]);
    expect(spread(0, [5, 5])).toEqual([0, 0]);
    expect(spread(10, [3, 0]).reduce((s, x) => s + x, 0)).toBe(3);
  });
});

describe('PR 210 · delivery', () => {
  it('charges the band, says how much more for free delivery, then makes it free', () => {
    const d = delivery();
    const q1 = quote([d], cart([line('l1', 100000)]), ENGINE);
    expect(q1.delivery).toMatchObject({ chargeMinor: 8000, free: false, reason: 'CHARGED', remainingMinor: 50000 });
    expect(q1.totalMinor).toBe(108000);
    const q2 = quote([d], cart([line('l1', 100000), line('l2', 60000)]), ENGINE);
    expect(q2.delivery).toMatchObject({ chargeMinor: 0, free: true, reason: 'FREE_OVER' });
    const q3 = quote([d], cart([line('l1', 100000)], { bandKey: 'outside-dhaka' }), ENGINE);
    expect(q3.delivery.chargeMinor).toBe(12000);
  });

  it('never makes a charge up: unknown band, unset charge, no rule', () => {
    expect(quote([delivery()], cart([line('l1', 1000)], { bandKey: 'dhaka-sub-area' }), ENGINE).delivery).toMatchObject({ chargeMinor: null, reason: 'NO_RULE' });
    const q = quote([delivery({ city: null })], cart([line('l1', 1000)]), ENGINE);
    expect(q.delivery).toMatchObject({ chargeMinor: null, reason: 'NOT_SET' });
    expect(q.totalKnown).toBe(false);
    expect(quote([], cart([line('l1', 1000)], { bandKey: null }), ENGINE).delivery.reason).toBe('NO_BAND');
  });

  it('a free-delivery campaign and free-delivery products', () => {
    const camp = rule({ kind: 'festive', actions: [{ type: 'freeDelivery' }] });
    expect(quote([delivery(), camp], cart([line('l1', 1000)]), ENGINE).delivery.reason).toBe('FREE_CAMPAIGN');
    expect(quote([delivery()], cart([line('l1', 1000, 1, { freeDelivery: true })]), ENGINE).delivery.reason).toBe('FREE_PRODUCTS');
  });

  it('follow-up 54 (PR 119): the band\'s own figure is the charge, as at the checkout; the rules decide only free delivery', () => {
    const d = delivery(); // its deliveryCharge says 8000 for the city band
    const q = quote([d], cart([line('l1', 100000)], { bandChargeMinor: 9900 }), ENGINE);
    expect(q.delivery).toMatchObject({ baseChargeMinor: 9900, chargeMinor: 9900, free: false, reason: 'CHARGED', chargeRule: null, remainingMinor: 50000 });
    expect(q.totalMinor).toBe(109900);
    expect(q.applied.some((a) => a.effect === 'deliveryCharge')).toBe(false);
    // Free over the threshold: nothing to pay, and the free delivery is worth the band's figure.
    const free = quote([d], cart([line('l1', 100000), line('l2', 60000)], { bandChargeMinor: 9900 }), ENGINE);
    expect(free.delivery).toMatchObject({ chargeMinor: 0, free: true, reason: 'FREE_OVER', baseChargeMinor: 9900 });
    expect(free.applied.find((a) => a.effect === 'freeDelivery')?.amountMinor).toBe(9900);
    // A band with no charge yet: "+ delivery", never a rule's figure in its place.
    expect(quote([d], cart([line('l1', 1000)], { bandChargeMinor: null }), ENGINE).delivery).toMatchObject({ chargeMinor: null, reason: 'NOT_SET' });
    // With no delivery rule at all the band still charges.
    expect(quote([], cart([line('l1', 1000)], { bandChargeMinor: 6000 }), ENGINE).delivery).toMatchObject({ chargeMinor: 6000, reason: 'CHARGED' });
    // No band known: nothing to charge, whatever figure came along.
    expect(quote([d], cart([line('l1', 1000)], { bandKey: null, bandChargeMinor: 6000 }), ENGINE).delivery.reason).toBe('NO_BAND');
  });

  it('follow-up 54: knowing the band figure never changes who may pay cash on delivery (COD needs the owner)', () => {
    const cod = rule({ kind: 'payment', params: [{ key: 'on', type: 'bool', value: true, labelEn: 'on' }, money('max', 104000)], actions: [{ type: 'cod', allowedParam: 'on', maxOrderParam: 'max' }] });
    for (const rules of [[cod], [cod, delivery()]]) {
      for (const items of [100000, 103000, 105000]) {
        const before = quote(rules, cart([line('l1', items)]), ENGINE).cod;
        const after = quote(rules, cart([line('l1', items)], { bandChargeMinor: 9900 }), ENGINE).cod;
        expect(after, `${rules.length} rules, ${items}`).toEqual(before);
      }
    }
  });

  it('the threshold counts the items after discounts', () => {
    const disc = rule({ kind: 'discount', params: [{ key: 'pct', type: 'percent', value: 20, labelEn: 'p' }], actions: [{ type: 'discount', mode: 'percent', param: 'pct', target: 'lines', requiresCoupon: false, showWas: false }] });
    const q = quote([delivery(), disc], cart([line('l1', 160000)]), ENGINE);
    expect(q.itemsMinor).toBe(128000);
    expect(q.delivery.free).toBe(false);
    expect(q.delivery.remainingMinor).toBe(22000);
  });
});

describe('PR 211 · exchange', () => {
  const ex = rule({
    kind: 'exchange',
    params: [{ key: 'windowHours', type: 'hours', value: 72, labelEn: 'w' }, { key: 'perItem', type: 'int', value: 1, labelEn: 'p' }, money('charge', 8000)],
    scope: { include: [{ type: 'all' }], exclude: [{ type: 'category', id: CAT_TEE }] },
    actions: [{ type: 'exchangePolicy', windowParam: 'windowHours', perItemParam: 'perItem', chargeByBand: { '*': 'charge' }, reasons: ['size', 'defect'], freeWhenOurMistake: true }],
  });
  it('terms for a product and band, the window, and what is not covered', () => {
    const t = exchangeTerms([ex], { productId: PROD_A, categoryIds: [CAT_POLO], collectionIds: [] }, 'dhaka-city', NOW)!;
    expect(t).toMatchObject({ covered: true, windowHours: 72, perItem: 1, chargeMinor: 8000, reasons: ['size', 'defect'], freeWhenOurMistake: true });
    const delivered = new Date(NOW.getTime() - 71 * 3_600_000);
    expect(exchangeOpen(t, delivered, NOW)).toBe(true);
    expect(exchangeOpen(t, new Date(NOW.getTime() - 73 * 3_600_000), NOW)).toBe(false);
    const tee = exchangeTerms([ex], { productId: PROD_B, categoryIds: [CAT_TEE], collectionIds: [] }, 'dhaka-city', NOW)!;
    expect(tee.covered).toBe(false);
    expect(exchangeOpen(tee, delivered, NOW)).toBe(false);
    expect(exchangeTerms([], { productId: PROD_A, categoryIds: [], collectionIds: [] }, null, NOW)).toBeNull();
  });
  it('an exchange rule with a charge moves money; one without does not', () => {
    expect(needsOwnerOk(ex)).toBe(true);
    expect(needsOwnerOk({ actions: [{ type: 'exchangePolicy', windowParam: 'w', reasons: ['size'], freeWhenOurMistake: true }] })).toBe(false);
  });
});

describe('PR 212 · set tiers', () => {
  const tiers = rule({
    kind: 'setTier',
    params: [money('tier2', 150000), money('tier3', 210000)],
    scope: { include: [{ type: 'category', id: CAT_POLO }], exclude: [] },
    actions: [{ type: 'setTier', tiers: [{ quantity: 2, param: 'tier2' }, { quantity: 3, param: 'tier3' }] }],
  });
  it('any 2 for X, any 3 for Y, grouped so the customer pays the least', () => {
    expect(quote([tiers], cart([line('a', 90000, 2)]), ENGINE).itemsMinor).toBe(150000);
    expect(quote([tiers], cart([line('a', 90000, 3)]), ENGINE).itemsMinor).toBe(210000);
    // 4 pieces: a set of 3 plus one single, the cheapest piece stays single.
    const q = quote([tiers], cart([line('a', 90000, 3), line('b', 70000, 1)]), ENGINE);
    expect(q.itemsMinor).toBe(210000 + 70000);
    // A tier that costs more than the pieces is never applied.
    expect(quote([tiers], cart([line('a', 50000, 2)]), ENGINE).itemsMinor).toBe(100000);
  });
  it('only lines in scope; combo lines keep their combo price', () => {
    expect(quote([tiers], cart([line('a', 90000), line('t', 90000, 1, { categoryIds: [CAT_TEE] })]), ENGINE).discountMinor).toBe(0);
    expect(quote([tiers], cart([line('a', 90000, 2, { comboId: 'combo' })]), ENGINE).discountMinor).toBe(0);
  });
  it('the grouping itself', () => {
    const g = bestTierGrouping([100, 100, 100, 40], [{ quantity: 3, priceMinor: 210 }]);
    expect(g.groups).toBe(1);
    expect(g.paid.reduce((s, x) => s + x, 0)).toBe(250);
  });
  it('a set tier and a discount do not stack on a line', () => {
    const disc = rule({ kind: 'discount', priority: -1, params: [{ key: 'pct', type: 'percent', value: 10, labelEn: 'p' }], actions: [{ type: 'discount', mode: 'percent', param: 'pct', target: 'lines', requiresCoupon: false, showWas: false }], stackable: true });
    const q = quote([tiers, disc], cart([line('a', 90000, 2)]), ENGINE);
    expect(q.itemsMinor).toBe(150000);
    expect(q.applied.map((a) => a.effect)).toEqual(['setTier']);
  });
});

describe('PR 213 · discounts, coupons and the "was" price', () => {
  const pct = (value: number, over: Partial<RuleContent> = {}) =>
    rule({ kind: 'discount', params: [{ key: 'pct', type: 'percent', value, labelEn: 'p' }], actions: [{ type: 'discount', mode: 'percent', param: 'pct', target: 'lines', requiresCoupon: false, showWas: true }], ...over });
  it('percent on lines rounds down; amount on the order is spread; a cap holds', () => {
    expect(quote([pct(15)], cart([line('a', 33333)]), ENGINE).discountMinor).toBe(4999);
    const amt = rule({ kind: 'discount', params: [money('off', 30000), money('max', 20000)], actions: [{ type: 'discount', mode: 'amount', param: 'off', target: 'order', maxParam: 'max', requiresCoupon: false, showWas: false }] });
    const q = quote([amt], cart([line('a', 100000), line('b', 50000)]), ENGINE);
    expect(q.discountMinor).toBe(20000);
    expect(q.lines.map((l) => l.discountMinor).reduce((s, x) => s + x, 0)).toBe(20000);
  });
  it('review R1 (M5): with a rounding step every percentage cut — and so the total — is whole taka, in the customer’s favour', () => {
    // 10% of ৳1,499 is ৳149.90: rounded up to ৳150 off, so the total is ৳1,349 — a figure a rider can collect
    const q = quote([pct(10)], cart([line('a', 149_900)]), { ...ENGINE, roundingStepMinor: 100 });
    expect(q.discountMinor).toBe(15_000);
    expect(q.subtotalMinor - q.discountMinor).toBe(134_900);
    for (const price of [149_900, 99_950, 33_333, 120_001]) {
      for (const p of [5, 10, 12.5, 15, 33]) {
        const x = quote([pct(p)], cart([line('a', price), line('b', 77_700)]), { ...ENGINE, roundingStepMinor: 100 });
        expect(x.discountMinor % 100).toBe(0);
        expect(x.discountMinor).toBeLessThanOrEqual(x.subtotalMinor);
      }
    }
    // the order-wide form too, and step 1 keeps the old rounding down
    const order = rule({ kind: 'discount', params: [{ key: 'pct', type: 'percent', value: 10, labelEn: 'p' }], actions: [{ type: 'discount', mode: 'percent', param: 'pct', target: 'order', requiresCoupon: false, showWas: false }] });
    expect(quote([order], cart([line('a', 149_900), line('b', 77_750)]), { ...ENGINE, roundingStepMinor: 100 }).discountMinor % 100).toBe(0);
    expect(quote([pct(10)], cart([line('a', 149_900)]), { ...ENGINE, roundingStepMinor: 1 }).discountMinor).toBe(14_990);
    expect(percentCut(149_900, 10, 500)).toBe(15_000);
    expect(percentCut(50, 50, 100)).toBe(50);
  });
  it('a percentage above the store limit is clamped by the engine and refused by the check', () => {
    expect(quote([pct(95)], cart([line('a', 10000)]), ENGINE).discountMinor).toBe(9000);
    const issues = checkRule(pct(95), LIMITS, CTX, true);
    expect(issues.some((i) => i.code === 'PERCENT_TOO_HIGH' && i.blocking)).toBe(true);
  });
  it('a coupon rule waits for its coupon and its smallest order', () => {
    const coupon = rule({ kind: 'discount', params: [money('off', 10000), money('min', 200000)], actions: [{ type: 'discount', mode: 'amount', param: 'off', target: 'order', minSubtotalParam: 'min', requiresCoupon: true, showWas: false }] });
    const lines = [line('a', 250000)];
    expect(quote([coupon], cart(lines), ENGINE).waiting).toEqual([{ rule: expect.objectContaining({ id: coupon.id }), why: 'COUPON' }]);
    expect(quote([coupon], cart(lines, { couponRuleIds: [coupon.id] }), ENGINE).discountMinor).toBe(10000);
    expect(quote([coupon], cart([line('a', 150000)], { couponRuleIds: [coupon.id] }), ENGINE).waiting[0]!.why).toBe('MIN_SUBTOTAL');
  });
  it('two offers on a line: only the winner, unless both may combine', () => {
    const a = pct(10, { priority: 2 });
    const b = pct(20, { priority: 1 });
    expect(quote([a, b], cart([line('x', 10000)]), ENGINE).discountMinor).toBe(1000);
    const a2 = pct(10, { priority: 2, stackable: true });
    const b2 = pct(20, { priority: 1, stackable: true });
    expect(quote([a2, b2], cart([line('x', 10000)]), ENGINE).discountMinor).toBe(1000 + 1800);
  });
  it('the struck price is shown only when it is real: the MRP where it exists, else the real earlier price (CN-009)', () => {
    const base = { allowed: true, showWas: true, startsAt: '2026-10-15T00:00:00Z', endsAt: '2026-10-31T00:00:00Z', live: true, discountedMinor: 80000, mrpMinor: null, lookbackDays: 30, now: NOW };
    const h = (days: number, price: number) => ({ priceMinor: price, effectiveFrom: new Date(Date.parse('2026-10-15T00:00:00Z') - days * 86_400_000) });
    // The MRP wins where it exists, even with no end date and no history; never a higher history price instead.
    expect(discountWasPrice({ ...base, mrpMinor: 125000, endsAt: null, history: [] })).toEqual({ wasMinor: 125000, reason: 'SHOWN', source: 'MRP' });
    expect(discountWasPrice({ ...base, mrpMinor: 70000, history: [h(60, 100000)] })).toEqual({ wasMinor: null, reason: 'NOT_HIGHER', source: null });
    expect(discountWasPrice({ ...base, history: [h(60, 100000)] })).toEqual({ wasMinor: 100000, reason: 'SHOWN', source: 'PRICE_HISTORY' });
    // Raised a week before the sale: the lowest price in the 30 days before counts.
    expect(discountWasPrice({ ...base, history: [h(60, 90000), h(7, 120000)] })).toEqual({ wasMinor: 90000, reason: 'SHOWN', source: 'PRICE_HISTORY' });
    expect(discountWasPrice({ ...base, history: [h(60, 80000)] }).reason).toBe('NOT_HIGHER');
    expect(discountWasPrice({ ...base, allowed: null, mrpMinor: 125000, history: [h(60, 100000)] }).reason).toBe('NOT_CHOSEN');
    expect(discountWasPrice({ ...base, showWas: false, mrpMinor: 125000, history: [] }).reason).toBe('OFF');
    expect(discountWasPrice({ ...base, endsAt: null, history: [h(60, 100000)] }).reason).toBe('NO_END_DATE');
    expect(discountWasPrice({ ...base, history: [] }).reason).toBe('NO_HISTORY');
    expect(discountWasPrice({ ...base, live: false, mrpMinor: 125000, history: [h(60, 100000)] }).reason).toBe('NOT_LIVE');
  });
  it('a set shows the sum of its pieces\' separate prices, never a made-up one (CN-009)', () => {
    expect(setWasPrice({ allowed: true, live: true, separateMinor: 240000, setMinor: 210000 })).toEqual({ wasMinor: 240000, reason: 'SHOWN', source: 'COMBO' });
    expect(setWasPrice({ allowed: true, live: true, separateMinor: 200000, setMinor: 210000 }).reason).toBe('NOT_HIGHER');
    expect(setWasPrice({ allowed: null, live: true, separateMinor: 240000, setMinor: 210000 }).reason).toBe('NOT_CHOSEN');
    expect(setWasPrice({ allowed: true, live: true, separateMinor: null, setMinor: 210000 }).reason).toBe('NO_PRICE');
    // The engine records the pieces in the sets at their separate prices.
    const tier = bestTierGrouping([120000, 120000, 50000], [{ quantity: 2, priceMinor: 210000 }]);
    expect(tier.inGroup).toEqual([true, true, false]);
  });
});

describe('PR 214 · festive cut-offs and COD', () => {
  it('the cut-off for the band, and whether it has passed', () => {
    const f = rule({ kind: 'festive', params: [{ key: 'city', type: 'datetime', value: '2026-10-20T13:00:00+06:00', labelEn: 'c' }, { key: 'out', type: 'datetime', value: '2026-10-19T12:00:00+06:00', labelEn: 'o' }], actions: [{ type: 'cutoff', byBand: { 'dhaka-city': 'city', 'outside-dhaka': 'out' } }] });
    expect(quote([f], cart([line('a', 1000)]), ENGINE).cutoffs).toEqual([expect.objectContaining({ bandKey: 'dhaka-city', passed: false })]);
    expect(quote([f], cart([line('a', 1000)], { bandKey: 'outside-dhaka' }), ENGINE).cutoffs).toEqual([expect.objectContaining({ bandKey: 'outside-dhaka', passed: true })]);
  });
  it('COD: on, off over the largest COD order, not set', () => {
    const cod = (allowed: boolean | null, max: number | null) => rule({ kind: 'payment', params: [{ key: 'on', type: 'bool', value: allowed, labelEn: 'on' }, money('max', max)], actions: [{ type: 'cod', allowedParam: 'on', maxOrderParam: 'max' }] });
    expect(quote([cod(true, 500000)], cart([line('a', 1000)]), ENGINE).cod).toMatchObject({ allowed: true, reason: 'RULE' });
    expect(quote([cod(true, 500)], cart([line('a', 1000)]), ENGINE).cod).toMatchObject({ allowed: false, reason: 'OVER_MAX' });
    expect(quote([cod(null, null)], cart([line('a', 1000)]), ENGINE).cod).toMatchObject({ allowed: null, reason: 'NOT_SET' });
    expect(quote([], cart([line('a', 1000)]), ENGINE).cod.reason).toBe('NO_RULE');
  });
});

describe('PR 215 · rule text from the rule', () => {
  const ex = rule({
    kind: 'exchange',
    key: 'exchange',
    params: [{ key: 'windowHours', type: 'hours', value: 72, labelEn: 'w' }, money('charge', 8000)],
    text: { short: { en: 'Size exchange within {windowHours} hours · {charge}', bn: 'ডেলিভারির {windowHours} ঘণ্টার মধ্যে সাইজ বদল' } },
    actions: [{ type: 'exchangePolicy', windowParam: 'windowHours', chargeByBand: { '*': 'charge' }, reasons: ['size'], freeWhenOurMistake: true }],
    placements: ['product'],
  });
  it('fills tokens in the customer language, with the store currency and digits', () => {
    expect(ruleText(ex, 'short', CTX)!.text).toBe('Size exchange within 72 hours · ৳80');
    const bn = ruleText(ex, 'short', BN)!;
    expect(bn.lang).toBe('bn');
    expect(bn.text).toBe('ডেলিভারির ৭২ ঘণ্টার মধ্যে সাইজ বদল');
  });
  it('quotes another rule by key, and its window as {endsAt}', () => {
    const sale = rule({ kind: 'discount', key: 'sale', endsAt: '2026-10-31T18:00:00Z', text: { short: { en: 'Until {endsAt} · exchange in {exchange.windowHours} hours' } } });
    const r = ruleText(sale, 'short', CTX, { others: new Map([['exchange', ex]]) })!;
    expect(r.ok).toBe(true);
    expect(r.text).toContain('72 hours');
    expect(r.text).toContain('Nov');
    const open = rule({ kind: 'discount', text: { short: { en: 'Until {endsAt}' } } });
    expect(ruleText(open, 'short', CTX)).toMatchObject({ ok: false, missing: ['{endsAt}'] });
  });
  it('a missing value is never shown; an unknown token is named', () => {
    const r = rule({ kind: 'delivery', params: [money('city', null)], text: { short: { en: 'Inside Dhaka {city} {nope}' } } });
    const t = ruleText(r, 'short', CTX)!;
    expect(t).toMatchObject({ ok: false, missing: ['{city}'], unknown: ['{nope}'] });
    const issues = checkRule(r, LIMITS, CTX, true);
    expect(issues.find((i) => i.code === 'MISSING_VALUE')!.blocking).toBe(true);
    expect(issues.find((i) => i.code === 'UNKNOWN_TOKEN')!.blocking).toBe(true);
    // As a draft a missing value is only a note.
    expect(checkRule(r, LIMITS, CTX, false).find((i) => i.code === 'MISSING_VALUE')!.blocking).toBe(false);
  });
  it('the short version must fit its line; a number written by hand is flagged', () => {
    const long = rule({ kind: 'policy', text: { short: { en: 'x'.repeat(91) } } });
    expect(checkRule(long, LIMITS, CTX, true).some((i) => i.code === 'TOO_LONG' && i.blocking)).toBe(true);
    const hand = rule({ kind: 'exchange', params: [{ key: 'windowHours', type: 'hours', value: 72, labelEn: 'w' }], text: { short: { en: 'Exchange within 72 hours' } } });
    expect(checkRule(hand, LIMITS, CTX, true).some((i) => i.code === 'HAND_WRITTEN_NUMBER' && !i.blocking)).toBe(true);
  });
  it('the kind decides the actions and slots; placements come from the dictionary', () => {
    const bad = rule({ kind: 'policy', actions: [{ type: 'freeDelivery' }], text: { short: { en: 'x' }, progress: { en: 'y' } }, placements: ['nowhere'] });
    const codes = checkRule(bad, LIMITS, CTX, false).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['ACTION_NOT_ALLOWED', 'SLOT_NOT_ALLOWED', 'UNKNOWN_PLACEMENT']));
  });
  it('literals and tokens are told apart', () => {
    expect(literalsIn('within 7 days or ৳1,500 or ১২০ টাকা or {x} hours', 'BDT').map((l) => [l.unit, l.value])).toEqual([
      ['hours', 168],
      ['money', 150000],
      ['money', 12000],
    ]);
    expect(tokensIn('{a} and {exchange.windowHours}').map((t) => [t.rule, t.key])).toEqual([
      [null, 'a'],
      ['exchange', 'windowHours'],
    ]);
  });
});

describe('PR 216 · notices and pop-ups', () => {
  const nl = { minDelaySeconds: 8, minScrollPercent: 30, placements: ['product', 'announcement'] };
  const base = { key: 'size-help', kind: 'popup' as const, nameEn: 'Size help', contentEn: 'Need help?', placement: { pages: ['product'] }, frequencyCap: { per: 'week' as const, times: 1 } };
  it('no pop-up on arrival; a trigger and a cap are needed', () => {
    const p = (over: object) => checkNotice(noticeInputSchema.parse({ ...base, ...over }), nl);
    expect(p({ timing: { trigger: 'time', delaySeconds: 0 } })).toContain('ARRIVAL_POPUP');
    expect(p({ timing: { trigger: 'time', delaySeconds: 3 } })).toContain('DELAY_TOO_SHORT');
    expect(p({ timing: { trigger: 'scroll', scrollPercent: 10 } })).toContain('SCROLL_TOO_SHORT');
    expect(p({ timing: { trigger: 'scroll', scrollPercent: 50 } })).toEqual([]);
    expect(p({ timing: { trigger: 'exit' }, frequencyCap: null })).toContain('NO_CAP');
    expect(p({ timing: null })).toContain('NO_TRIGGER');
    expect(checkNotice(noticeInputSchema.parse({ ...base, kind: 'bar', placement: { pages: ['announcement'] }, timing: { trigger: 'exit' } }), nl)).toContain('TIMING_NOT_FOR_KIND');
  });
  it('a button links only inside the shop', () => {
    expect(noticeInputSchema.safeParse({ ...base, cta: { labelEn: 'Go', href: 'https://elsewhere.example.com' } }).success).toBe(false);
    expect(noticeInputSchema.safeParse({ ...base, cta: { labelEn: 'Go', href: '//elsewhere.example.com' } }).success).toBe(false);
    expect(noticeInputSchema.safeParse({ ...base, cta: { labelEn: 'Go', href: '/size-guide' } }).success).toBe(true);
  });
  it('frequency caps, the visit cap and the phone-from-search first screen', () => {
    const seen = { shown: ['2026-10-18T06:00:00Z'], thisVisit: 0 };
    expect(capAllows({ per: 'week', times: 1 }, seen, NOW)).toBe(false);
    expect(capAllows({ per: 'day', times: 1 }, seen, NOW)).toBe(true);
    expect(capAllows({ per: 'ever', times: 2 }, seen, NOW)).toBe(true);
    const ctx = { now: NOW, isPhone: true, fromSearch: true, firstScreen: true, popupsThisVisit: 0, maxPerVisit: 1 };
    expect(popupVerdict(null, seen, ctx)).toBe('search-first-screen');
    expect(popupVerdict(null, seen, { ...ctx, firstScreen: false })).toBe('show');
    expect(popupVerdict(null, seen, { ...ctx, popupsThisVisit: 1 })).toBe('visit-cap');
    expect(isSearchReferrer('https://www.google.com/search?q=polo', ['google.'])).toBe(true);
    expect(isSearchReferrer('https://shop.example.com/', ['google.'])).toBe(false);
    expect(isSearchReferrer('not a url', ['google.'])).toBe(false);
  });
  it('the timed pop-up counts only visible time: every pause has its resume', () => {
    let t = startTimer(8000, 0, true);
    expect(timerRemaining(t, 3000)).toBe(5000);
    t = pauseTimer(t, 3000);
    expect(timerRemaining(t, 60_000)).toBe(Infinity);
    t = resumeTimer(t, 60_000);
    expect(timerRemaining(t, 62_000)).toBe(3000);
    expect(pauseTimer(pauseTimer(t, 63_000), 64_000).left).toBe(2000);
    expect(resumeTimer(resumeTimer(startTimer(1000, 0, false), 10), 20)).toEqual({ left: 1000, runningSince: 10 });
  });
});

describe('PR 217 · conflicts', () => {
  it('two delivery charges for the same band: the resolution order names the winner', () => {
    const a = delivery();
    const b = { ...delivery({ city: 9000 }), priority: 3 };
    const f = detectConflicts({ rules: [a, b], currency: 'BDT', now: NOW });
    const slot = f.filter((x) => x.kind === 'SAME_SLOT');
    expect(slot.map((x) => x.slot).sort()).toEqual(['deliveryCharge:dhaka-city', 'deliveryCharge:outside-dhaka', 'freeDeliveryOver']);
    expect(slot.every((x) => x.winner === b.id && x.decidedBy === 'priority')).toBe(true);
    // A draft clashes with nothing.
    expect(detectConflicts({ rules: [a, { ...b, status: 'DRAFT' }], currency: 'BDT', now: NOW })).toEqual([]);
    // Windows apart do not clash.
    const c = { ...b, startsAt: '2027-01-01T00:00:00Z' };
    const d = { ...a, endsAt: '2026-12-31T00:00:00Z' };
    expect(detectConflicts({ rules: [c, d], currency: 'BDT', now: NOW }).filter((x) => x.kind === 'SAME_SLOT')).toEqual([]);
  });
  it('two discounts that may not combine', () => {
    const disc = (p: number) => rule({ kind: 'discount', priority: p, params: [{ key: 'pct', type: 'percent', value: 10, labelEn: 'p' }], actions: [{ type: 'discount', mode: 'percent', param: 'pct', target: 'lines', requiresCoupon: false, showWas: false }] });
    expect(detectConflicts({ rules: [disc(1), disc(2)], currency: 'BDT', now: NOW }).map((x) => x.kind)).toEqual(['STACKING']);
  });
  it('a stale number written by hand, and "Fix everywhere"', () => {
    const ex = rule({ kind: 'exchange', key: 'exchange', params: [{ key: 'windowHours', type: 'hours', value: 72, labelEn: 'w' }], actions: [{ type: 'exchangePolicy', windowParam: 'windowHours', reasons: ['size'], freeWhenOurMistake: true }] });
    const notice = { id: 'n1', key: 'faq', ruleId: ex.id, texts: [{ at: 'content.en', text: 'Exchange within 7 days.' }, { at: 'content.bn', text: 'ডেলিভারির পর ৭ দিন পর্যন্ত বদল।' }] };
    const f = detectConflicts({ rules: [ex], notices: [notice], currency: 'BDT', now: NOW }).filter((x) => x.kind === 'TEXT_DRIFT');
    expect(f).toHaveLength(2);
    expect(f[0]!.detail).toMatchObject({ token: '{exchange.windowHours}', ruleValue: 72, literalValue: 168 });
    expect(fixDrift('Exchange within 7 days.', f[0]!)).toBe('Exchange within {exchange.windowHours} hours.');
    expect(fixDrift('ডেলিভারির পর ৭ দিন পর্যন্ত বদল।', f[1]!)).toBe('ডেলিভারির পর {exchange.windowHours} ঘণ্টা পর্যন্ত বদল।');
    // The same number as the rule is no drift; a text with the token never drifts.
    expect(detectConflicts({ rules: [ex], notices: [{ ...notice, texts: [{ at: 'content.en', text: 'Within 72 hours or {exchange.windowHours} hours' }] }], currency: 'BDT', now: NOW })).toEqual([]);
  });
  it('a setting that says something else than the live rule', () => {
    const ex = rule({ kind: 'exchange', params: [{ key: 'windowHours', type: 'hours', value: 48, labelEn: 'w' }], actions: [{ type: 'exchangePolicy', windowParam: 'windowHours', reasons: ['size'], freeWhenOurMistake: true }] });
    const f = detectConflicts({ rules: [ex], settings: [{ key: 'policy.exchange.windowHours', value: 72 }], currency: 'BDT', now: NOW });
    expect(f).toEqual([expect.objectContaining({ kind: 'SETTING_DRIFT', detail: expect.objectContaining({ settingValue: 72, ruleValue: 48 }) })]);
  });
});

describe('PR 218 · history and the owner OK', () => {
  const d = delivery();
  const content = (r: Rule): RuleContent => {
    const { id: _i, version: _v, archived: _a, ...c } = r;
    return c;
  };
  it('a field-by-field diff; words are not money, values and status are', () => {
    const a = content(d);
    const words = { ...a, text: { ...a.text, short: { en: 'New words' } }, placements: ['faq'] };
    expect(moneyChanges(diffContent(a, words))).toEqual([]);
    const value = { ...a, params: a.params.map((p) => (p.key === 'city' ? { ...p, value: 9000 } : p)) };
    expect(diffContent(a, value)).toEqual([expect.objectContaining({ field: 'param', path: 'params.city', before: 8000, after: 9000, paramType: 'money' })]);
    expect(moneyChanges(diffContent(a, value))).toHaveLength(1);
    expect(moneyChanges(diffContent(a, { ...a, status: 'PAUSED' }))).toHaveLength(1);
  });
  it("the owner's OK: switching a money rule on, changing its money while live, pausing it", () => {
    const a = content(d);
    expect(ownerOkNeeded(null, { ...a, status: 'DRAFT' }).needed).toBe(false);
    expect(ownerOkNeeded(null, a).needed).toBe(true);
    expect(ownerOkNeeded({ ...a, status: 'DRAFT' }, a).needed).toBe(true);
    expect(ownerOkNeeded(a, { ...a, text: { short: { en: 'Words' } } }).needed).toBe(false);
    expect(ownerOkNeeded(a, { ...a, params: a.params.map((p) => ({ ...p, value: 1 })) }).needed).toBe(true);
    expect(ownerOkNeeded(a, { ...a, status: 'PAUSED' }).needed).toBe(true);
    // A paused money rule can be changed and kept paused without the OK.
    expect(ownerOkNeeded({ ...a, status: 'PAUSED' }, { ...a, status: 'PAUSED', priority: 4 }).needed).toBe(false);
    const policy = rule({ kind: 'policy' });
    expect(ownerOkNeeded(null, content(policy)).needed).toBe(false);
  });
});

describe('PR 209 · templates', () => {
  it('every template is valid, every value starts empty, and the starters are words plus empty values', async () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    for (const t of TEMPLATES) {
      const c = await contentFromTemplate(t, { value: async () => null });
      expect(ruleContentSchema.safeParse(c).success).toBe(true);
      expect(c.status).toBe('DRAFT');
      expect(c.params.every((p) => p.value === null)).toBe(true);
      // Nothing blocks but the empty values …
      expect(checkRule(c, LIMITS, CTX, true).filter((i) => i.blocking).every((i) => i.code === 'MISSING_VALUE')).toBe(true);
      // … and once typical values are typed in, it can go live (the short version fits its line in both languages).
      const typed: Record<string, unknown> = { money: 150000, hours: 72, int: 2, percent: 20, bool: true, datetime: '2026-12-20T18:00:00+06:00', text: { en: 'x' } };
      const filled = { ...c, params: c.params.map((p) => ({ ...p, value: typed[p.type] })), endsAt: '2026-12-31T18:00:00+06:00' };
      expect(checkRule(filled, LIMITS, CTX, true).filter((i) => i.blocking)).toEqual([]);
      expect(checkRule(filled, LIMITS, BN, true).filter((i) => i.blocking)).toEqual([]);
    }
  });
  it('fromSetting copies a valid setting value, and ignores a wrong one', async () => {
    const t = templateById('exchange')!;
    const c = await contentFromTemplate(t, { value: async (k) => (k === 'policy.exchange.windowHours' ? 72 : 'not a number') });
    expect(c.params.find((p) => p.key === 'windowHours')!.value).toBe(72);
    expect(c.params.find((p) => p.key === 'perItem')!.value).toBeNull();
    const only = await contentFromTemplate(t, { value: async () => null }, { placements: ['faq'] });
    expect(only.placements).toEqual(['faq']);
  });
});

describe('PR 609 · the selling-price floor holds every offer (catalogue.floor.minMarginPercent)', () => {
  const pct = (value: number, over: Partial<RuleContent> = {}) =>
    rule({ kind: 'discount', params: [{ key: 'pct', type: 'percent', value, labelEn: 'p' }], actions: [{ type: 'discount', mode: 'percent', param: 'pct', target: 'lines', requiresCoupon: false, showWas: false }], ...over });
  it('the floor is the buying price plus the margin, rounded up; off without either', () => {
    expect(floorMinorOf(76000, 20)).toBe(91200);
    expect(floorMinorOf(33333, 10)).toBe(36667);
    expect(floorMinorOf(76000, null)).toBeNull();
    expect(floorMinorOf(null, 20)).toBeNull();
  });
  it('a discount stops at the floor; what it held back is told; no floor, no change', () => {
    const free = quote([pct(15)], cart([line('a', 100000)]), ENGINE);
    expect([free.discountMinor, free.floorHeld]).toEqual([15000, []]);
    const held = quote([pct(15)], cart([line('a', 100000, 1, { floorMinor: 91200 })]), ENGINE);
    expect(held.discountMinor).toBe(8800);
    expect(held.lines[0]!.finalMinor).toBe(91200);
    expect(held.floorHeld).toEqual([{ rule: expect.objectContaining({ key: held.applied[0]!.rule.key }), heldMinor: 6200 }]);
    // Already at or under the floor: the offer gives nothing and is not counted as applied.
    const none = quote([pct(15)], cart([line('a', 90000, 2, { floorMinor: 95000 })]), ENGINE);
    expect([none.discountMinor, none.applied.length, none.floorHeld[0]!.heldMinor]).toEqual([0, 0, 27000]);
  });
  it('a coupon on the order is held per line by its floor', () => {
    const coupon = rule({ kind: 'discount', params: [money('off', 30000)], actions: [{ type: 'discount', mode: 'amount', param: 'off', target: 'order', requiresCoupon: true, showWas: false }] });
    const q = quote([coupon], cart([line('a', 100000, 1, { floorMinor: 95000 }), line('b', 50000)], { couponRuleIds: [coupon.id] }), ENGINE);
    // 30000 spread 2:1 is 20000 on a and 10000 on b; a may give only 5000.
    expect(q.lines.map((l) => l.discountMinor)).toEqual([5000, 10000]);
    expect([q.discountMinor, q.floorHeld[0]!.heldMinor]).toEqual([15000, 15000]);
  });
  it('a set tier is held too, and its set price says what the set really costs', () => {
    const tiers = rule({
      kind: 'setTier',
      params: [money('tier2', 150000)],
      scope: { include: [{ type: 'category', id: CAT_POLO }], exclude: [] },
      actions: [{ type: 'setTier', tiers: [{ quantity: 2, param: 'tier2' }] }],
    });
    const q = quote([tiers], cart([line('a', 90000, 2, { floorMinor: 80000 })]), ENGINE);
    expect(q.itemsMinor).toBe(160000);
    expect(q.applied[0]).toMatchObject({ effect: 'setTier', amountMinor: 20000, separateMinor: 180000, setMinor: 160000 });
    expect(q.floorHeld[0]!.heldMinor).toBe(10000);
  });
});
