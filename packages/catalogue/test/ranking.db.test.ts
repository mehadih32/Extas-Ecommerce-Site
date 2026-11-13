// S28 · PR 686 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the nightly run writes the scores only
// (the shop's order is untouched) until the owner saves the order or turns "autoApply" on; pins hold; another store is never read.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { rankingView, saveRankingOrder, setRankPin, updateRankScores, type CatalogueDeps, type SettingsReader, type Who } from '../src';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('shop ranking on PostgreSQL (PR 686)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const clock = new Date('2026-11-13T08:00:00Z');
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const sys = (storeId = A): Who => ({ actor: SYSTEM, storeId });
  let reader: Actor;
  let n = 0;
  const ids: Record<string, string> = {};

  async function product(storeId: number, name: string, o: { sizes: boolean[]; sold: number; views: number; days?: number; price?: number; cost?: number | null }) {
    n += 1;
    const p = await t.prisma.product.create({ data: { storeId, slug: `rk-${n}`, nameEn: name, status: 'PUBLISHED', publishedAt: new Date(clock.getTime() - (o.days ?? 10) * 86_400_000) } });
    const vs = [];
    for (const [i, inStock] of o.sizes.entries()) vs.push(await t.prisma.productVariant.create({ data: { storeId, productId: p.id, sku: `RK-${n}-${i}`, priceMinor: o.price ?? 100_000, avgCostMinor: o.cost === undefined ? 60_000 : o.cost, active: true, inStock } }));
    if (o.sold > 0) {
      const order = await t.prisma.order.create({ data: { storeId, number: `RK-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date(clock.getTime() - 5 * 86_400_000), subtotalMinor: 1, totalMinor: 1, paymentMethod: 'COD', idempotencyKey: `rk-${n}` } });
      await t.prisma.orderItem.create({ data: { storeId, orderId: order.id, productId: p.id, variantId: vs[0]!.id, sku: vs[0]!.sku, productName: name, quantity: o.sold, unitPriceMinor: 1, lineTotalMinor: o.sold } });
    }
    for (let i = 0; i < o.views; i += 1) await t.prisma.analyticsEvent.create({ data: { storeId, name: 'product_view', visitorId: `v${n}-${i}`, isLoggedIn: false, productId: p.id, occurredAt: new Date(clock.getTime() - 86_400_000) } });
    ids[name] = p.id;
    return p.id;
  }
  const rank = async (name: string) => (await t.prisma.product.findUniqueOrThrow({ where: { id: ids[name]! } })).sortRank;

  beforeAll(async () => {
    t = await createTestDatabase('ranking');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 'reader', nameEn: 'r', nameBn: 'r', permissions: ['catalogue.read'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'reader@example.com', displayName: 'r', passwordHash: 'x' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
    reader = { staffUserId: u.id };
    await product(A, 'Best polo', { sizes: [true, true, true], sold: 20, views: 40 });
    await product(A, 'Gap polo', { sizes: [true, false, false], sold: 20, views: 40 });
    await product(A, 'Quiet tee', { sizes: [true, true], sold: 0, views: 3 });
    await product(A, 'No cost cap', { sizes: [true], sold: 1, views: 5, cost: null });
    await product(B, 'Other store', { sizes: [true], sold: 99, views: 99 });
  });
  afterAll(async () => t?.drop());

  it('the nightly run writes the scores only; the shop order stays until the owner saves it', async () => {
    const r = await updateRankScores(deps(), A);
    expect(r).toMatchObject({ products: 4, applied: false });
    const best = await t.prisma.product.findUniqueOrThrow({ where: { id: ids['Best polo']! } });
    const gap = await t.prisma.product.findUniqueOrThrow({ where: { id: ids['Gap polo']! } });
    expect(best.rankScore).toBeGreaterThan(gap.rankScore); // the sold-out sizes lowered the stock part by themselves
    expect(best.sortRank).toBe(0);
    expect(best.rankedAt).toBeNull();
  });

  it('"Save this order" puts the order on the shop: the first place gets the highest sortRank, rankPosition is kept', async () => {
    const v = await rankingView(deps(), sys());
    expect(v.rows[0]!.name).toBe('Best polo');
    expect(v.rows.every((x) => x.moved === null)).toBe(true);
    const out = await saveRankingOrder(deps(), sys());
    expect(out.products).toBe(4);
    expect(await rank('Best polo')).toBe(4);
    expect(await rank('No cost cap')).toBeLessThanOrEqual(2);
    const row = await t.prisma.product.findUniqueOrThrow({ where: { id: ids['Best polo']! } });
    expect(row.rankPosition).toBe(1);
    expect(row.rankedAt).toEqual(clock);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: ids['Other store']! } })).sortRank).toBe(0);
  });

  it('a pin holds against the score, and the screen shows how far a product moved since the saved order', async () => {
    await setRankPin(deps(), sys(), ids['Quiet tee']!, 'TOP');
    const v = await rankingView(deps(), sys());
    expect(v.rows[0]).toMatchObject({ name: 'Quiet tee', pin: 'TOP', moved: expect.any(Number) });
    expect(v.rows[0]!.moved).toBeGreaterThan(0);
    await saveRankingOrder(deps(), sys());
    expect(await rank('Quiet tee')).toBe(4);
    await setRankPin(deps(), sys(), ids['Quiet tee']!, 'DOWN');
    await saveRankingOrder(deps(), sys());
    expect(await rank('Quiet tee')).toBe(1);
    await setRankPin(deps(), sys(), ids['Quiet tee']!, null);
  });

  it('tries other weights without saving anything', async () => {
    const before = await rank('Best polo');
    const v = await rankingView(deps(), sys(), { sales: 0, conv: 0, margin: 0, stock: 0, fresh: 10 });
    expect(v.settings.weights.fresh).toBe(10);
    expect(await rank('Best polo')).toBe(before);
  });

  it('with autoApply on the nightly run puts the order on the shop itself', async () => {
    overrides.set('shop.ranking', { ...registry['shop.ranking'].default, autoApply: true });
    await t.prisma.product.updateMany({ where: { storeId: A }, data: { sortRank: 0 } });
    const r = await updateRankScores(deps(), A);
    expect(r.applied).toBe(true);
    expect(await rank('Best polo')).toBe(4);
    overrides.delete('shop.ranking');
  });

  it('needs the permission: a reader may look but not save or pin; an unknown product is not found; another store is never touched', async () => {
    expect(await code(rankingView(deps(), { actor: reader, storeId: A }))).toBe('ok');
    expect(await code(saveRankingOrder(deps(), { actor: reader, storeId: A }))).not.toBe('ok');
    expect(await code(setRankPin(deps(), { actor: reader, storeId: A }, ids['Best polo']!, 'TOP'))).not.toBe('ok');
    expect(await code(setRankPin(deps(), sys(), ids['Other store']!, 'TOP'))).toBe('NOT_FOUND');
    expect(await code(setRankPin(deps(), sys(), ids['Best polo']!, 'SIDE' as never))).toBe('INVALID_INPUT');
  });
});
