// PR 572 on a real PostgreSQL (a throwaway database with the real migrations, the sample catalogue and the sample
// combos; skipped without TEST_DATABASE_ADMIN_URL): a rule's own page in one read — its pairs with links, sizes and
// set prices that agree with the bag, the price table, the 2 ↔ 3 piece companion, top + bottom pairs sized one by one,
// and a rule that is switched off keeping its page with no pairs. PR 574: a set in the bag keeps its slot order, knows
// its rule and its bag look, and one piece changes size in place.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import type { CombosDeps, SettingsReader } from './context';
import { seedSampleCombos } from './sample';
import { rulePage } from './rule-page';
import { filterPairs, NO_FILTER, pairPrice } from './rule-page-model';
import { priceSet } from './summary';
import { addSetToBag, bagSets, changeSetInBag } from './bag';

describe.skipIf(!HAS_TEST_DB)('a rule`s own page on PostgreSQL (S03 · PR 572)', () => {
  let t: TestDatabase;
  let S = 0;
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CombosDeps => ({ db: t.prisma, settings });

  beforeAll(async () => {
    t = await createTestDatabase('rulepage');
    S = (await seedSample(t.prisma)).storeId;
    await seedSampleCombos(deps());
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('the polo pairs: every pair with its link, sizes and a set price the bag agrees with', async () => {
    const p = (await rulePage(deps(), S, { key: 'sample-polo-pairs' }))!;
    expect(p.onSale).toBe(true);
    expect(p.rule).toMatchObject({ key: 'sample-polo-pairs', pieces: 2, pairing: 'STYLE', state: 'live' });
    expect(p.pairs.length).toBeGreaterThan(5);
    const first = filterPairs(p.pairs, NO_FILTER)[0]!;
    expect(first.slug.startsWith('sample-polo-pairs~')).toBe(true);
    expect(first.sizes.length).toBeGreaterThan(0);
    expect(first.price.pay).not.toBeNull();
    const choices = first.slots.map((s) => ({ colourId: s.colourId, sizeId: p.products.find((x) => x.id === s.productId)!.sizes[1]!.id }));
    const priced = await priceSet(deps(), { storeId: S, slug: first.slug, choices });
    expect(priced.check.ok).toBe(true);
    expect(priced.price?.payMinor).toBe(first.price.pay);
    const variantPrices = first.slots.map((s, i) => p.products.find((x) => x.id === s.productId)!.variants.find((v) => v.colourId === s.colourId && v.sizeId === choices[i]!.sizeId)?.priceMinor ?? null);
    expect(pairPrice(first, variantPrices, p.prices).pay).toBe(first.price.pay);
  });

  it('the 2-piece rule names its 3-piece companion and back', async () => {
    const two = (await rulePage(deps(), S, { key: 'sample-polo-pairs' }))!;
    expect(two.rule.addOneMore).toBe(true);
    expect(two.companion?.rule.key).toBe('sample-polo-trios');
    const three = (await rulePage(deps(), S, { key: 'sample-polo-trios' }))!;
    expect(three.companion?.rule.key).toBe('sample-polo-pairs');
    expect(three.pairs[0]!.pieces).toHaveLength(3);
  });

  it('a top and trousers with no size in common are sized one by one, not sold out', async () => {
    const p = (await rulePage(deps(), S, { key: 'sample-hoodie-trousers' }))!;
    expect(p.onSale).toBe(true);
    const open = filterPairs(p.pairs, NO_FILTER);
    expect(open.length).toBeGreaterThan(0);
    expect(open[0]!.sizes).toEqual([]);
    expect(open[0]!.openSizes).toBeGreaterThan(0);
  });

  it('PR 573: another pair takes the place of a set in the bag (colours changed while editing); the old lines are archived', async () => {
    const p = (await rulePage(deps(), S, { key: 'sample-polo-pairs' }))!;
    const [a, b] = filterPairs(p.pairs, NO_FILTER);
    const sizeOf = (productId: string) => p.products.find((x) => x.id === productId)!.sizes[0]!.id;
    const choicesOf = (x: typeof a) => x!.slots.map((s) => ({ colourId: s.colourId, sizeId: sizeOf(s.productId) }));
    const cartId = (await t.prisma.cart.create({ data: { storeId: S, visitorId: 'rule-page-replace' }, select: { id: true } })).id;
    const first = await addSetToBag(deps(), { storeId: S, cartId, slug: a!.slug, choices: choicesOf(a), addKey: 'replace-test-0001' });
    const next = await addSetToBag(deps(), { storeId: S, cartId, slug: b!.slug, choices: choicesOf(b), addKey: 'replace-test-0002', replaceGroupKey: first.groupKey });
    expect(next.added).toBe(true);
    expect(next.groupKey).not.toBe(first.groupKey);
    const lines = await t.prisma.cartItem.findMany({ where: { cartId }, select: { comboGroupKey: true, removedAt: true } });
    expect(lines.filter((l) => l.comboGroupKey === first.groupKey).every((l) => l.removedAt !== null)).toBe(true);
    expect(lines.filter((l) => l.comboGroupKey === next.groupKey && l.removedAt === null)).toHaveLength(2);
    await expect(addSetToBag(deps(), { storeId: S, cartId, slug: b!.slug, choices: choicesOf(b), replaceGroupKey: 'set-none' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('PR 574: a set in the bag keeps its slot order, its rule and its look; one piece changes size in place', async () => {
    const p = (await rulePage(deps(), S, { key: 'sample-hoodie-trousers' }))!;
    const pair = filterPairs(p.pairs, NO_FILTER)[0]!;
    const sizes = (productId: string) => p.products.find((x) => x.id === productId)!.variants.filter((v) => v.sellable > 0);
    const choices = pair.slots.map((s) => ({ colourId: s.colourId, sizeId: sizes(s.productId).find((v) => v.colourId === s.colourId)!.sizeId }));
    const cartId = (await t.prisma.cart.create({ data: { storeId: S, visitorId: 'rule-page-bag-look' }, select: { id: true } })).id;
    const added = await addSetToBag(deps(), { storeId: S, cartId, slug: pair.slug, choices, addKey: 'bag-look-test-01' });
    const [set] = await bagSets(deps(), { storeId: S, cartId });
    expect(set).toMatchObject({ groupKey: added.groupKey, ruleId: p.rule.id, bagTemplate: 'current' });
    expect(set!.lines.map((l) => l.productId)).toEqual(pair.slots.map((s) => s.productId));
    // the last piece in another size it is made in: the same set, the same lines, that one piece changed
    const last = pair.slots.length - 1;
    const other = sizes(pair.slots[last]!.productId).find((v) => v.colourId === pair.slots[last]!.colourId && v.sizeId !== choices[last]!.sizeId)!;
    const next = choices.map((c, i) => (i === last ? { ...c, sizeId: other.sizeId } : c));
    await changeSetInBag(deps(), { storeId: S, cartId, groupKey: added.groupKey, choices: next });
    const [after] = await bagSets(deps(), { storeId: S, cartId });
    expect(after!.lines.map((l) => l.id)).toEqual(set!.lines.map((l) => l.id));
    expect(after!.lines.map((l) => l.sizeId)).toEqual(next.map((c) => c.sizeId));
  });

  it('a switched-off rule keeps its page with no pairs; an unknown key has none', async () => {
    const off = (await rulePage(deps(), S, { key: 'sample-shirt-tee' }))!;
    expect(off.onSale).toBe(false);
    expect(off.rule.state).not.toBe('live');
    expect(await rulePage(deps(), S, { key: 'no-such-rule' })).toBeNull();
    expect(await rulePage(deps(), S, {})).toBeNull();
  });
});
