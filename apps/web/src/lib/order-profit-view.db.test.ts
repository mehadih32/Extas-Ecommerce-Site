// S16 · PR 348 — the order page's profit with the owner's own settings (skipped without TEST_DATABASE_ADMIN_URL): as
// shipped, packaging and gateway fees are empty, so those parts are "not known yet" (never 0); once the owner enters
// them they count; the ad-spend share follows `costs.allocation` (off = "switched off"); another store's order is null.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { loadOrderProfit } from './order-profit-view';

describe.skipIf(!HAS_TEST_DB)('order page profit with settings (PR 348)', () => {
  let t: TestDatabase;
  let resolver: SettingsResolver<typeof registry>;
  let A = 0;
  let B = 0;
  let orderId = '';
  const who = { actorId: null, reason: 'test' };

  beforeAll(async () => {
    t = await createTestDatabase('orderprofit_348');
    [A, B] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    const o = await t.prisma.order.create({
      data: { storeId: A, number: 'V348-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date('2026-10-09T06:00:00Z'), deliveredAt: new Date('2026-10-10T06:00:00Z'), subtotalMinor: 100_000, totalMinor: 100_000, paymentMethod: 'BKASH', idempotencyKey: 'v348-1' },
    });
    orderId = o.id;
    await t.prisma.orderItem.create({ data: { storeId: A, orderId, sku: 'POLO-M', productName: 'Sample polo', quantity: 1, unitPriceMinor: 100_000, lineTotalMinor: 100_000, unitCostMinor: 60_000 } });
    await t.prisma.payment.create({ data: { storeId: A, orderId, method: 'BKASH', provider: 'bkash', purpose: 'ORDER', status: 'PAID', amountMinor: 100_000, currency: 'BDT', idempotencyKey: 'v348-p1' } });
  });
  afterAll(async () => t?.drop());

  it('empty owner figures are unknown; entered ones count; ads follow the switch; another store reads nothing', async () => {
    const deps = { db: t.prisma, resolver };
    let p = (await loadOrderProfit(deps, A, orderId))!;
    expect(p.parts.packaging.state).toBe('missing');
    expect(p.parts.paymentFees.state).toBe('missing');
    expect(p.parts.ads).toEqual({ minor: 0, state: 'known' }); // no ad account: no ad spend, nothing estimated
    expect(p.profitMinor).toBe(40_000);
    expect(p.status).toBe('partial');

    await resolver.set('costs.packaging', { perOrderMinor: 2_500 }, storeTarget(A), who);
    await resolver.set('costs.gatewayFees', [{ provider: 'bkash', percentBps: 150, fixedMinor: 0 }], storeTarget(A), who);
    await resolver.set('costs.allocation', { adSpend: false, adBasis: 'month' }, storeTarget(A), who);
    p = (await loadOrderProfit(deps, A, orderId))!;
    expect(p.parts.packaging).toEqual({ minor: 2_500, state: 'known' });
    expect(p.parts.paymentFees).toEqual({ minor: 1_500, state: 'known' });
    expect(p.parts.ads.state).toBe('off');
    expect(p.profitMinor).toBe(100_000 - 60_000 - 2_500 - 1_500);
    expect(p.status).toBe('complete');

    expect(await loadOrderProfit(deps, B, orderId)).toBeNull();
  });
});
