// S03 on a real PostgreSQL (a throwaway database with the real migrations and the sample catalogue; skipped without
// TEST_DATABASE_ADMIN_URL). Every value is a made-up test value; the sample store's products and stock come from the
// sample catalogue seed (PR 14).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { createAutoRule, getAutoRule, listAutoRules, previewAutoRule, setAutoRuleActive, setAutoRuleDates, setAutoRuleOptions, setAutoRuleUpsell, setShopTemplates, updateAutoRule } from './auto-rules';
import { createCombo, getCombo, listCombos, setComboActive, setComboFlags, setComboPrice, updateCombo } from './combos-service';
import type { CombosDeps, SettingsReader, Who } from './context';
import { seedSampleCombos } from './sample';
import { listSetTiers, liveSetTiers } from './set-tiers';
import { checkComboSet } from './set-check';
import { priceSet, setSummary } from './summary';
import { addSetToBag, bagSets, changeSetInBag, refreshBagSets, removeSetFromBag, saveSetForLater } from './bag';
import { productFacts } from './facts';
import { contentColumns, ruleContentSchema } from '@extas/rules';

export async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const T0 = new Date('2026-10-20T06:00:00Z');

describe.skipIf(!HAS_TEST_DB)('combos on PostgreSQL (S03)', () => {
  let t: TestDatabase;
  let S = 0;
  let B = 0;
  let clock = T0;
  const overrides = new Map<string, unknown>();
  const written: unknown[] = [];
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
    async set(key, value, target) {
      registry[key].schema.parse(value);
      written.push([key, value, target]);
      overrides.set(key, value);
    },
  };
  const deps = (): CombosDeps => ({ db: t.prisma, settings, now: () => clock });
  const actors: Record<string, Actor> = {};
  const as = (name: string, storeId = S): Who => ({ actor: actors[name]!, storeId });
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase('combos');
    S = (await seedSample(t.prisma)).storeId;
    B = (await t.prisma.store.create({ data: { slug: 'other', name: 'Other sample store', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    await syncAuth(t.prisma);
    const staff = async (name: string, perms: PermissionKey[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: `test-${name}`, nameEn: name, nameBn: name, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${name}@example.com`, displayName: name, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      actors[name] = { staffUserId: u.id };
    };
    await staff('reader', ['combos.read']);
    await staff('writer', ['combos.read', 'combos.write']);
    await staff('publisher', ['combos.read', 'combos.write', 'combos.publish']);
    await staff('owner', ['combos.read', 'combos.write', 'combos.publish', 'combos.prices']);
    const products = await t.prisma.product.findMany({ where: { storeId: S }, select: { id: true, slug: true, colours: { select: { colourId: true, colour: { select: { key: true } } } } } });
    for (const p of products) {
      ids[p.slug] = p.id;
      for (const c of p.colours) ids[`${p.slug}/${c.colour.key}`] = c.colourId;
    }
  });

  afterAll(async () => {
    await t?.drop();
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('PR 89 · the combo model', () => {
    const input = () => ({
      slug: 'test-polo-pair',
      nameEn: 'Test polo pair',
      type: 'COLOUR_PAIR' as const,
      items: [{ productId: ids['essential-pique-polo']!, quantity: 2 }],
      setPriceMinor: null as number | null,
    });

    it('permissions: reading needs combos.read, writing combos.write, a price combos.prices', async () => {
      expect(await code(listCombos(deps(), as('reader', B)))).toBe('FORBIDDEN');
      expect(await code(createCombo(deps(), as('reader'), input()))).toBe('FORBIDDEN');
      expect(await code(createCombo(deps(), as('publisher'), { ...input(), setPriceMinor: 150000 }))).toBe('OWNER_OK_REQUIRED');
    });

    it('a new combo is a draft; its regular total is the sum of the real prices', async () => {
      const c = await createCombo(deps(), as('writer'), input());
      ids.pair = c.id;
      expect(c).toMatchObject({ status: 'DRAFT', state: 'draft', pieceCount: 2, oneProduct: true, setPriceMinor: null });
      expect(c.pricing).toMatchObject({ regularMinor: 170000, payMinor: null, reason: 'NO_SET_PRICE' });
      expect(c.blocking).toEqual(['NO_SET_PRICE']);
      expect(await code(createCombo(deps(), as('writer'), input()))).toBe('SLUG_TAKEN');
    });

    it('cannot go on sale without a set price; the owner sets it; a price at or above the regular is no offer', async () => {
      expect(await code(setComboActive(deps(), as('publisher'), ids.pair!, true))).toBe('NOT_READY');
      expect(await code(setComboPrice(deps(), as('publisher'), ids.pair!, 150000))).toBe('OWNER_OK_REQUIRED');
      const high = await setComboPrice(deps(), as('owner'), ids.pair!, 180000);
      expect(high.pricing).toMatchObject({ payMinor: 170000, savingMinor: 0, offer: false, reason: 'NOT_LOWER' });
      const ok = await setComboPrice(deps(), as('owner'), ids.pair!, 150000);
      expect(ok.pricing).toMatchObject({ payMinor: 150000, savingMinor: 20000, savingPercent: 11, offer: true });
      const on = await setComboActive(deps(), as('publisher'), ids.pair!, true);
      expect(on.state).toBe('live');
    });

    it('editing: version check, a changed price needs the owner, removed slots are archived (never deleted)', async () => {
      const c = await getCombo(deps(), as('writer'), ids.pair!);
      expect(await code(updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 140000 }, c.version))).toBe('OWNER_OK_REQUIRED');
      expect(await code(updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 150000 }, c.version - 1))).toBe('STALE');
      const next = await updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 150000, items: [{ productId: ids['essential-pique-polo']!, quantity: 3 }] }, c.version);
      expect(next.pieceCount).toBe(3);
      const rows = await t.prisma.comboItem.findMany({ where: { comboId: ids.pair! } });
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.archivedAt)).toHaveLength(1);
      await updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 150000 }, next.version);
    });

    it('a slot must be the store’s own product, colour and size', async () => {
      expect(await code(createCombo(deps(), as('writer'), { ...input(), slug: 'test-bad', items: [{ productId: ids['essential-pique-polo']!, colourIds: [ids['heavy-cotton-tee/ecru']!], quantity: 2 }] }))).toBe('INVALID_INPUT');
      const other = await t.prisma.product.create({ data: { storeId: B, slug: 'other-polo', nameEn: 'Other polo' } });
      expect(await code(createCombo(deps(), as('writer'), { ...input(), slug: 'test-bad-2', items: [{ productId: other.id, quantity: 2 }] }))).toBe('INVALID_INPUT');
    });

    it('switches: auto-apply and same colour (K11); off moves it to the archive, on again keeps the link', async () => {
      const f = await setComboFlags(deps(), as('writer'), ids.pair!, { autoApply: true, sameColour: true });
      expect(f).toMatchObject({ autoApply: true, sameColour: true });
      const off = await setComboActive(deps(), as('publisher'), ids.pair!, false);
      expect(off.state).toBe('off');
      const back = await setComboActive(deps(), as('publisher'), ids.pair!, true);
      expect(back).toMatchObject({ state: 'live', slug: 'test-polo-pair' });
      expect(await t.prisma.auditLog.count({ where: { entityType: 'Combo', entityId: ids.pair! } })).toBeGreaterThanOrEqual(6);
    });

    it('an end date that passed ends it; turning it on again clears the past end', async () => {
      const c = await getCombo(deps(), as('writer'), ids.pair!);
      await updateCombo(deps(), as('writer'), ids.pair!, { ...input(), setPriceMinor: 150000, endsOn: '2026-10-21' }, c.version);
      clock = new Date('2026-10-22T06:00:00Z');
      expect((await getCombo(deps(), as('reader'), ids.pair!)).state).toBe('ended');
      const back = await setComboActive(deps(), as('publisher'), ids.pair!, true);
      expect(back).toMatchObject({ state: 'live', endsOn: null });
      clock = T0;
    });

    it('the sample combos go only to the sample store, once', async () => {
      const first = await seedSampleCombos(deps());
      expect(first).toEqual({ storeId: S, combos: 3, rules: 2 });
      expect((await seedSampleCombos(deps())).combos).toBe(0);
      const list = await listCombos(deps(), as('reader'));
      const set = list.find((c) => c.slug === 'sample-polo-chino-set')!;
      expect(set).toMatchObject({ state: 'live', autoApply: true });
      expect(set.pricing.offer).toBe(true);
    });
  });
  // ---------------------------------------------------------------------------------------------------------------
  describe('PR 571 · auto colour-pair rules', () => {
    const rule = (over: Record<string, unknown> = {}) => ({
      key: 'test-polos',
      nameEn: 'Test polo pairs',
      productIds: [ids['essential-pique-polo']!],
      pieces: 2 as const,
      priceMode: 'PERCENT' as const,
      percentOff: null as number | null,
      ...over,
    });
    const pairRows = (ruleId: string) => t.prisma.combo.findMany({ where: { autoRuleId: ruleId }, select: { id: true, pieceKey: true, status: true, slug: true, sortRank: true } });

    it('the preview counts what a rule would make, by pieces and by pairing; nothing is written', async () => {
      const p = await previewAutoRule(deps(), as('reader'), { productIds: [ids['essential-pique-polo']!, ids['contrast-collar-polo']!], percentOff: 10 });
      expect(p.counts.made).toBe(10 + 3);
      expect(p.byPieces).toEqual({ '2': 13, '3': 10 + 1 });
      expect(p.byPairing.ACROSS).toBe(5 * 3);
      expect(p.colours.length).toBeGreaterThanOrEqual(5);
      expect(p.pairs[0]!.pricing.reason).toBe('OFFER');
      expect(await t.prisma.comboAutoRule.count({ where: { key: 'preview' } })).toBe(0);
    });

    it('a new rule is a draft with one combo row per pair; a price needs the owner; the share has the store’s limit', async () => {
      expect(await code(createAutoRule(deps(), as('reader'), rule()))).toBe('FORBIDDEN');
      expect(await code(createAutoRule(deps(), as('writer'), rule({ percentOff: 10 })))).toBe('OWNER_OK_REQUIRED');
      expect(await code(createAutoRule(deps(), as('owner'), rule({ percentOff: 95 })))).toBe('INVALID_INPUT');
      const r = await createAutoRule(deps(), as('writer'), rule());
      ids.rule = r.id;
      expect(r).toMatchObject({ state: 'draft', path: '/combos/test-polos', blocking: ['NO_SET_PRICE'] });
      expect(r.counts.made).toBe(10);
      const rows = await pairRows(r.id);
      expect(rows).toHaveLength(10);
      expect(rows.every((x) => x.status === 'DRAFT' && x.slug.startsWith('test-polos~'))).toBe(true);
      expect(await code(createAutoRule(deps(), as('writer'), rule()))).toBe('SLUG_TAKEN');
    });

    it('a colour left out ends its pairs (never deleted); put back, the same rows come back; the link is fixed', async () => {
      const r = await getAutoRule(deps(), as('reader'), ids.rule!);
      const red = ids['essential-pique-polo/red']!;
      expect(await code(updateAutoRule(deps(), as('writer'), ids.rule!, rule({ key: 'other-key' }), r.version))).toBe('KEY_FIXED');
      const out = await updateAutoRule(deps(), as('writer'), ids.rule!, rule({ excludeColourIds: [red] }), r.version);
      expect(out.counts.made).toBe(6);
      const rows = await pairRows(ids.rule!);
      expect(rows).toHaveLength(10);
      const ended = rows.filter((x) => x.status === 'ENDED');
      expect(ended).toHaveLength(4);
      const back = await updateAutoRule(deps(), as('writer'), ids.rule!, rule(), out.version);
      expect(back.counts.made).toBe(10);
      const again = await pairRows(ids.rule!);
      expect(again.map((x) => x.id).sort()).toEqual(rows.map((x) => x.id).sort());
      expect(again.some((x) => x.status === 'ENDED')).toBe(false);
    });

    it('on needs a price and combos.publish; its pairs follow it on and off; the end date ends it, on again clears it', async () => {
      expect(await code(setAutoRuleActive(deps(), as('publisher'), ids.rule!, true))).toBe('NOT_READY');
      const r = await getAutoRule(deps(), as('reader'), ids.rule!);
      expect(await code(setAutoRuleActive(deps(), as('writer'), ids.rule!, true))).toBe('FORBIDDEN');
      const priced = await updateAutoRule(deps(), as('owner'), ids.rule!, rule({ percentOff: 10 }), r.version);
      expect(priced.top!.pricing).toMatchObject({ regularMinor: 170000, payMinor: 153000, reason: 'OFFER' });
      const on = await setAutoRuleActive(deps(), as('publisher'), ids.rule!, true);
      expect(on.state).toBe('live');
      expect((await pairRows(ids.rule!)).every((x) => x.status === 'RUNNING')).toBe(true);
      const off = await setAutoRuleActive(deps(), as('publisher'), ids.rule!, false);
      expect(off.state).toBe('off');
      expect((await pairRows(ids.rule!)).every((x) => x.status === 'PAUSED')).toBe(true);
      await setAutoRuleActive(deps(), as('publisher'), ids.rule!, true);
      const dated = await setAutoRuleDates(deps(), as('publisher'), ids.rule!, null, '2026-10-21');
      expect(dated.endsOn).toBe('2026-10-21');
      clock = new Date('2026-10-22T06:00:00Z');
      expect((await getAutoRule(deps(), as('reader'), ids.rule!)).state).toBe('ended');
      const revived = await setAutoRuleActive(deps(), as('publisher'), ids.rule!, true);
      expect(revived).toMatchObject({ state: 'live', endsOn: null });
      clock = T0;
    });

    it('"add 1 more": a 3-piece companion (draft, no price until the owner sets one); options and shop templates', async () => {
      expect(await code(setAutoRuleUpsell(deps(), as('writer'), ids.rule!, true))).toBe('INVALID_INPUT');
      const up = await setAutoRuleUpsell(deps(), as('writer'), ids.rule!, true, { nameEn: 'Test polo threes' });
      expect(up.addOneMore).toBe(true);
      expect(up.upsell).toMatchObject({ key: 'test-polos-3', state: 'draft', priced: false });
      const three = await getAutoRule(deps(), as('reader'), up.upsell!.id);
      expect(three).toMatchObject({ pieces: 3, upsellOf: { id: ids.rule } });
      expect(three.counts.made).toBe(10);
      const o = await setAutoRuleOptions(deps(), as('writer'), ids.rule!, { noSinglePiece: false, listTemplateKey: 'L2' });
      expect(o).toMatchObject({ noSinglePiece: false, listTemplateKey: 'L2', pageTemplateKey: null });
      const tpl = await setShopTemplates(deps(), as('writer'), { list: 'L3' });
      expect(tpl.list).toBe('L3');
      expect(await code(setShopTemplates(deps(), as('writer'), { list: 'L9' }))).toBe('INVALID_INPUT');
      overrides.delete('combos.template.list');
      const list = await listAutoRules(deps(), as('reader'));
      expect(list.map((x) => x.key)).toEqual(expect.arrayContaining(['test-polos', 'test-polos-3']));
      expect(await t.prisma.auditLog.count({ where: { entityType: 'ComboAutoRule', entityId: ids.rule! } })).toBeGreaterThanOrEqual(8);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('PR 99 · set tiers read from Smart Rules', () => {
    it('the admin sees every set tier rule (a tier without a price is not offered); the shop only the live, priced ones', async () => {
      const polos = await t.prisma.category.findFirstOrThrow({ where: { storeId: S, slug: 'polos' }, select: { id: true, nameEn: true } });
      const content = ruleContentSchema.parse({
        key: 'test-any-polos',
        kind: 'setTier',
        nameEn: 'Test any polos',
        text: {},
        params: [
          { key: 'tier2', type: 'money', value: 200000, labelEn: 'Any 2' },
          { key: 'tier3', type: 'money', value: null, labelEn: 'Any 3' },
        ],
        scope: { include: [{ type: 'category', id: polos.id }], exclude: [{ type: 'product', id: ids['long-sleeve-polo']! }] },
        conditions: { all: [] },
        actions: [{ type: 'setTier', tiers: [{ quantity: 2, param: 'tier2' }, { quantity: 3, param: 'tier3' }] }],
        placements: [],
        priority: 0,
        stackable: false,
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
      });
      const row = await t.prisma.smartRule.create({ data: { storeId: S, ...contentColumns(content) }, select: { id: true } });

      const [v] = await listSetTiers(deps(), as('reader'));
      expect(v).toMatchObject({ ruleId: row.id, key: 'test-any-polos', state: 'live', allPriced: false, include: [{ type: 'category', nameEn: polos.nameEn }], exclude: [{ type: 'product', nameEn: expect.any(String) }] });
      expect(v!.tiers).toEqual([
        { quantity: 2, priceMinor: 200000, eachMinor: 100000 },
        { quantity: 3, priceMinor: null, eachMinor: null },
      ]);
      const polosInStore = await t.prisma.product.count({ where: { storeId: S, status: 'PUBLISHED', categoryId: polos.id } });
      expect(v!.products).toBe(polosInStore - 1);

      expect(await liveSetTiers(deps(), { storeId: S, productId: ids['essential-pique-polo']! })).toEqual([expect.objectContaining({ key: 'test-any-polos', tiers: [{ quantity: 2, priceMinor: 200000 }] })]);
      expect(await liveSetTiers(deps(), { storeId: S, productId: ids['long-sleeve-polo']! })).toEqual([]);
      expect(await liveSetTiers(deps(), { storeId: S, productId: ids['oxford-cotton-shirt']! })).toEqual([]);
      expect(await liveSetTiers(deps(), { storeId: B })).toEqual([]);

      await t.prisma.smartRule.update({ where: { id: row.id }, data: { status: 'PAUSED' } });
      expect((await listSetTiers(deps(), as('reader')))[0]!.state).toBe('off');
      expect(await liveSetTiers(deps(), { storeId: S })).toEqual([]);
      await t.prisma.smartRule.update({ where: { id: row.id }, data: { status: 'ACTIVE', startsAt: new Date(clock.getTime() + 86_400_000) } });
      expect((await listSetTiers(deps(), as('reader')))[0]!.state).toBe('soon');
      expect(await liveSetTiers(deps(), { storeId: S })).toEqual([]);
      await t.prisma.smartRule.update({ where: { id: row.id }, data: { archivedAt: clock } });
      expect(await listSetTiers(deps(), as('reader'))).toEqual([]);
      expect(await code(listSetTiers(deps(), as('reader', B)))).not.toBe('ok');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('PR 101 · set validation on the server', () => {
    it('says what is missing, counts the bag (no oversell), leaves out the set being changed, and refuses one not on sale', async () => {
      const combo = await t.prisma.combo.findFirstOrThrow({ where: { storeId: S, slug: 'sample-polo-chino-set' }, select: { id: true } });
      await t.prisma.combo.update({ where: { id: combo.id }, data: { status: 'RUNNING' } });
      expect(await code(checkComboSet(deps(), { storeId: S, slug: 'no-such-set', choices: [] }))).toBe('NOT_FOUND');
      expect(await code(checkComboSet(deps(), { storeId: S, choices: [] }))).toBe('INVALID_INPUT');

      const none = await checkComboSet(deps(), { storeId: S, slug: 'sample-polo-chino-set', choices: [] });
      expect(none).toMatchObject({ ok: false, first: { code: 'PICK_COLOUR', slot: 0 }, total: 2, done: 0 });

      const facts = await productFacts(deps(), S, [ids['essential-pique-polo']!, ids['slim-chino-trousers']!]);
      const inStock = (slug: string) => facts.get(ids[slug]!)!.variants.find((x) => x.sellable > 0 && x.priceMinor !== null)!;
      const polo = inStock('essential-pique-polo');
      const chino = inStock('slim-chino-trousers');
      const choices = [
        { colourId: polo.colourId, sizeId: polo.sizeId },
        { colourId: chino.colourId, sizeId: chino.sizeId },
      ];
      const ok = await checkComboSet(deps(), { storeId: S, comboId: combo.id, choices });
      expect(ok).toMatchObject({ ok: true, done: 2, variants: [polo.id, chino.id] });

      const cart = await t.prisma.cart.create({ data: { storeId: S, visitorId: 'test-visitor-101' }, select: { id: true } });
      await t.prisma.cartItem.create({ data: { storeId: S, cartId: cart.id, variantId: chino.id, quantity: chino.sellable, unitPriceMinor: chino.priceMinor!, comboGroupKey: 'test-group' } });
      const full = await checkComboSet(deps(), { storeId: S, comboId: combo.id, choices, cartId: cart.id });
      expect(full.first).toEqual({ code: 'NOT_ENOUGH', slot: 1, stock: chino.sellable, need: 1, inBag: chino.sellable });
      expect((await checkComboSet(deps(), { storeId: S, comboId: combo.id, choices, cartId: cart.id, editGroupKey: 'test-group' })).ok).toBe(true);

      const off = await checkComboSet(deps(), { storeId: S, slug: 'sample-shirt-belt', choices: [] });
      expect(off.first).toEqual({ code: 'NOT_ON_SALE', slot: null });
      expect((await checkComboSet(deps(), { storeId: B, slug: 'sample-polo-chino-set', choices: [] }).catch((e) => e.code))).toBe('NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('PR 96 · the set summary on the server', () => {
    it('a top + bottom set: its pieces in order with colours, sizes and stock, the P3 page, and one set price', async () => {
      const sum = await setSummary(deps(), { storeId: S, slug: 'sample-polo-chino-set' });
      expect(sum).toMatchObject({ slug: 'sample-polo-chino-set', type: 'TOP_BOTTOM', state: 'live', onSale: true, pieceCount: 2, needsMix: false, pageTemplate: 'P3', bagTemplate: 'B5', listTemplate: 'L1' });
      expect(sum.pieces.map((p) => p.productId)).toEqual([ids['essential-pique-polo'], ids['slim-chino-trousers']]);
      for (const p of sum.pieces) {
        expect(p.colours.length).toBeGreaterThan(0);
        expect(p.colours.find((c) => c.id === p.defaultColourId)?.open).toBe(true);
        expect(p.openSizes[p.defaultColourId!]!.length).toBeGreaterThan(0);
        for (const open of Object.values(p.openSizes)) for (const id of open) expect(p.sizes.map((x) => x.id)).toContain(id);
      }
      expect(sum.price).toMatchObject({ payMinor: 205000, offer: true, pieces: 2, eachMinor: 102500 });
      expect(sum.price.savingMinor).toBe(sum.price.regularMinor! - 205000);
      // No struck price until the owner switches them on; then it is the separate prices' sum, never more.
      expect(sum.price).toMatchObject({ wasMinor: null, wasReason: 'NOT_CHOSEN' });
      overrides.set('rules.discount.showWasPrice', true);
      expect((await setSummary(deps(), { storeId: S, slug: 'sample-polo-chino-set' })).price).toMatchObject({ wasMinor: sum.price.regularMinor, wasReason: 'SHOWN' });
      overrides.delete('rules.discount.showWasPrice');
      expect(await code(setSummary(deps(), { storeId: B, slug: 'sample-polo-chino-set' }))).toBe('NOT_FOUND');
    });

    it('the picks are priced at their own variants\' prices; nothing until every piece is picked', async () => {
      const sum = await setSummary(deps(), { storeId: S, slug: 'sample-polo-chino-set' });
      const half = await priceSet(deps(), { storeId: S, slug: 'sample-polo-chino-set', choices: [{ colourId: sum.pieces[0]!.defaultColourId }] });
      expect(half.price).toBeNull();
      expect(half.check.first?.code).toBe('PICK_SIZE');
      const choices = sum.pieces.map((p) => ({ colourId: p.defaultColourId, sizeId: p.openSizes[p.defaultColourId!]![0]! }));
      const full = await priceSet(deps(), { storeId: S, slug: 'sample-polo-chino-set', choices });
      expect(full.check.ok).toBe(true);
      expect(full.price).toMatchObject({ payMinor: 205000, offer: true });
      const variants = await t.prisma.productVariant.findMany({ where: { id: { in: full.check.variants as string[] } }, select: { priceMinor: true } });
      expect(full.price!.regularMinor).toBe(variants.reduce((s, v) => s + v.priceMinor!, 0));
    });

    it('an auto pair is priced by its rule (% off), P1 for a short list and P2 past the long-list setting', async () => {
      const rule = await t.prisma.comboAutoRule.findFirstOrThrow({ where: { storeId: S, key: 'sample-polo-pairs' }, select: { id: true, percentOff: true } });
      const pairs = await t.prisma.combo.findMany({ where: { storeId: S, autoRuleId: rule.id, status: { not: 'ENDED' }, archivedAt: null }, select: { slug: true, items: { select: { productId: true } } } });
      const pair = pairs.find((p) => new Set(p.items.map((i) => i.productId)).size === 1)!;
      expect(pair).toBeDefined();
      await t.prisma.combo.updateMany({ where: { storeId: S, slug: pair.slug }, data: { status: 'RUNNING' } });
      const sum = await setSummary(deps(), { storeId: S, slug: pair.slug });
      expect(sum.pageTemplate).toBe(pairs.length > 28 ? 'P2' : 'P1');
      expect(sum.pieces.every((p) => p.colours.length === 1 && p.defaultColourId === p.colours[0]!.id)).toBe(true);
      const step = registry['combos.price.roundingStepMinor'].default;
      if (sum.price.regularMinor !== null && sum.price.payMinor !== null) {
        expect(sum.price.payMinor % step).toBe(0);
        expect(sum.price.payMinor).toBeLessThanOrEqual(Math.round((sum.price.regularMinor * (100 - rule.percentOff!)) / 100));
      }
      overrides.set('combos.template.longListPairs', 2);
      expect((await setSummary(deps(), { storeId: S, slug: pair.slug })).pageTemplate).toBe(pairs.length > 2 ? 'P2' : 'P1');
      overrides.delete('combos.template.longListPairs');
    });
  });

  // ---------------------------------------------------------------------------------------------------------------
  describe('PR 97 · a set in the bag, its price locked', () => {
    const SLUG = 'sample-polo-chino-set';
    let picks: { colourId: string | null; sizeId: string }[] = [];
    let other: { colourId: string | null; sizeId: string }[] = [];
    const cart = async (visitorId: string) => (await t.prisma.cart.create({ data: { storeId: S, visitorId }, select: { id: true } })).id;
    const lines = (cartId: string) => t.prisma.cartItem.findMany({ where: { cartId }, select: { variantId: true, unitPriceMinor: true, setPriceMinor: true, comboGroupKey: true, source: true } });

    beforeAll(async () => {
      const sum = await setSummary(deps(), { storeId: S, slug: SLUG });
      picks = sum.pieces.map((p) => ({ colourId: p.defaultColourId, sizeId: p.openSizes[p.defaultColourId!]![0]! }));
      // The same set in another colour or size of the first piece (for "change in the bag").
      const p0 = sum.pieces[0]!;
      const open = Object.entries(p0.openSizes)
        .flatMap(([colourId, sizes]) => sizes.map((sizeId) => ({ colourId, sizeId })))
        .find((x) => x.colourId !== picks[0]!.colourId || x.sizeId !== picks[0]!.sizeId)!;
      other = [open, picks[1]!];
    });

    it('goes in as one set: one line per piece at its own price, the set price locked on every line', async () => {
      const id = await cart('test-visitor-97a');
      const r = await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks, addKey: 'tap-0001-aaaa' });
      expect(r).toMatchObject({ added: true, groupKey: 'set-tap-0001-aaaa', setPriceMinor: 205000 });
      const rows = await lines(id);
      expect(rows).toHaveLength(2);
      const variants = await t.prisma.productVariant.findMany({ where: { id: { in: rows.map((x) => x.variantId) } }, select: { id: true, priceMinor: true } });
      for (const row of rows) {
        expect(row).toMatchObject({ setPriceMinor: 205000, comboGroupKey: 'set-tap-0001-aaaa', source: 'combo' });
        expect(row.unitPriceMinor).toBe(variants.find((v) => v.id === row.variantId)!.priceMinor);
      }
      const [set] = await bagSets(deps(), { storeId: S, cartId: id });
      expect(set).toMatchObject({ slug: SLUG, lockedMinor: 205000, payMinor: 205000, note: null, savedForLater: false });
      expect(set!.savingMinor).toBe(set!.regularMinor - 205000);
    });

    it('double add: the same tap, a quick second tap and two taps at once each make one set; later it is a new one', async () => {
      const id = await cart('test-visitor-97b');
      const first = await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks, addKey: 'tap-0002-aaaa' });
      expect((await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks, addKey: 'tap-0002-aaaa' })).added).toBe(false);
      const quick = await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks, addKey: 'tap-0002-bbbb' });
      expect(quick).toMatchObject({ added: false, groupKey: first.groupKey });
      const both = await Promise.all([addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks }), addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks })]);
      expect(both.every((x) => !x.added)).toBe(true);
      expect(await lines(id)).toHaveLength(2);
      clock = new Date(T0.getTime() + registry['combos.bag.repeatGuardMs'].default + 1);
      expect((await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks })).added).toBe(true);
      expect(await lines(id)).toHaveLength(4);
      clock = T0;
    });

    it('two taps at once on an empty bag still make one set (the cart is locked while adding)', async () => {
      const id = await cart('test-visitor-97c');
      const r = await Promise.all([
        addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks, addKey: 'tap-0003-aaaa' }),
        addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks, addKey: 'tap-0003-bbbb' }),
      ]);
      expect(r.filter((x) => x.added)).toHaveLength(1);
      expect(await lines(id)).toHaveLength(2);
    });

    it('oversell: what the bag already holds counts; a closed bag and a wrong set are refused with every reason', async () => {
      const id = await cart('test-visitor-97d');
      const facts = await productFacts(deps(), S, [ids['slim-chino-trousers']!]);
      const chino = facts.get(ids['slim-chino-trousers']!)!.variants.find((v) => v.colourId === picks[1]!.colourId && v.sizeId === picks[1]!.sizeId)!;
      await t.prisma.cartItem.create({ data: { storeId: S, cartId: id, variantId: chino.id, quantity: chino.sellable, unitPriceMinor: chino.priceMinor! } });
      const e = await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks }).catch((x) => x);
      expect(e).toMatchObject({ code: 'SET_INVALID', details: ['NOT_ENOUGH@1'] });
      expect(await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: [picks[0]!] }).catch((x) => x.details)).toEqual(['PICK_COLOUR@1']);
      await t.prisma.cart.update({ where: { id }, data: { status: 'CONVERTED' } });
      expect(await code(addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks }))).toBe('CART_NOT_OPEN');
      expect(await code(addSetToBag(deps(), { storeId: B, cartId: id, slug: SLUG, choices: picks }))).toBe('CART_NOT_OPEN');
    });

    it('stale price: a new combo price reaches live sets in the bag (when following), an ended set keeps its price', async () => {
      const combo = await t.prisma.combo.findFirstOrThrow({ where: { storeId: S, slug: SLUG }, select: { id: true } });
      const id = await cart('test-visitor-97e');
      await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks });
      await t.prisma.combo.update({ where: { id: combo.id }, data: { setPriceMinor: 199000 } });
      overrides.set('combos.bag.followPriceChanges', false);
      expect((await bagSets(deps(), { storeId: S, cartId: id }))[0]).toMatchObject({ payMinor: 205000, note: null });
      expect((await refreshBagSets(deps(), { storeId: S, cartId: id })).changed).toEqual([]);
      overrides.delete('combos.bag.followPriceChanges');
      expect((await bagSets(deps(), { storeId: S, cartId: id }))[0]).toMatchObject({ lockedMinor: 205000, payMinor: 199000, note: 'PRICE_CHANGED' });
      expect((await refreshBagSets(deps(), { storeId: S, cartId: id })).changed).toHaveLength(1);
      expect((await lines(id)).every((l) => l.setPriceMinor === 199000)).toBe(true);
      expect((await bagSets(deps(), { storeId: S, cartId: id }))[0]).toMatchObject({ lockedMinor: 199000, note: null });
      // The offer ends while the set is in the bag: it keeps the price, with the note; no new set goes in.
      await t.prisma.combo.update({ where: { id: combo.id }, data: { status: 'ENDED', setPriceMinor: 150000 } });
      expect((await bagSets(deps(), { storeId: S, cartId: id }))[0]).toMatchObject({ payMinor: 199000, note: 'ENDED_KEEPS_PRICE', state: 'ended' });
      expect((await refreshBagSets(deps(), { storeId: S, cartId: id })).changed).toEqual([]);
      clock = new Date(T0.getTime() + registry['combos.bag.repeatGuardMs'].default + 1);
      expect(await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks, addKey: 'tap-0005-aaaa' }).catch((x) => x.details)).toEqual(['NOT_ON_SALE']);
      clock = T0;
      await t.prisma.combo.update({ where: { id: combo.id }, data: { status: 'RUNNING', setPriceMinor: 205000 } });
    });

    it('a set price above the regular total charges the regular total, never more', async () => {
      const combo = await t.prisma.combo.findFirstOrThrow({ where: { storeId: S, slug: SLUG }, select: { id: true } });
      await t.prisma.combo.update({ where: { id: combo.id }, data: { setPriceMinor: 99_000_000 } });
      const id = await cart('test-visitor-97f');
      const r = await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks });
      const regular = r.lines.reduce((sum, l) => sum + l.unitPriceMinor, 0);
      expect(r).toMatchObject({ setPriceMinor: regular, price: { offer: false, reason: 'NOT_LOWER', savingMinor: 0 } });
      await t.prisma.combo.update({ where: { id: combo.id }, data: { setPriceMinor: 205000 } });
    });

    it('change sizes in the bag (re-checked, re-priced, same set), save for later, and take the whole set out', async () => {
      const id = await cart('test-visitor-97g');
      const r = await addSetToBag(deps(), { storeId: S, cartId: id, slug: SLUG, choices: picks });
      const changed = await changeSetInBag(deps(), { storeId: S, cartId: id, groupKey: r.groupKey, choices: other });
      expect(changed.groupKey).toBe(r.groupKey);
      expect(changed.lines.map((l) => l.id).sort()).toEqual(r.lines.map((l) => l.id).sort());
      expect(changed.lines.map((l) => l.variantId)).not.toEqual(r.lines.map((l) => l.variantId));
      expect(await code(changeSetInBag(deps(), { storeId: S, cartId: id, groupKey: 'set-nope', choices: other }))).toBe('NOT_FOUND');
      expect(await saveSetForLater(deps(), { storeId: S, cartId: id, groupKey: r.groupKey, saved: true })).toEqual({ moved: 2 });
      expect((await bagSets(deps(), { storeId: S, cartId: id }))[0]!.savedForLater).toBe(true);
      expect(await removeSetFromBag(deps(), { storeId: S, cartId: id, groupKey: r.groupKey })).toEqual({ removed: 2 });
      expect(await bagSets(deps(), { storeId: S, cartId: id })).toEqual([]);
    });
  });
});
