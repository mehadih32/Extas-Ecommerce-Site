// PR 183 follow-up 468 — "Packing cards open" and "Packing cards past the hours to decide" in "Needs you now": open
// packing cards of orders still in the list, oldest first; late = older than `fulfilment.packing.issues
// .decideWithinHours`; never a decided card, an archived order's or another store's. A line under Orders for those who
// may open the packing pages, never in a badge. On a throwaway PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL).
// Made-up test values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { badgesFrom, countQueues, QUEUES, visibleQueues, type QueueDeps } from './queues';
import type { ShellViewer } from './sections';

describe.skipIf(!HAS_TEST_DB)('follow-up 468 · open packing cards (PostgreSQL)', () => {
  let t: TestDatabase;
  let deps: QueueDeps;
  let S = 0;
  let other = 0;
  const now = new Date('2026-11-06T10:00:00.000Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  let n = 0;
  async function card(storeId: number, o: { at: Date; resolved?: boolean; archived?: boolean }) {
    n += 1;
    const order = await t.prisma.order.create({
      data: {
        storeId,
        number: `PC-${n}`,
        status: 'PACKED',
        source: 'WEBSITE',
        currency: 'BDT',
        placedAt: hoursAgo(90),
        customerName: 'Test Customer',
        phone: '+8801700000468', // hardcode-ok: a made-up test number
        shippingAddressText: 'House 4, Road 5, Sample Area',
        subtotalMinor: 100_000,
        totalMinor: 100_000,
        codAmountMinor: 100_000,
        paymentMethod: 'COD',
        idempotencyKey: `pc-${n}`,
        ...(o.archived ? { archivedAt: hoursAgo(1) } : {}),
      },
      select: { id: true },
    });
    await t.prisma.packingIssue.create({
      data: { storeId, orderId: order.id, orderItemId: order.id, kind: 'SHORTAGE', createdAt: o.at, ...(o.resolved ? { resolvedAt: hoursAgo(1), resolution: 'STOCK_FOUND' } : {}) },
    });
  }

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_q468');
    [S, other] = await seedSampleStores(t.prisma);
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, settings: { value: (key: string, scope?: { storeId?: number | null }) => resolver.value(key as never, scope as never) }, now: () => now };
    await card(S, { at: hoursAgo(60) }); // past the default 48 hours to decide
    await card(S, { at: hoursAgo(3) });
    await card(S, { at: hoursAgo(80), resolved: true });
    await card(S, { at: hoursAgo(70), archived: true });
    await card(other, { at: hoursAgo(5) });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('counts open cards and the late ones, oldest first, for those who may open packing; no badge', async () => {
    expect(QUEUES.find((q) => q.id === 'packingCards')).toMatchObject({ perm: 'fulfilment.read', href: '/admin/orders/packing', section: 'orders', badge: false, group: 'orders' });
    const counts = await countQueues(deps, S);
    expect(counts.find((c) => c.id === 'packingCards')).toEqual({ id: 'packingCards', n: 2, oldest: hoursAgo(60).toISOString() });
    expect(counts.find((c) => c.id === 'packingCardsLate')).toEqual({ id: 'packingCardsLate', n: 1, oldest: hoursAgo(60).toISOString() });
    const packer: ShellViewer = { owner: false, perms: new Set(['fulfilment.read']) };
    const agent: ShellViewer = { owner: false, perms: new Set(['support.read']) };
    expect(visibleQueues(counts, packer).map((r) => r.id)).toEqual(expect.arrayContaining(['packingCards', 'packingCardsLate']));
    expect(visibleQueues(counts, agent).map((r) => r.id)).not.toContain('packingCards');
    expect(badgesFrom(visibleQueues(counts, packer)).orders ?? 0).toBe(0);
    expect((await countQueues(deps, other)).find((c) => c.id === 'packingCards')?.n).toBe(1);
  });
});
