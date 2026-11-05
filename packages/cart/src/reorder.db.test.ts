// PR 622 (CN-034) on a real PostgreSQL (a throwaway database with the real migrations, the sample catalogue and the
// sample combos; skipped without TEST_DATABASE_ADMIN_URL). Every value is a made-up test value.
// "Buy again": today's price and stock, a sold-out size with the sizes still in stock, a product taken off sale, a set
// still offered and one no longer offered, add-ons and gifts left out, the switch off, someone else's order, two taps.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { productFacts, setSummary, type ProductFact } from '@extas/combos';
import { seedSampleCombos } from '@extas/combos/sample';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { openBag } from './cart';
import type { CartDeps, SettingsReader } from './context';
import { buyAgain } from './reorder';
import { REORDER_SOURCE } from './reorder-pure';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const T0 = new Date('2026-11-05T06:00:00Z');
const visitor = (n: string) => `test-reorder-${n}-0000000000`;

describe.skipIf(!HAS_TEST_DB)('Buy again on PostgreSQL (PR 622)', () => {
  let t: TestDatabase;
  let S = 0;
  const clock = T0;
  const reorderOn = { ...registry['account.reorder'].default, enabled: true };
  const overrides = new Map<string, unknown>([['account.reorder', reorderOn]]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CartDeps => ({ db: t.prisma, settings, now: () => clock });
  const products: Record<string, ProductFact> = {};
  const variant = (slug: string, colour: string | null, size: string) => {
    const p = products[slug]!;
    const c = colour ? p.colours.find((x) => x.key === colour)!.id : null;
    const s = p.sizes.find((x) => x.label === size)!.id;
    return { ...p.variants.find((v) => v.colourId === c && v.sizeId === s)!, productId: p.id, name: p.nameEn, size: size as string | null };
  };
  let n = 0;
  type Line = { v: ReturnType<typeof variant>; quantity?: number; price?: number; comboId?: string; group?: string; addOn?: boolean };
  /** A past order of the browser `vis` with these lines (each at an old price unless given). */
  const order = async (vis: string, lines: Line[], status: 'DELIVERED' | 'PLACED' = 'DELIVERED') => {
    const number = `RO-${++n}`;
    const o = await t.prisma.order.create({
      data: { storeId: S, number, source: 'WEBSITE', currency: 'BDT', status, subtotalMinor: 1, totalMinor: 1, idempotencyKey: randomUUID(), placedAt: T0, customerName: 'Test Customer', visitorId: vis },
      select: { id: true },
    });
    for (const l of lines)
      await t.prisma.orderItem.create({
        data: { storeId: S, orderId: o.id, variantId: l.v.id, productId: l.v.productId, sku: l.v.id, productName: l.v.name, sizeLabel: l.v.size, quantity: l.quantity ?? 1, unitPriceMinor: l.price ?? 1_00, lineTotalMinor: l.price ?? 1_00, comboId: l.comboId ?? null, comboGroupKey: l.group ?? null, isAddOn: l.addOn ?? false },
      });
    return { id: o.id, number };
  };
  const bagLines = (cartId: string) => t.prisma.cartItem.findMany({ where: { cartId, removedAt: null }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    t = await createTestDatabase('reorder');
    S = (await seedSample(t.prisma)).storeId;
    await seedSampleCombos({ db: t.prisma, settings, now: () => clock });
    const ids = (await t.prisma.product.findMany({ where: { storeId: S }, select: { id: true } })).map((p) => p.id);
    for (const p of (await productFacts({ db: t.prisma, settings }, S, ids)).values()) products[p.slug] = p;
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('the switch off, a state not offered, someone else\'s order: refused, nothing goes in', async () => {
    const vis = visitor('a');
    const { cartId } = await openBag(deps(), { storeId: S, visitorId: vis });
    const v = variant('oxford-cotton-shirt', 'sky', 'M');
    const done = await order(vis, [{ v }]);
    const open = await order(vis, [{ v }], 'PLACED');
    overrides.set('account.reorder', registry['account.reorder'].default);
    expect(await code(buyAgain(deps(), { storeId: S, cartId, number: done.number, visitorId: vis, customerId: null }))).toBe('NOT_OFFERED');
    overrides.set('account.reorder', reorderOn);
    expect(await code(buyAgain(deps(), { storeId: S, cartId, number: open.number, visitorId: vis, customerId: null }))).toBe('NOT_OFFERED');
    // another browser, a customer it is not his, no one at all, a number that does not exist
    expect(await code(buyAgain(deps(), { storeId: S, cartId, number: done.number, visitorId: visitor('x'), customerId: randomUUID() }))).toBe('NOT_FOUND');
    expect(await code(buyAgain(deps(), { storeId: S, cartId, number: done.number, visitorId: null, customerId: null }))).toBe('NOT_FOUND');
    expect(await code(buyAgain(deps(), { storeId: S, cartId, number: 'RO-none', visitorId: vis, customerId: null }))).toBe('NOT_FOUND');
    expect(await bagLines(cartId)).toHaveLength(0);
  });

  it("today's price; a sold-out size with the sizes in stock; a product off sale named; add-ons and gifts left out; two taps are one", async () => {
    const vis = visitor('b');
    const { cartId } = await openBag(deps(), { storeId: S, visitorId: vis });
    const shirt = variant('oxford-cotton-shirt', 'sky', 'M');
    const sold = variant('oxford-cotton-shirt', 'sky', 'L');
    const slugs = Object.keys(products).filter((s) => s !== 'oxford-cotton-shirt' && products[s]!.variants.some((v) => v.sellable > 0 && v.priceMinor !== null));
    const offSlug = slugs[0]!;
    const offP = products[offSlug]!;
    const offV = offP.variants.find((v) => v.sellable > 0)!;
    const off = { ...offV, productId: offP.id, name: offP.nameEn, size: null };
    const gift = variant('oxford-cotton-shirt', 'sky', 'S');
    const past = await order(vis, [{ v: shirt, price: 1 }, { v: sold }, { v: off }, { v: gift, price: 0 }, { v: gift, addOn: true }]);
    await t.prisma.stockLevel.updateMany({ where: { variantId: sold.id }, data: { available: 0 } });
    await t.prisma.product.update({ where: { id: off.productId }, data: { status: 'DRAFT' } });
    try {
      const r = await buyAgain(deps(), { storeId: S, cartId, number: past.number, visitorId: vis, customerId: null });
      expect(r).toMatchObject({ number: past.number, pieces: 1, sets: 0, again: false });
      expect(r.soldOut).toHaveLength(1);
      expect(r.soldOut[0]).toMatchObject({ size: 'L', productId: sold.productId });
      expect(r.soldOut[0]!.inStock).toContain('M');
      expect(r.soldOut[0]!.inStock).not.toContain('L');
      expect(r.gone.map((g) => g.productId)).toEqual([off.productId]);
      const lines = await bagLines(cartId);
      expect(lines.map((l) => [l.variantId, l.quantity, l.unitPriceMinor, l.source])).toEqual([[shirt.id, 1, shirt.priceMinor, REORDER_SOURCE]]);
      expect((await t.prisma.cart.findUniqueOrThrow({ where: { id: cartId } })).reorderFromOrderId).toBe(past.id);
      // the same tap again: nothing more
      expect(await buyAgain(deps(), { storeId: S, cartId, number: past.number, visitorId: vis, customerId: null })).toMatchObject({ again: true, pieces: 0, inBag: 1 });
      expect(await bagLines(cartId)).toHaveLength(1);
    } finally {
      await t.prisma.product.update({ where: { id: off.productId }, data: { status: 'PUBLISHED' } });
    }
  });

  it('a set comes back as its set while it is offered, as its pieces once it is not', async () => {
    const sum = await setSummary({ db: t.prisma, settings, now: () => clock }, { storeId: S, slug: 'sample-polo-chino-set' });
    const combo = await t.prisma.combo.findFirstOrThrow({ where: { storeId: S, slug: 'sample-polo-chino-set' }, select: { id: true, status: true } });
    const pieceVariants = await t.prisma.productVariant.findMany({
      where: { storeId: S, OR: sum.pieces.map((p) => ({ productId: p.productId, colourId: p.defaultColourId, sizeId: p.openSizes[p.defaultColourId!]![0]! })) },
      select: { id: true, productId: true },
    });
    const pieces = sum.pieces.map((p) => pieceVariants.find((v) => v.productId === p.productId)!);
    const lines = pieces.map((v) => ({ v: { ...v, name: 'Set piece', size: null, colourId: null, sizeId: null, priceMinor: 1, sellable: 1 }, comboId: combo.id, group: 'set-old' }));
    const vis = visitor('c');
    const past = await order(vis, lines);
    const first = await openBag(deps(), { storeId: S, visitorId: vis });
    expect(await buyAgain(deps(), { storeId: S, cartId: first.cartId, number: past.number, visitorId: vis, customerId: null })).toMatchObject({ sets: 1, pieces: pieces.length });
    const asSet = await bagLines(first.cartId);
    expect(asSet.every((l) => l.comboId === combo.id && l.comboGroupKey && l.source === REORDER_SOURCE)).toBe(true);

    await t.prisma.combo.update({ where: { id: combo.id }, data: { status: 'ENDED' } });
    try {
      const vis2 = visitor('d');
      const past2 = await order(vis2, lines);
      const second = await openBag(deps(), { storeId: S, visitorId: vis2 });
      expect(await buyAgain(deps(), { storeId: S, cartId: second.cartId, number: past2.number, visitorId: vis2, customerId: null })).toMatchObject({ sets: 0, pieces: pieces.length });
      const loose = await bagLines(second.cartId);
      expect(loose.map((l) => l.variantId).sort()).toEqual(pieces.map((p) => p.id).sort());
      expect(loose.every((l) => l.comboId === null && l.comboGroupKey === null && l.source === REORDER_SOURCE)).toBe(true);
    } finally {
      await t.prisma.combo.update({ where: { id: combo.id }, data: { status: combo.status } });
    }
  });
});
