// PR 525 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the courier's "Delivered" beside what really happened — by the courier's delivered moment, store-wide and for one
// customer, archived orders and other stores left out. The rows are written straight into the tables; every value is a
// made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { deliveryTruth, returnReasons } from './delivery';

describe.skipIf(!HAS_TEST_DB)('delivery truth on PostgreSQL (PR 525)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let n = 0;
  let customerId = '';
  const courier: Record<number, string> = {};
  const day = (d: string) => new Date(`${d}T06:00:00Z`);
  const P = { from: day('2026-10-01'), to: day('2026-11-01') };

  async function parcel(o: { store?: number; delivered: Date; resolution?: 'DELIVERED' | 'CHARGE_PAID_RETURN' | 'RETURNED' | 'OPEN'; charge?: number; customerId?: string; archived?: boolean }) {
    n += 1;
    const storeId = o.store ?? A;
    const order = await t.prisma.order.create({
      data: { storeId, number: `D525-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: o.delivered, deliveredAt: o.delivered, subtotalMinor: 100_000, totalMinor: 106_000, deliveryChargeMinor: 6_000, paymentMethod: 'COD', idempotencyKey: `d525-${n}`, customerId: o.customerId ?? null, archivedAt: o.archived ? o.delivered : null }, // hardcode-ok: made-up test amounts
    });
    const s = await t.prisma.shipment.create({ data: { storeId, orderId: order.id, courierAccountId: courier[storeId]!, status: 'DELIVERED', deliveredAt: o.delivered, codAmountMinor: 106_000, idempotencyKey: `d525-s-${n}` } }); // hardcode-ok: made-up test amount
    if (o.resolution) {
      const r = o.resolution;
      const open = r === 'OPEN';
      await t.prisma.deliveryCheck.create({ data: { storeId, orderId: order.id, shipmentId: s.id, customerId: o.customerId ?? null, courierClaim: 'DELIVERED', signals: ['CHARGE_ONLY'], state: r === 'OPEN' ? 'OPEN' : 'RESOLVED', resolution: r === 'OPEN' ? null : r } });
      if (!open && r !== 'DELIVERED') await t.prisma.returnRecord.create({ data: { storeId, orderId: order.id, shipmentId: s.id, kind: o.resolution === 'CHARGE_PAID_RETURN' ? 'CHARGE_PAID_RETURN' : 'REFUSED_AT_DOOR', courierClaim: 'DELIVERED', actualOutcome: o.resolution, mismatch: true, chargePaidMinor: o.charge ?? 0 } });
    }
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics_delivery');
    [A, B] = await seedSampleStores(t.prisma);
    for (const s of [A, B]) courier[s] = (await t.prisma.courierAccount.create({ data: { storeId: s, providerKey: 'mockCourier', name: `Sample courier ${s}`, enabled: true } })).id;
    const c = await t.prisma.customer.create({ data: { storeId: A, phone: '+8801700005251', name: 'Sample customer' } }); // hardcode-ok: a made-up test number
    await parcel({ delivered: day('2026-10-05') });
    await parcel({ delivered: day('2026-10-06'), resolution: 'OPEN' });
    await parcel({ delivered: day('2026-10-07'), resolution: 'DELIVERED' });
    await parcel({ delivered: day('2026-10-08'), resolution: 'CHARGE_PAID_RETURN', charge: 6_000, customerId: c.id });
    await parcel({ delivered: day('2026-10-09'), resolution: 'RETURNED', customerId: c.id });
    // outside the period, archived, another store: never counted
    await parcel({ delivered: day('2026-09-30'), resolution: 'RETURNED' });
    await parcel({ delivered: day('2026-10-10'), resolution: 'RETURNED', archived: true });
    await parcel({ store: B, delivered: day('2026-10-10'), resolution: 'RETURNED' });
    customerId = c.id;
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('counts what the courier claimed beside what really happened', async () => {
    expect(await deliveryTruth(t.prisma, A, P)).toEqual({ courierDelivered: 5, checked: 4, open: 1, confirmedDelivered: 1, chargePaidReturns: 1, returned: 1, chargePaidMinor: 6_000 });
  });

  it('for one customer, and an empty period is all zeros', async () => {
    expect(await deliveryTruth(t.prisma, A, P, { customerId })).toMatchObject({ courierDelivered: 2, checked: 2, chargePaidReturns: 1, returned: 1 });
    expect(await deliveryTruth(t.prisma, A, { from: day('2025-01-01'), to: day('2025-02-01') })).toEqual({ courierDelivered: 0, checked: 0, open: 0, confirmedDelivered: 0, chargePaidReturns: 0, returned: 0, chargePaidMinor: 0 });
    await expect(deliveryTruth(t.prisma, A, { from: P.to, to: P.from })).rejects.toThrow(RangeError);
  });

  it('PR 526: why parcels came back — by reason (most first) and by kind, for one customer, an empty period all zeros', async () => {
    const recs = await t.prisma.returnRecord.findMany({ where: { storeId: A }, orderBy: { createdAt: 'asc' }, select: { id: true, orderId: true } });
    const orders = await t.prisma.order.findMany({ where: { id: { in: recs.map((r) => r.orderId) } }, select: { id: true, placedAt: true } });
    const at = new Map(orders.map((o) => [o.id, o.placedAt]));
    // each record dated by its order's day; two of them get the same reason
    for (const [i, r] of recs.entries()) await t.prisma.returnRecord.update({ where: { id: r.id }, data: { createdAt: at.get(r.orderId)!, reasonCode: i === 0 ? 'size-fit' : i === 1 ? 'did-not-like' : 'size-fit' } });
    const all = await returnReasons(t.prisma, A, P);
    // in the period, not archived: the charge-paid return (10-08) and the plain return (10-09)
    expect(all).toEqual({ total: 2, withReason: 2, byReason: [{ key: 'did-not-like', count: 1 }, { key: 'size-fit', count: 1 }], byKind: { CHARGE_PAID_RETURN: 1, REFUSED_AT_DOOR: 1 } });
    expect(await returnReasons(t.prisma, A, P, { customerId })).toMatchObject({ total: 2 });
    expect(await returnReasons(t.prisma, A, { from: day('2026-09-01'), to: P.to })).toMatchObject({ total: 3, withReason: 3, byReason: [{ key: 'size-fit', count: 2 }, { key: 'did-not-like', count: 1 }] });
    expect(await returnReasons(t.prisma, A, { from: day('2025-01-01'), to: day('2025-02-01') })).toEqual({ total: 0, withReason: 0, byReason: [], byKind: {} });
    await expect(returnReasons(t.prisma, A, { from: P.to, to: P.from })).rejects.toThrow(RangeError);
  });
});
