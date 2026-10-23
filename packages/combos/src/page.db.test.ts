// PR 91–95, 102, 103 on a real PostgreSQL (a throwaway database with the real migrations, the sample catalogue and the
// sample combos; skipped without TEST_DATABASE_ADMIN_URL): the combo page's one read (price table, bag use, the set
// being changed, popular pairs learned from real picks, a generated pair's sibling colours) and the set cards.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import type { CombosDeps, SettingsReader } from './context';
import { seedSampleCombos } from './sample';
import { addSetToBag } from './bag';
import { setCards, setPage, type SetPageOptions } from './page';
import { checkPicks, groupCards, initialPicks, picksKey, withSize } from './page-model';
import { picksPrice } from './summary';
import { comboForSale } from './set-check';

const PAIRS: SetPageOptions['pairs'] = { on: true, max: 6, learn: true, minPicks: 2 };

describe.skipIf(!HAS_TEST_DB)('the combo pages on PostgreSQL (S03 · PR 91–95, 102, 103)', () => {
  let t: TestDatabase;
  let S = 0;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CombosDeps => ({ db: t.prisma, settings });
  const cart = async (visitorId: string) => (await t.prisma.cart.create({ data: { storeId: S, visitorId }, select: { id: true } })).id;

  beforeAll(async () => {
    t = await createTestDatabase('combopage');
    S = (await seedSample(t.prisma)).storeId;
    await seedSampleCombos(deps());
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('one read: the summary, slots, live variants, and a price table that agrees with the bag`s price', async () => {
    const p = await setPage(deps(), { storeId: S, slug: 'sample-polo-chino-set' }, { pairs: PAIRS });
    expect(p.summary).toMatchObject({ slug: 'sample-polo-chino-set', onSale: true, pieceCount: 2 });
    expect(p).toMatchObject({ autoApply: true, ruleId: null, edit: null, inBag: {}, pairs: [] });
    expect(p.slots).toHaveLength(2);
    expect(p.prices).not.toBeNull();
    const st0 = initialPicks(p.slots, p.variants, p.summary.pieces.map((x) => x.defaultColourId), null);
    let st = st0;
    p.summary.pieces.forEach((x, i) => (st = withSize(p.slots, st, i, x.openSizes[x.defaultColourId!]![0]!)));
    const check = checkPicks({ slots: p.slots, variants: p.variants, st, needsMix: p.summary.needsMix, onSale: true });
    expect(check.ok).toBe(true);
    const cell = p.prices![picksKey(p.slots, p.variants, st, check)]!;
    const c = await comboForSale(deps(), S, { slug: 'sample-polo-chino-set' });
    const real = picksPrice(c, check.variants, false)!;
    expect(cell).toEqual({ pay: real.payMinor, regular: real.regularMinor, saving: real.savingMinor, was: null, offer: real.offer });
    // before sizes are picked the key still lands in the table (each piece at its colour's price)
    expect(p.prices![picksKey(p.slots, p.variants, st0, checkPicks({ slots: p.slots, variants: p.variants, st: st0, needsMix: false, onSale: true }))]).toBeDefined();
  });

  it('the bag is counted, and `?from=` opens the set in the bag on its own picks', async () => {
    const p = await setPage(deps(), { storeId: S, slug: 'sample-polo-chino-set' }, { pairs: PAIRS });
    const choices = p.summary.pieces.map((x) => ({ colourId: x.defaultColourId, sizeId: x.openSizes[x.defaultColourId!]![0]! }));
    const id = await cart('test-visitor-page-1');
    const added = await addSetToBag(deps(), { storeId: S, cartId: id, slug: 'sample-polo-chino-set', choices, addKey: 'page-test-0001' });
    const again = await setPage(deps(), { storeId: S, slug: 'sample-polo-chino-set' }, { pairs: PAIRS, cartId: id });
    for (const v of added.lines) expect(again.inBag[v.variantId]).toBe(1);
    const edit = await setPage(deps(), { storeId: S, slug: 'sample-polo-chino-set' }, { pairs: PAIRS, cartId: id, editGroupKey: added.groupKey });
    expect(edit.edit).toEqual({ groupKey: added.groupKey, choices });
    expect(edit.inBag).toEqual({});
    // another combo's group, or another bag, opens without picks
    expect((await setPage(deps(), { storeId: S, slug: 'sample-crew-tee-trio' }, { pairs: PAIRS, cartId: id, editGroupKey: added.groupKey })).edit).toBeNull();
    expect((await setPage(deps(), { storeId: S, slug: 'sample-polo-chino-set' }, { pairs: PAIRS, cartId: await cart('test-visitor-page-2'), editGroupKey: added.groupKey })).edit).toBeNull();
  });

  it('popular pairs: a pack of one product offers them, learned picks first; switched off, none', async () => {
    const p = await setPage(deps(), { storeId: S, slug: 'sample-crew-tee-trio' }, { pairs: PAIRS });
    expect([1, 2, 3, 6]).toContain(p.pairs.length);
    expect(p.pairs.every((x) => x.slug === null && x.colourIds.length === 3)).toBe(true);
    const learned = [...p.pairs[p.pairs.length - 1]!.colourIds].sort();
    await t.prisma.popularPair.create({ data: { storeId: S, comboId: p.summary.comboId, colourIds: learned, colourKey: learned.join('+'), pickCount: 5 } });
    expect([...(await setPage(deps(), { storeId: S, slug: 'sample-crew-tee-trio' }, { pairs: PAIRS })).pairs[0]!.colourIds].sort()).toEqual(learned);
    expect((await setPage(deps(), { storeId: S, slug: 'sample-crew-tee-trio' }, { pairs: { ...PAIRS, on: false } })).pairs).toEqual([]);
  });

  it('a generated pair offers its sibling pairs (the same rule and products) as links, itself first', async () => {
    const rule = await t.prisma.comboAutoRule.findFirstOrThrow({ where: { storeId: S, key: 'sample-polo-pairs' }, select: { id: true } });
    const pairs = await t.prisma.combo.findMany({ where: { storeId: S, autoRuleId: rule.id, status: 'RUNNING' }, select: { slug: true, items: { select: { productId: true, quantity: true } } }, orderBy: { sortRank: 'asc' } });
    const one = pairs.find((x) => x.items.length === 1 && x.items[0]!.quantity === 2) ?? pairs[0]!;
    const p = await setPage(deps(), { storeId: S, slug: one.slug }, { pairs: PAIRS });
    expect(p.ruleId).toBe(rule.id);
    expect(p.pairs[0]).toMatchObject({ slug: null });
    expect(p.pairs.slice(1).every((x) => x.slug && x.slug !== one.slug)).toBe(true);
    expect([0, 1, 2, 3, 6]).toContain(p.pairs.length);
  });

  it('set cards: running combos on sale with their first colours and price; by product; one card per rule and product', async () => {
    const { cards, rules } = await setCards(deps(), S);
    expect(cards.some((c) => c.slug === 'sample-shirt-belt')).toBe(false); // paused
    const set = cards.find((c) => c.slug === 'sample-polo-chino-set')!;
    expect(set).toMatchObject({ ruleId: null, price: { pay: 205000, offer: true } });
    expect(set.pieces.every((x) => x.colourId)).toBe(true);
    expect(rules.map((r) => r.key)).toContain('sample-polo-pairs');
    const groups = groupCards(cards);
    expect(groups.length).toBeLessThan(cards.length);
    const chino = await t.prisma.product.findFirstOrThrow({ where: { storeId: S, slug: 'slim-chino-trousers' }, select: { id: true } });
    const byProduct = await setCards(deps(), S, { productId: chino.id });
    expect(byProduct.cards.map((c) => c.slug)).toEqual(['sample-polo-chino-set']);
    expect((await setCards(deps(), S, { productId: chino.id, exceptId: set.comboId })).cards).toEqual([]);
  });
});
