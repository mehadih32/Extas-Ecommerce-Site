// PR 180 follow-up 436 — "Parcels printed, waiting for the rider's handover" in "Needs you now": a booked parcel the
// courier has not picked up, its sticker printed, its order not handed over (an open handover sheet's too), oldest by
// booking; never an unprinted, picked-up, handed-over, cancelled, exchange or archived one, nor another store's. A line
// under Delivery for those who may open the packing pages, never in a badge. On a throwaway PostgreSQL (skipped
// without TEST_DATABASE_ADMIN_URL). Made-up test values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { badgesFrom, countQueues, QUEUES, visibleQueues, type QueueDeps } from './queues';
import type { ShellViewer } from './sections';

describe.skipIf(!HAS_TEST_DB)('follow-up 436 · parcels waiting for the handover (PostgreSQL)', () => {
  let t: TestDatabase;
  let deps: QueueDeps;
  let S = 0;
  let other = 0;
  const now = new Date('2026-11-06T10:00:00.000Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  let n = 0;
  const couriers = new Map<number, string>();
  async function parcel(storeId: number, o: { status?: 'IN_REVIEW' | 'PENDING_PICKUP' | 'PICKED_UP' | 'CANCELLED'; printed?: number; bookedAt?: Date; handed?: boolean; archived?: boolean; exchange?: boolean } = {}) {
    n += 1;
    if (!couriers.has(storeId)) couriers.set(storeId, (await t.prisma.courierAccount.create({ data: { storeId, providerKey: 'mock', name: 'Test courier', enabled: true } })).id);
    const order = await t.prisma.order.create({
      data: {
        storeId,
        number: `HQ-${n}`,
        status: o.handed ? 'HANDED_OVER' : 'PACKED',
        source: 'WEBSITE',
        currency: 'BDT',
        placedAt: hoursAgo(30),
        customerName: 'Test Customer',
        phone: '+8801700000436', // hardcode-ok: a made-up test number
        shippingAddressText: 'House 4, Road 5, Sample Area',
        subtotalMinor: 100_000,
        totalMinor: 100_000,
        codAmountMinor: 100_000,
        paymentMethod: 'COD',
        idempotencyKey: `hq-${n}`,
        ...(o.handed ? { handedOverAt: hoursAgo(1) } : {}),
        ...(o.archived ? { archivedAt: hoursAgo(1) } : {}),
      },
      select: { id: true },
    });
    await t.prisma.shipment.create({
      data: { storeId, orderId: order.id, courierAccountId: couriers.get(storeId)!, consignmentId: `CN-436-${n}`, status: o.status ?? 'PENDING_PICKUP', bookedAt: o.bookedAt ?? hoursAgo(2), labelPrintCount: o.printed ?? 1, idempotencyKey: `hq-ship-${n}`, isExchangeLeg: o.exchange ?? false },
    });
  }

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_q436');
    [S, other] = await seedSampleStores(t.prisma);
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, settings: { value: (key: string, scope?: { storeId?: number | null }) => resolver.value(key as never, scope as never) }, now: () => now };
    await parcel(S, { bookedAt: hoursAgo(5) });
    await parcel(S, { status: 'IN_REVIEW', printed: 2, bookedAt: hoursAgo(3) });
    await parcel(S, { printed: 0, bookedAt: hoursAgo(9) }); // not printed yet: the print page's work
    await parcel(S, { status: 'PICKED_UP', bookedAt: hoursAgo(20) });
    await parcel(S, { status: 'CANCELLED', bookedAt: hoursAgo(20) });
    await parcel(S, { handed: true, bookedAt: hoursAgo(20) });
    await parcel(S, { archived: true, bookedAt: hoursAgo(20) });
    await parcel(S, { exchange: true, bookedAt: hoursAgo(20) });
    await parcel(other, { bookedAt: hoursAgo(40) });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('a Delivery line for those who may open the packing pages, never in a badge', () => {
    expect(QUEUES.find((q) => q.id === 'handoverWaiting')).toMatchObject({ perm: 'fulfilment.read', href: '/admin/orders/packing/handover', section: 'orders', badge: false, group: 'delivery' });
  });

  it('counts printed parcels still with us and not handed over, oldest by booking, this store only', async () => {
    const counts = await countQueues(deps, S);
    expect(counts.find((c) => c.id === 'handoverWaiting')).toEqual({ id: 'handoverWaiting', n: 2, oldest: hoursAgo(5).toISOString() });
    const packer: ShellViewer = { owner: false, perms: new Set(['fulfilment.read']) };
    const agent: ShellViewer = { owner: false, perms: new Set(['support.read']) };
    expect(visibleQueues(counts, packer).map((r) => r.id)).toContain('handoverWaiting');
    expect(visibleQueues(counts, agent).map((r) => r.id)).not.toContain('handoverWaiting');
    expect(badgesFrom(visibleQueues(counts, packer)).orders ?? 0).toBe(0);
    expect((await countQueues(deps, other)).find((c) => c.id === 'handoverWaiting')?.n).toBe(1);
  });
});
