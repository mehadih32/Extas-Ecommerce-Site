// S04 on a real PostgreSQL (a throwaway database with the real migrations, the sample catalogue, the sample Smart Rules
// and the sample combos; skipped without TEST_DATABASE_ADMIN_URL). Every value is a made-up test value.
// Covers PR 105 (the bag, its lines, the repeat guard, the duplicate rule, stock, archive and Undo, save for later),
// PR 108 (set lines), PR 110 (SIM-F-036), PR 111 (the summary adds up from the engines), PR 112 (SIM-F-009: a public
// code works for a guest, a members-only code says so; the better-offer reason) and PR 113 (free-delivery progress).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { addSetToBag, productFacts, setSummary, type ProductFact } from '@extas/combos';
import { seedSampleCombos } from '@extas/combos/sample';
import { bustAll, createCoupon, createRule, getRule, publishRule, saveDraft, setCouponEnabled, type RuleContent } from '@extas/rules';
import { seedSampleRules } from '@extas/rules/sample';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { addItem, bagCount, changeVariant, findBag, openBag, removeLine, restoreLine, saveForLater, setBagCode, setQuantity, setSizeAnswer } from './cart';
import type { CartDeps, SettingsReader } from './context';
import { sizeFlags } from './pure';
import { bagView } from './view';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const T0 = new Date('2026-10-23T06:00:00Z');
const visitor = (n: string) => `test-visitor-${n}-0000000000`;

describe.skipIf(!HAS_TEST_DB)('the bag on PostgreSQL (S04)', () => {
  let t: TestDatabase;
  let S = 0;
  let clock = T0;
  const overrides = new Map<string, unknown>([['rules.public.cacheSeconds', 0]]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CartDeps => ({ db: t.prisma, settings, now: () => clock });
  const later = (ms: number) => (clock = new Date(clock.getTime() + ms));
  let owner: Actor;
  const who = () => ({ actor: owner, storeId: S });
  const products: Record<string, ProductFact> = {};
  /** A variant of a sample product by colour key and size label. */
  const variant = (slug: string, colour: string | null, size: string) => {
    const p = products[slug]!;
    const c = colour ? p.colours.find((x) => x.key === colour)!.id : null;
    const s = p.sizes.find((x) => x.label === size)!.id;
    return p.variants.find((v) => v.colourId === c && v.sizeId === s)!;
  };
  /** The sample polo + chino set with each piece on its first open colour and size. */
  const addSampleSet = async (cartId: string) => {
    const cd = { db: t.prisma, settings, now: () => clock };
    const sum = await setSummary(cd, { storeId: S, slug: 'sample-polo-chino-set' });
    const choices = sum.pieces.map((p) => ({ colourId: p.defaultColourId, sizeId: p.openSizes[p.defaultColourId!]![0]! }));
    return addSetToBag(cd, { storeId: S, cartId, slug: 'sample-polo-chino-set', choices });
  };
  const withValues = (c: RuleContent, values: Record<string, unknown>, over: Partial<RuleContent> = {}): RuleContent => ({ ...c, params: c.params.map((p) => (p.key in values ? { ...p, value: values[p.key] } : p)), ...over });
  /** Switches a sample rule on (the owner's OK, as in the admin). */
  const switchOn = async (key: string) => {
    const row = await t.prisma.smartRule.findFirstOrThrow({ where: { storeId: S, key }, select: { id: true } });
    const r = await getRule({ db: t.prisma, settings, now: () => clock }, who(), row.id);
    await saveDraft({ db: t.prisma, settings, now: () => clock }, who(), r.id, { content: { ...(r.draft ?? r.live)!, status: 'ACTIVE' } });
    await publishRule({ db: t.prisma, settings, now: () => clock }, who(), r.id);
    bustAll();
  };

  beforeAll(async () => {
    t = await createTestDatabase('cart');
    S = (await seedSample(t.prisma)).storeId;
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 'test-owner', nameEn: 'owner', nameBn: 'owner', permissions: ['rules.read', 'rules.write', 'rules.publish', 'rules.approve', 'combos.read', 'combos.write', 'combos.publish', 'combos.prices'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'owner@example.com', displayName: 'owner', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    owner = { staffUserId: u.id };
    await seedSampleRules({ db: t.prisma, settings, now: () => clock });
    await seedSampleCombos({ db: t.prisma, settings, now: () => clock });
    const ids = (await t.prisma.product.findMany({ where: { storeId: S }, select: { id: true } })).map((p) => p.id);
    for (const p of (await productFacts({ db: t.prisma, settings }, S, ids)).values()) products[p.slug] = p;
  });

  afterAll(async () => {
    await t?.drop();
  });

  describe('PR 105 · the bag and its lines', () => {
    it('one open bag per visitor, kept for `bag.keepDays`; two first adds at once make one bag', async () => {
      const [a, b] = await Promise.all([openBag(deps(), { storeId: S, visitorId: visitor('a') }), openBag(deps(), { storeId: S, visitorId: visitor('a') })]);
      expect(a.cartId).toBe(b.cartId);
      expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
      expect(await findBag(deps(), { storeId: S, visitorId: visitor('a') })).toBe(a.cartId);
      expect(await findBag(deps(), { storeId: S, visitorId: 'bad id' })).toBeNull();
      expect(await code(openBag(deps(), { storeId: S, visitorId: 'x' }))).toBe('INVALID_INPUT');
      later(31 * 86_400_000);
      expect(await findBag(deps(), { storeId: S, visitorId: visitor('a') })).toBeNull();
      expect((await openBag(deps(), { storeId: S, visitorId: visitor('a') })).cartId).not.toBe(a.cartId);
      clock = T0;
    });

    it('add: a double tap is one add; the same item again is refused by default, or adds one with "qty"', async () => {
      const { cartId } = await openBag(deps(), { storeId: S, visitorId: visitor('b') });
      const v = variant('oxford-cotton-shirt', 'sky', 'M');
      const first = await addItem(deps(), { storeId: S, cartId, variantId: v.id });
      expect(first).toMatchObject({ added: true, quantity: 1 });
      expect(await addItem(deps(), { storeId: S, cartId, variantId: v.id })).toMatchObject({ added: false, reason: 'REPEAT', lineId: first.lineId });
      later(1500);
      expect(await addItem(deps(), { storeId: S, cartId, variantId: v.id })).toMatchObject({ added: false, reason: 'ALREADY' });
      overrides.set('bag.duplicateAdd', 'qty');
      expect(await addItem(deps(), { storeId: S, cartId, variantId: v.id })).toMatchObject({ added: true, lineId: first.lineId, quantity: 2 });
      overrides.delete('bag.duplicateAdd');
      expect(await bagCount(t.prisma, S, cartId)).toBe(2);
      // The line keeps the price it was added at; the item is the store's own.
      expect((await t.prisma.cartItem.findUniqueOrThrow({ where: { id: first.lineId } })).unitPriceMinor).toBe(v.priceMinor);
    });

    it('stock and limits: never more than can be sold now, never more than the per-line limit', async () => {
      const { cartId } = await openBag(deps(), { storeId: S, visitorId: visitor('c') });
      const v = variant('essential-pique-polo', 'navy', 'M');
      const add = await addItem(deps(), { storeId: S, cartId, variantId: v.id });
      expect(await code(setQuantity(deps(), { storeId: S, cartId, lineId: add.lineId, quantity: v.sellable + 1 }))).toMatch(/OUT_OF_STOCK|TOO_MANY/);
      overrides.set('inventory.reservation.maxUnitsPerLine', 2);
      expect(await code(setQuantity(deps(), { storeId: S, cartId, lineId: add.lineId, quantity: 3 }))).toBe('TOO_MANY');
      overrides.delete('inventory.reservation.maxUnitsPerLine');
      expect(await setQuantity(deps(), { storeId: S, cartId, lineId: add.lineId, quantity: 2 })).toMatchObject({ quantity: 2 });
      const polo = await t.prisma.productVariant.findUniqueOrThrow({ where: { id: v.id }, select: { productId: true } });
      await t.prisma.product.update({ where: { id: polo.productId }, data: { status: 'DRAFT' } });
      expect(await code(addItem(deps(), { storeId: S, cartId, variantId: variant('essential-pique-polo', 'navy', 'L').id }))).toBe('NOT_FOR_SALE');
      // A line whose product went off sale is marked, so it cannot go to checkout.
      expect((await bagView(deps(), { storeId: S, cartId, lang: 'en' })).blocked).toEqual([{ lineId: add.lineId, reason: 'NOT_FOR_SALE', free: 0 }]);
      await t.prisma.product.update({ where: { id: polo.productId }, data: { status: 'PUBLISHED' } });
    });

    it('change size in the bag; a change onto an item already there joins the two lines', async () => {
      const { cartId } = await openBag(deps(), { storeId: S, visitorId: visitor('d') });
      const m = await addItem(deps(), { storeId: S, cartId, variantId: variant('oxford-cotton-shirt', 'sky', 'M').id });
      const l = await addItem(deps(), { storeId: S, cartId, variantId: variant('oxford-cotton-shirt', 'sky', 'L').id });
      expect(await code(changeVariant(deps(), { storeId: S, cartId, lineId: m.lineId, variantId: variant('essential-pique-polo', 'navy', 'M').id }))).toBe('INVALID_INPUT');
      expect(await changeVariant(deps(), { storeId: S, cartId, lineId: m.lineId, variantId: variant('oxford-cotton-shirt', 'sky', 'L').id })).toEqual({ lineId: l.lineId, quantity: 2, joined: true });
      // The joined-away line is archived, never deleted.
      expect(await t.prisma.cartItem.findUniqueOrThrow({ where: { id: m.lineId } })).toMatchObject({ removedAt: expect.any(Date) });
    });

    it('remove is archived and Undo brings the same line back; save for later and back', async () => {
      const { cartId } = await openBag(deps(), { storeId: S, visitorId: visitor('e') });
      const a = await addItem(deps(), { storeId: S, cartId, variantId: variant('oxford-cotton-shirt', 'white', 'M').id });
      expect(await removeLine(deps(), { storeId: S, cartId, lineId: a.lineId })).toEqual({ lineIds: [a.lineId] });
      expect(await bagCount(t.prisma, S, cartId)).toBe(0);
      expect(await t.prisma.cartItem.count({ where: { id: a.lineId } })).toBe(1);
      expect(await code(removeLine(deps(), { storeId: S, cartId, lineId: a.lineId }))).toBe('NOT_FOUND');
      expect(await restoreLine(deps(), { storeId: S, cartId, lineId: a.lineId })).toEqual({ lineIds: [a.lineId] });
      expect(await bagCount(t.prisma, S, cartId)).toBe(1);
      await saveForLater(deps(), { storeId: S, cartId, lineId: a.lineId, saved: true });
      const v = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      expect(v.items).toEqual([]);
      expect(v.saved.items.map((i) => i.lineId)).toEqual([a.lineId]);
      await saveForLater(deps(), { storeId: S, cartId, lineId: a.lineId, saved: false });
      expect((await bagView(deps(), { storeId: S, cartId, lang: 'en' })).items.map((i) => i.lineId)).toEqual([a.lineId]);
      // Another visitor's line or bag is never touched.
      const other = await openBag(deps(), { storeId: S, visitorId: visitor('e2') });
      expect(await code(removeLine(deps(), { storeId: S, cartId: other.cartId, lineId: a.lineId }))).toBe('NOT_FOUND');
    });
  });

  describe('PR 108 · set lines', () => {
    it('a set shows as one line with its pieces; it is taken out, put back and saved whole', async () => {
      const { cartId } = await openBag(deps(), { storeId: S, visitorId: visitor('f') });
      const set = await addSampleSet(cartId);
      const v = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      expect(v.sets).toHaveLength(1);
      expect(v.sets[0]).toMatchObject({ slug: 'sample-polo-chino-set', payMinor: set.setPriceMinor });
      expect(v.sets[0]!.pieces.map((p) => p.slug)).toEqual(['essential-pique-polo', 'slim-chino-trousers']);
      expect(v.summary.rows).toEqual([expect.objectContaining({ kind: 'set', amountMinor: set.setPriceMinor })]);
      expect(v.summary.totalMinor).toBe(set.setPriceMinor);
      const pieceLine = set.lines[1]!.id;
      expect((await removeLine(deps(), { storeId: S, cartId, lineId: pieceLine })).lineIds.sort()).toEqual(set.lines.map((l) => l.id).sort());
      expect((await bagView(deps(), { storeId: S, cartId, lang: 'en' })).sets).toEqual([]);
      expect((await restoreLine(deps(), { storeId: S, cartId, lineId: pieceLine })).lineIds).toHaveLength(2);
      await saveForLater(deps(), { storeId: S, cartId, lineId: pieceLine, saved: true });
      const saved = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      expect(saved.sets).toEqual([]);
      expect(saved.saved.sets).toHaveLength(1);
    });
  });

  describe('PR 110 · two sizes, SIM-F-036', () => {
    it('a family buying S, M and L gets one card; "for different people" means no order flag', async () => {
      const { cartId } = await openBag(deps(), { storeId: S, visitorId: visitor('g') });
      for (const size of ['S', 'M', 'L']) await addItem(deps(), { storeId: S, cartId, variantId: variant('oxford-cotton-shirt', 'sky', size).id });
      const v = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      expect(v.groups).toHaveLength(1);
      expect(v.groups[0]!.sizes.map((s) => s.label)).toEqual(['S', 'M', 'L']);
      expect(sizeFlags(v.groups, {})).toHaveLength(1);
      await setSizeAnswer(deps(), { storeId: S, cartId, key: v.groups[0]!.key, answer: 'other' });
      const after = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      expect(after.groups[0]!.answer).toBe('other');
      const stored = (await t.prisma.cart.findUniqueOrThrow({ where: { id: cartId } })).sizeAnswers as Record<string, 'other'>;
      expect(sizeFlags(after.groups, stored)).toEqual([]);
    });
  });

  describe('PR 111–113 · the summary, the code box and free delivery', () => {
    let cartId = '';
    it('the summary adds up from the engines; free-delivery progress comes from the live rule only', async () => {
      cartId = (await openBag(deps(), { storeId: S, visitorId: visitor('h') })).cartId;
      const v = variant('oxford-cotton-shirt', 'white', 'L');
      await addItem(deps(), { storeId: S, cartId, variantId: v.id });
      let bag = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      expect(bag.summary).toMatchObject({ count: 1, subtotalMinor: v.priceMinor, totalMinor: v.priceMinor, youSaveMinor: 0, freeDelivery: false });
      // The sample delivery rule is a draft: nothing is said about free delivery (CN-018).
      expect(bag.free).toMatchObject({ free: false, freeOverMinor: null, remainingMinor: null });
      expect(bag.slot).toBeNull();
      await switchOn('delivery');
      bag = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      expect(bag.free).toMatchObject({ free: false, freeOverMinor: 150000, remainingMinor: 150000 - v.priceMinor! });
      expect(bag.free.line).toMatch(/more/i);
      expect(bag.slot).toEqual({ kind: 'freeGap', remainingMinor: 150000 - v.priceMinor! });
      await addItem(deps(), { storeId: S, cartId, variantId: variant('oxford-cotton-shirt', 'white', 'XL').id });
      bag = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      expect(bag.free.free).toBe(bag.summary.subtotalMinor >= 150000);
    });

    it('PR 109: the tier ladder from a live set-tier rule, for a bag item it covers', async () => {
      const id = (await openBag(deps(), { storeId: S, visitorId: visitor('i') })).cartId;
      const v = variant('essential-pique-polo', 'navy', 'S');
      await addItem(deps(), { storeId: S, cartId: id, variantId: v.id });
      expect((await bagView(deps(), { storeId: S, cartId: id, lang: 'en' })).tiers).toBeNull(); // the sample tier is a draft
      await switchOn('any-polos');
      const bag = await bagView(deps(), { storeId: S, cartId: id, lang: 'en' });
      expect(bag.tiers).toMatchObject({ ruleKey: 'any-polos', inBag: 1, ladder: { rows: [{ quantity: 2, priceMinor: 150000 }, { quantity: 3, priceMinor: 210000 }], next: { quantity: 2, more: 1 } } });
      overrides.set('bag.tiers.endsOn', '2026-10-22');
      expect((await bagView(deps(), { storeId: S, cartId: id, lang: 'en' })).tiers).toBeNull();
      overrides.delete('bag.tiers.endsOn');
      // Two polos: the set tier applies, the summary says so and the saving is the engine's.
      await addItem(deps(), { storeId: S, cartId: id, variantId: variant('essential-pique-polo', 'navy', 'M').id });
      const two = await bagView(deps(), { storeId: S, cartId: id, lang: 'en' });
      const tier = two.summary.offers.find((o) => o.kind === 'setTier')!;
      expect(tier.amountMinor).toBe(two.summary.subtotalMinor - 150000);
      expect(two.summary.totalMinor).toBe(150000);
      expect(two.summary.youSaveMinor).toBe(tier.amountMinor);
    });

    it('SIM-F-009: a public code works for a guest; a members-only code says so; better-offer and too-small reasons', async () => {
      const rule = await createRule({ db: t.prisma, settings, now: () => clock }, who(), { templateId: 'coupon', key: 'test-eid-coupon' });
      await saveDraft({ db: t.prisma, settings, now: () => clock }, who(), rule.id, { content: withValues(rule.live!, { amountOff: 10000, minOrder: 300000 }, { status: 'ACTIVE' }) });
      await publishRule({ db: t.prisma, settings, now: () => clock }, who(), rule.id);
      bustAll();
      const rulesDeps = { db: t.prisma, settings, now: () => clock };
      const pub = await createCoupon(rulesDeps, who(), { code: 'test-eid', ruleId: rule.id });
      const mem = await createCoupon(rulesDeps, who(), { code: 'test-vip', ruleId: rule.id, audience: 'MEMBERS' });
      for (const c of [pub, mem]) await setCouponEnabled(rulesDeps, who(), c.id, { enabled: true });
      // A guest (no customer) with too small a bag: the code is good, it says how much more.
      await setBagCode(deps(), { storeId: S, cartId, code: 'test-eid' });
      let bag = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      if (bag.summary.subtotalMinor < 300000) {
        expect(bag.code).toEqual({ state: 'needsMore', code: 'TEST-EID', moreMinor: 300000 - bag.summary.subtotalMinor });
        for (const size of ['S', 'M']) await addItem(deps(), { storeId: S, cartId, variantId: variant('oxford-cotton-shirt', 'white', size).id });
        bag = await bagView(deps(), { storeId: S, cartId, lang: 'en' });
      }
      expect(bag.summary.subtotalMinor).toBeGreaterThanOrEqual(300000);
      // The public code works for the guest, and the summary carries it.
      expect(bag.code).toEqual({ state: 'applied', code: 'TEST-EID', amountMinor: 10000 });
      expect(bag.summary.offers).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'discount', code: 'TEST-EID', amountMinor: 10000 })]));
      expect(bag.summary.totalMinor).toBe(bag.summary.subtotalMinor - 10000);
      // The members-only code says so in words (the shop's dictionary turns the reason into "for members — log in").
      await setBagCode(deps(), { storeId: S, cartId, code: 'test-vip' });
      expect((await bagView(deps(), { storeId: S, cartId, lang: 'en' })).code).toEqual({ state: 'refused', code: 'TEST-VIP', reason: 'MEMBERS_ONLY' });
      expect((await bagView(deps(), { storeId: S, cartId, lang: 'en', customerId: '00000000-0000-4000-8000-000000000105' })).code).toMatchObject({ state: 'applied', code: 'TEST-VIP' });
      // A friend's invite code is told apart from a code that does not exist.
      const referrer = await t.prisma.customer.findFirst({ where: { storeId: S }, select: { id: true } });
      if (referrer) {
        await t.prisma.referral.create({ data: { storeId: S, referrerCustomerId: referrer.id, code: 'TEST-FRIEND', status: 'ACTIVE' } });
        await setBagCode(deps(), { storeId: S, cartId, code: 'test-friend' });
        expect((await bagView(deps(), { storeId: S, cartId, lang: 'en' })).code).toEqual({ state: 'refused', code: 'TEST-FRIEND', reason: 'REFERRAL' });
      }
      await setBagCode(deps(), { storeId: S, cartId, code: 'nope-nope' });
      expect((await bagView(deps(), { storeId: S, cartId, lang: 'en' })).code).toEqual({ state: 'refused', code: 'NOPE-NOPE', reason: 'UNKNOWN' });
      // Only set lines in the bag: a set price is never combined with a code — the bag says the set price is used.
      const setBag = (await openBag(deps(), { storeId: S, visitorId: visitor('j') })).cartId;
      await addSampleSet(setBag);
      await setBagCode(deps(), { storeId: S, cartId: setBag, code: 'test-eid' });
      const sb = await bagView(deps(), { storeId: S, cartId: setBag, lang: 'en' });
      expect(sb.code).toMatchObject({ code: 'TEST-EID' });
      expect(['betterOffer', 'needsMore']).toContain(sb.code.state);
      await setBagCode(deps(), { storeId: S, cartId, code: null });
      expect((await bagView(deps(), { storeId: S, cartId, lang: 'en' })).code).toEqual({ state: 'none' });
    });
  });
});
