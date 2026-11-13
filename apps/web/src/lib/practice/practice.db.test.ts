// S28 · PR 706 (CN-049) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the practice data seeder is
// deterministic and idempotent, makes 80-100 orders over six months in every status, flags every row it makes, writes
// nothing that could leave the system (no ERP push, message, stock row, reservation), and "Reset practice data"
// removes only practice rows: a real order with its timeline, a product the owner uploaded and a demo product stay,
// and the demo product goes only when asked. A practice flag can never be switched on for a real record.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB, createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { PRACTICE_PHONE_PREFIX } from '@extas/db/client';
import { seedPractice } from './seed';
import { practiceCounts, resetPractice } from './reset';

const NOW = new Date('2026-11-13T08:00:00Z');
const DAY = 86_400_000;

describe.skipIf(!HAS_TEST_DB)('practice data on PostgreSQL (PR 706, CN-049)', () => {
  let t: TestDatabase;
  let S = 0;
  let realOrderId = '';
  let realProductId = '';
  let demoProductId = '';
  let hasDemo = false;

  beforeAll(async () => {
    t = await createTestDatabase('practice');
    [S] = await seedSampleStores(t.prisma);
    const db = t.prisma;
    // real records that a reset must never touch
    const cust = await db.customer.create({
      data: { storeId: S, phone: '+8801700009999', name: 'Real Customer' },
    });
    const order = await db.order.create({
      data: {
        storeId: S,
        number: 'EX-1',
        status: 'CONFIRMED',
        source: 'WEBSITE',
        currency: 'BDT',
        subtotalMinor: 1000,
        totalMinor: 1000,
        idempotencyKey: 'real-1',
        customerId: cust.id,
      },
    });
    realOrderId = order.id;
    await db.orderEvent.create({
      data: {
        storeId: S,
        orderId: order.id,
        type: 'order.placed',
        toStatus: 'PLACED',
        actorType: 'CUSTOMER',
        source: 'website',
      },
    });
    realProductId = (
      await db.product.create({
        data: {
          storeId: S,
          slug: 'my-own-shirt',
          nameEn: 'My own shirt',
          status: 'PUBLISHED',
        },
      })
    ).id;
    // PR 684 (branch w4a) adds Product.isDemo; the reset must cope with it being there or not
    await db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isDemo" boolean NOT NULL DEFAULT false');
    demoProductId = (
      await db.product.create({
        data: {
          storeId: S,
          slug: 'demo-tee',
          nameEn: 'Demo tee',
          status: 'DRAFT',
        },
      })
    ).id;
    await db.$executeRawUnsafe(`UPDATE "Product" SET "isDemo" = true WHERE "id" = '${demoProductId}'::uuid`);
    hasDemo = true;
  }, 180_000);
  afterAll(async () => t?.drop());

  it('fills the prototype world: 80-100 orders over six months in every status, courier payouts, claims and incomplete orders', async () => {
    const r = await seedPractice(t.prisma, S, NOW);
    expect(r.seeded).toBe(true);
    const orders = await t.prisma.order.findMany({
      where: { storeId: S, isPractice: true },
      include: { shipments: true },
    });
    expect(orders.length).toBeGreaterThanOrEqual(80);
    expect(orders.length).toBeLessThanOrEqual(100);
    // every status the prototype shows
    const statuses = new Set(orders.map((o) => o.status));
    for (const s of ['PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED', 'ON_HOLD', 'AWAITING_ADVANCE'] as const)
      expect(statuses.has(s), s).toBe(true);
    expect(
      orders.some((o) => o.status === 'CONFIRMED' && o.shipments.length > 0),
      'Booked',
    ).toBe(true);
    expect(
      orders.some((o) => o.status === 'DELIVERED' && o.paidMinor === o.totalMinor),
      'Paid',
    ).toBe(true);
    expect(
      orders.some((o) => o.status === 'DELIVERED' && o.paidMinor === 0),
      'Delivered, not paid',
    ).toBe(true);
    // spread over about six months, never in the future
    const oldest = Math.min(...orders.map((o) => o.placedAt.getTime()));
    expect((NOW.getTime() - oldest) / DAY).toBeGreaterThan(150);
    expect((NOW.getTime() - oldest) / DAY).toBeLessThanOrEqual(185);
    expect(orders.every((o) => o.placedAt <= NOW)).toBe(true);
    const c = await practiceCounts(t.prisma, S);
    expect(c).toMatchObject({
      customers: 60,
      incomplete: 18,
      claims: 6,
      couriers: 3,
    });
    expect(c.payouts).toBeGreaterThan(5);
    expect(c.products).toBe(20);
    const claimStates = new Set((await t.prisma.courierClaim.findMany({ where: { storeId: S } })).map((x) => x.status));
    expect([...claimStates].sort()).toEqual(['OPEN', 'REJECTED', 'SENT', 'SETTLED']);
  });

  it('flags every row it makes, and a practice order has its lines, timeline and a parcel only when booked', async () => {
    const q = (table: string, flagged = 'true') =>
      t.prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}" WHERE "storeId" = ${S} AND "isPractice" = ${flagged}`).then((r) => r[0]!.n);
    for (const table of ['Order', 'Customer', 'Shipment', 'Payment', 'CourierSettlement', 'CourierClaim', 'CheckoutDraft', 'CourierAccount', 'Product'])
      expect(await q(table), table).toBeGreaterThan(0);
    // the only unflagged rows are the real ones made in beforeAll
    expect(await q('Order', 'false')).toBe(1);
    expect(await q('Customer', 'false')).toBe(1);
    // lines and events hang on practice orders only
    const stray = await t.prisma.orderItem.count({
      where: { storeId: S, order: { isPractice: false } },
    });
    expect(stray).toBe(0);
    expect(
      await t.prisma.orderEvent.count({
        where: { storeId: S, order: { isPractice: true } },
      }),
    ).toBeGreaterThan(90);
    // the settlement lines add up to the payout
    const s = await t.prisma.courierSettlement.findFirstOrThrow({
      where: { storeId: S, isPractice: true },
      include: { lines: true },
    });
    expect(s.lines.reduce((n, l) => n + l.codMinor, 0)).toBe(s.totalCodMinor);
    expect(s.netMinor).toBe(s.totalCodMinor - s.chargesMinor);
  });

  it('never leaves the system by construction: no ERP push, no message, no stock row, no reservation, no gateway; phones are unreachable; products are drafts', async () => {
    const db = t.prisma;
    expect(await db.erpPush.count()).toBe(0);
    expect(await db.notificationLog.count()).toBe(0);
    expect(await db.stockReservation.count()).toBe(0);
    expect(await db.stockMovement.count()).toBe(0);
    expect(await db.stockLevel.count()).toBe(0);
    expect(await db.trackedEvent.count()).toBe(0);
    expect((await db.payment.findMany({ where: { storeId: S, isPractice: true } })).every((p) => p.status === 'PAID')).toBe(true);
    const phones = [
      ...(await db.customer.findMany({
        where: { storeId: S, isPractice: true },
        select: { phone: true },
      })),
      ...(await db.order.findMany({
        where: { storeId: S, isPractice: true },
        select: { phone: true },
      })),
    ];
    expect(phones.every((p) => p.phone?.startsWith(PRACTICE_PHONE_PREFIX))).toBe(true);
    expect((await db.product.findMany({ where: { storeId: S, isPractice: true } })).every((p) => p.status === 'DRAFT')).toBe(true);
    expect(
      (
        await db.shipment.findMany({
          where: { storeId: S, isPractice: true },
        })
      ).every((p) => p.mode === 'MOCK' && p.consignmentId?.startsWith('PRACTICE-')),
    ).toBe(true);
    expect(
      (
        await db.courierAccount.findMany({
          where: { storeId: S, isPractice: true },
        })
      ).every((c) => !c.enabled),
    ).toBe(true);
  });

  it('is idempotent: seeding again writes nothing', async () => {
    const before = await practiceCounts(t.prisma, S);
    expect(await seedPractice(t.prisma, S, NOW)).toMatchObject({
      seeded: false,
      reason: 'already',
    });
    expect(await practiceCounts(t.prisma, S)).toEqual(before);
  });

  it('a practice flag can never be switched on for a real record, or off for a practice one', async () => {
    await expect(t.prisma.$executeRawUnsafe(`UPDATE "Order" SET "isPractice" = true WHERE "id" = '${realOrderId}'::uuid`)).rejects.toThrow(/practice flag/);
    await expect(t.prisma.$executeRawUnsafe(`UPDATE "Order" SET "isPractice" = false WHERE "storeId" = ${S} AND "isPractice" = true`)).rejects.toThrow(/practice flag/);
  });

  it("the history ledgers stay locked: the app role cannot delete a real order's timeline, and the purge function cannot reach it", async () => {
    const db = t.prisma;
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE extas_app');
        await tx.$executeRawUnsafe(`DELETE FROM "OrderEvent" WHERE "orderId" = '${realOrderId}'::uuid`);
      }),
    ).rejects.toThrow(/permission denied/i);
    await db.$queryRaw`SELECT extas_purge_practice_history(${S}::integer)`;
    expect(await db.orderEvent.count({ where: { orderId: realOrderId } })).toBe(1);
    // even with the purge switch on, the trigger refuses a real order's row
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('extas.practice_purge', 'on', true)`);
        await tx.$executeRawUnsafe(`DELETE FROM "OrderEvent" WHERE "orderId" = '${realOrderId}'::uuid`);
      }),
    ).rejects.toThrow(/append-only/);
  });

  it('reset removes every practice row and what hangs on it, and keeps the real order, his own product and the demo product', async () => {
    const r = await resetPractice(t.prisma, S);
    const c = await practiceCounts(t.prisma, S);
    expect(Object.values(c).every((n) => n === 0)).toBe(true);
    expect(r.removed.Order).toBeGreaterThanOrEqual(80);
    expect(await t.prisma.order.count({ where: { storeId: S } })).toBe(1);
    expect(await t.prisma.customer.count({ where: { storeId: S } })).toBe(1);
    expect(await t.prisma.orderItem.count({ where: { storeId: S } })).toBe(0);
    expect(await t.prisma.orderEvent.count({ where: { storeId: S } })).toBe(1);
    expect(await t.prisma.orderEvent.count({ where: { orderId: realOrderId } })).toBe(1);
    expect(await t.prisma.shipmentEvent.count()).toBe(0);
    expect(await t.prisma.courierSettlementLine.count()).toBe(0);
    expect(await t.prisma.courierAccount.count({ where: { storeId: S } })).toBe(0);
    expect(await t.prisma.productVariant.count({ where: { storeId: S } })).toBe(0);
    // his own product and the demo product are still there
    expect((await t.prisma.product.findUnique({ where: { id: realProductId } }))?.nameEn).toBe('My own shirt');
    expect(await t.prisma.product.findUnique({ where: { id: demoProductId } })).not.toBeNull();
    expect(r.removedDemoProducts).toBe(0);
    expect(r.keptProducts).toBe(2);
  });

  it('reseeds fresh after a reset (the same data again), and "Also remove demo products" removes the demo product and nothing else', async () => {
    expect(hasDemo).toBe(true);
    expect((await seedPractice(t.prisma, S, NOW)).seeded).toBe(true);
    const r = await resetPractice(t.prisma, S, { removeDemo: true });
    expect(r.removedDemoProducts).toBe(1);
    expect(await t.prisma.product.findUnique({ where: { id: demoProductId } })).toBeNull();
    expect((await t.prisma.product.findUnique({ where: { id: realProductId } }))?.nameEn).toBe('My own shirt');
    expect(await t.prisma.order.findUnique({ where: { id: realOrderId } })).not.toBeNull();
    expect(await t.prisma.product.count({ where: { storeId: S } })).toBe(1);
  });

  it('is deterministic: the same day gives the same orders (numbers, totals, statuses)', async () => {
    const shape = async () =>
      (
        await t.prisma.order.findMany({
          where: { storeId: S, isPractice: true },
          orderBy: { number: 'asc' },
          select: {
            number: true,
            status: true,
            totalMinor: true,
            placedAt: true,
          },
        })
      ).map((o) => `${o.number}|${o.status}|${o.totalMinor}|${o.placedAt.toISOString()}`);
    await seedPractice(t.prisma, S, NOW);
    const a = await shape();
    await resetPractice(t.prisma, S);
    await seedPractice(t.prisma, S, NOW);
    expect(await shape()).toEqual(a);
  });
});
