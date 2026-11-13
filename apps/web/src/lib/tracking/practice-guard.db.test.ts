// S28 · PR 706 (CN-049) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a practice order's events never reach
// an ad platform or a conversion feed. Recording refuses it; a waiting one stops waiting and is not counted as sent; a
// real order's waiting event is picked up as before. Sample values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { recordEvent, sendEvents, type TrackingDeps } from './service';

describe.skipIf(!HAS_TEST_DB)('practice orders never reach an ad platform or a feed (PR 706)', () => {
  let t: TestDatabase;
  let S = 0;
  let deps: TrackingDeps;
  let practiceId = '';
  let realId = '';
  const order = (number: string, isPractice: boolean) =>
    t.prisma.order.create({
      data: {
        storeId: S,
        number,
        status: 'CONFIRMED',
        source: 'WEBSITE',
        currency: 'BDT',
        subtotalMinor: 1000,
        totalMinor: 1000,
        idempotencyKey: `k-${number}`,
        isPractice,
      },
    });
  const waiting = (orderId: string, eventId: string) =>
    t.prisma.trackedEvent.create({
      data: {
        storeId: S,
        eventId,
        name: 'purchase',
        orderId,
        valueMinor: 1000,
        currency: 'BDT',
        occurredAt: new Date('2026-11-12T08:00:00Z'),
        pending: true,
      },
    });

  beforeAll(async () => {
    t = await createTestDatabase('practicetrack');
    [S] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    deps = {
      db: t.prisma,
      resolver: new SettingsResolver(prismaBackend(t.prisma), registry),
      vault: null,
    };
    practiceId = (await order('P-1', true)).id;
    realId = (await order('EX-1', false)).id;
  }, 180_000);
  afterAll(async () => t?.drop());

  it('recording an event of a practice order writes nothing', async () => {
    const r = await recordEvent(deps, {
      storeId: S,
      name: 'purchase',
      eventId: 'practice-purchase-1',
      url: null,
      items: [],
      orderId: practiceId,
      shopper: {} as never,
    });
    expect(r.recorded).toBe(false);
    expect(await t.prisma.trackedEvent.count({ where: { orderId: practiceId } })).toBe(0);
  });

  it("a waiting event of a practice order stops waiting and is not sent; a real order's waiting event is picked up", async () => {
    const p = await waiting(practiceId, 'practice-wait-1');
    const r = await waiting(realId, 'real-wait-1');
    const out = await sendEvents(deps, { storeId: S });
    expect(out.events).toBe(1); // the real one only
    expect((await t.prisma.trackedEvent.findUniqueOrThrow({ where: { id: p.id } })).pending).toBe(false);
    expect((await t.prisma.trackedEvent.findUniqueOrThrow({ where: { id: r.id } })).orderId).toBe(realId);
  });
});
