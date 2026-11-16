// PR 1063: the courier-side reminders on Orders › Returns & exchanges, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): partly delivered orders, open short-count claims not yet sent, and Cash on Delivery orders
// the courier says were delivered with no money in after the courier's own days. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { courierReminders } from './courier-reminders';

const NOW = new Date('2026-11-16T06:00:00Z');
const DAY = 86_400_000;

describe.skipIf(!HAS_TEST_DB)('Returns reminders from the courier side (PR 1063)', () => {
  let t: TestDatabase;
  let A = 0;
  let n = 0;
  const order = async (over: Record<string, unknown>) => {
    n += 1;
    return t.prisma.order.create({
      data: { storeId: A, number: `R973-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date(NOW.getTime() - 20 * DAY), subtotalMinor: 100_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 100_000, paymentMethod: 'COD', idempotencyKey: `r973-${n}`, ...over } as never,
    });
  };

  beforeAll(async () => {
    t = await createTestDatabase('returns_courier_973');
    [A] = await seedSampleStores(t.prisma);
  }, 120_000);
  afterAll(async () => {
    await t?.drop();
  });

  it('counts partial deliveries, short claims not yet sent, and delivered COD with no money after the courier days', async () => {
    const terms = { deadlineEnabled: true, days: 5 };
    expect(await courierReminders(t.prisma, terms, A, NOW)).toEqual({ partial: 0, short: 0, money: 0 });
    await order({ status: 'PARTIALLY_DELIVERED', deliveredAt: new Date(NOW.getTime() - DAY) });
    await order({ deliveredAt: new Date(NOW.getTime() - 8 * DAY) }); // delivered 8 days ago, no money: counts
    await order({ deliveredAt: new Date(NOW.getTime() - 2 * DAY) }); // inside the courier's days: does not
    await order({ deliveredAt: new Date(NOW.getTime() - 9 * DAY), paidMinor: 100_000 }); // money is in: does not
    await order({ deliveredAt: new Date(NOW.getTime() - 9 * DAY), paymentMethod: 'BKASH' }); // not COD: does not
    const courier = await t.prisma.courierAccount.create({ data: { storeId: A, providerKey: 'steadfast', name: 'Sample courier', enabled: true } });
    const o = await order({ status: 'RETURNED' });
    await t.prisma.courierClaim.create({ data: { storeId: A, courierAccountId: courier.id, orderId: o.id, kind: 'RETURN_SHORT', claimedMinor: 5_000, idempotencyKey: 'k-973-1' } });
    await t.prisma.courierClaim.create({ data: { storeId: A, courierAccountId: courier.id, orderId: o.id, kind: 'RETURN_SHORT', claimedMinor: 5_000, idempotencyKey: 'k-973-2', status: 'SENT', sentAt: NOW } }); // already sent: does not
    await t.prisma.courierClaim.create({ data: { storeId: A, courierAccountId: courier.id, orderId: o.id, kind: 'LOST', claimedMinor: 5_000, idempotencyKey: 'k-973-3' } }); // another kind: does not
    expect(await courierReminders(t.prisma, terms, A, NOW)).toEqual({ partial: 1, short: 1, money: 1 });
  });

  it('with the courier days rule off there is no "money not in" rule', async () => {
    expect((await courierReminders(t.prisma, { deadlineEnabled: false, days: 5 }, A, NOW)).money).toBe(0);
  });
});
