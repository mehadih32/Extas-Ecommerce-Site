// S28 · PR 689 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the restock verdict and the unsold list, the
// sales by weekday and hour with the discount given, saved views and pins (archived, never deleted), reports.read needed,
// another store never read.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { listSchedules, saveSchedule, archiveView, listPins, listViews, restockReport, salesByTime, saveView, setPin, type CatalogueDeps, type SettingsReader, type Who } from '../src';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('report library on PostgreSQL (PR 689)', () => {
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
  const deps = (): CatalogueDeps => ({
    db: t.prisma,
    settings,
    now: () => clock,
    sellable: async (variantIds) => new Map((await t.prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, inStock: true } })).map((v) => [v.id, v.inStock ? 3 : 0])),
  });
  const sys = (storeId = A): Who => ({ actor: SYSTEM, storeId });
  let reader: Actor;
  let stranger: Actor;
  let n = 0;
  const ids: Record<string, string> = {};

  async function product(storeId: number, name: string, o: { sizes: boolean[]; sold: number; views: number; days?: number; price?: number; cost?: number | null }) {
    n += 1;
    const p = await t.prisma.product.create({ data: { storeId, slug: `rl-${n}`, nameEn: name, status: 'PUBLISHED', publishedAt: new Date(clock.getTime() - (o.days ?? 10) * 86_400_000) } });
    const vs = [];
    for (const [i, inStock] of o.sizes.entries())
      vs.push(
        await t.prisma.productVariant.create({
          data: { storeId, productId: p.id, sku: `RL-${n}-${i}`, priceMinor: o.price ?? 100_000, avgCostMinor: o.cost === undefined ? 60_000 : o.cost, active: true, inStock },
        }),
      );
    if (o.sold > 0) {
      const order = await t.prisma.order.create({
        data: {
          storeId,
          number: `RL-${n}`,
          source: 'WEBSITE',
          currency: 'BDT',
          status: 'DELIVERED',
          placedAt: new Date(clock.getTime() - 5 * 86_400_000),
          subtotalMinor: 1,
          totalMinor: 1,
          discountMinor: o.sold > 5 ? 500 : 0,
          couponCode: o.sold > 5 ? 'EID' : null,
          paymentMethod: 'COD',
          idempotencyKey: `rl-${n}`,
        },
      });
      await t.prisma.orderItem.create({
        data: { storeId, orderId: order.id, productId: p.id, variantId: vs[0]!.id, sku: vs[0]!.sku, productName: name, quantity: o.sold, unitPriceMinor: 1, lineTotalMinor: o.sold },
      });
    }
    for (let i = 0; i < o.views; i += 1)
      await t.prisma.analyticsEvent.create({
        data: { storeId, name: 'product_view', visitorId: `v${n}-${i}`, isLoggedIn: false, productId: p.id, occurredAt: new Date(clock.getTime() - 86_400_000) },
      });
    ids[name] = p.id;
    return p.id;
  }

  beforeAll(async () => {
    t = await createTestDatabase('replib');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 'reader', nameEn: 'r', nameBn: 'r', permissions: ['reports.read'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'reader@example.com', displayName: 'r', passwordHash: 'x' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
    reader = { staffUserId: u.id };
    const nobody = await t.prisma.staffUser.create({ data: { email: 'nobody@example.com', displayName: 'n', passwordHash: 'x' } });
    stranger = { staffUserId: nobody.id };
    await product(A, 'Gap polo', { sizes: [true, false, false], sold: 20, views: 4 });
    await product(A, 'Fine polo', { sizes: [true, true, true], sold: 8, views: 4 });
    await product(A, 'Old tee', { sizes: [true, true], sold: 0, views: 0, days: 120 });
    await product(A, 'New tee', { sizes: [true, true], sold: 0, views: 0, days: 5 });
    await product(B, 'Other store gap', { sizes: [true, false], sold: 9, views: 1 });
  });
  afterAll(async () => t?.drop());

  it('lists the styles to restock and the ones sitting unsold, and not the rest', async () => {
    const r = await restockReport(deps(), sys(A));
    expect(r.restock.map((x) => x.name)).toEqual(['Gap polo']);
    expect(r.unsold.map((x) => x.name)).toEqual(['Old tee']);
  });

  it('needs reports.read, and reads only its own store', async () => {
    expect(await code(restockReport(deps(), { actor: stranger, storeId: A }))).toBe('FORBIDDEN');
    expect((await restockReport(deps(), { actor: reader, storeId: A })).restock).toHaveLength(1);
    expect((await restockReport(deps(), sys(B))).restock.map((x) => x.name)).toEqual(['Other store gap']);
  });

  it('counts orders by weekday and hour in the shop time and totals the discount given', async () => {
    const r = await salesByTime(deps(), sys(A), { from: '2026-11-01', to: '2026-11-13' });
    expect(r.orders).toBe(2);
    expect(r.weekday.reduce((a, b) => a + b, 0)).toBe(2);
    expect(r.hour.reduce((a, b) => a + b, 0)).toBe(2);
    expect(r.discountMinor).toBe(1000);
    expect(r.couponOrders).toBe(2);
  });

  it('saves, lists and archives a view (never deleted); a bad one is refused', async () => {
    const v = await saveView(deps(), sys(A), { reportKey: 'sales', name: 'Eid week', params: { preset: 'last7', compare: true, filters: {} } });
    expect((await listViews(deps(), sys(A))).map((x) => x.name)).toEqual(['Eid week']);
    expect(await listViews(deps(), sys(B))).toEqual([]);
    expect(await code(saveView(deps(), sys(A), { reportKey: 'pin', name: 'x', params: { preset: 'today', compare: false, filters: {} } }))).toBe('INVALID_INPUT');
    await archiveView(deps(), sys(A), v.id);
    expect(await listViews(deps(), sys(A))).toEqual([]);
    expect(await t.prisma.reportView.count({ where: { storeId: A } })).toBe(1);
    expect(await code(archiveView(deps(), sys(A), v.id))).toBe('NOT_FOUND');
  });

  it('pins and unpins a card on Home, once each', async () => {
    expect(await setPin(deps(), sys(A), 'sales', true)).toEqual(['sales']);
    expect(await setPin(deps(), sys(A), 'sales', true)).toEqual(['sales']);
    expect(await setPin(deps(), sys(A), 'profit', true)).toEqual(['sales', 'profit']);
    expect(await setPin(deps(), sys(A), 'sales', false)).toEqual(['profit']);
    expect(await listPins(deps(), sys(B))).toEqual([]);
    expect(await code(setPin(deps(), sys(A), 'Bad Id', true))).toBe('INVALID_INPUT');
  });

  it('schedules: off as shipped, saved per pack, needs a place to go, never crosses stores', async () => {
    expect((await listSchedules(deps(), sys(A))).every((x) => !x.enabled)).toBe(true);
    const rows = await saveSchedule(deps(), sys(A), { pack: 'bank', frequency: 'monthly', channels: ['telegram'], enabled: true });
    expect(rows.find((x) => x.pack === 'bank')).toMatchObject({ enabled: true, frequency: 'monthly', channels: ['telegram'] });
    expect(await code(saveSchedule(deps(), sys(A), { pack: 'bank', frequency: 'weekly', channels: [], enabled: true }))).toBe('INVALID_INPUT');
    await saveSchedule(deps(), sys(A), { pack: 'bank', frequency: 'weekly', channels: ['telegram', 'email'], enabled: false });
    expect((await listSchedules(deps(), sys(A))).find((x) => x.pack === 'bank')).toMatchObject({ enabled: false, frequency: 'weekly' });
    expect((await listSchedules(deps(), sys(B))).every((x) => !x.enabled)).toBe(true);
    expect(await code(listSchedules(deps(), { actor: stranger, storeId: A }))).toBe('FORBIDDEN');
  });
});
