// PR 533 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the customer history at approval is off as
// shipped (nothing read); switched on, the chosen order's number with its other orders — a true delivery, a delivery
// still being checked, a refusal and a charge-paid return with their reasons, an exchange, a cancel — for `orders.read`
// only. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { approvalHistory } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 533 · customer history at approval (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;

  beforeAll(async () => {
    f = await setUpOrders('approval_history');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped: nothing is read; on: every other order of the number with what became of it', async () => {
    const phone = '01700000533';
    const delivered = await f.place('ah-1', { phone });
    const checking = await f.place('ah-2', { phone });
    const refused = await f.place('ah-3', { phone });
    const chargePaid = await f.place('ah-4', { phone });
    const cancelled = await f.place('ah-5', { phone });
    await f.place('ah-other', { phone: '01700000534' });
    await db().order.updateMany({ where: { id: { in: [delivered.orderId, checking.orderId] } }, data: { status: 'DELIVERED' } });
    await db().order.updateMany({ where: { id: { in: [refused.orderId, chargePaid.orderId] } }, data: { status: 'RETURNED' } });
    await db().order.update({ where: { id: cancelled.orderId }, data: { status: 'CANCELLED', cancelReasonCode: 'CUSTOMER_BEFORE_CONFIRM' } });
    await db().returnRecord.create({ data: { storeId: f.S, orderId: refused.orderId, kind: 'REFUSED_AT_DOOR', reasonCode: 'changed-mind' } });
    await db().returnRecord.create({ data: { storeId: f.S, orderId: chargePaid.orderId, kind: 'CHARGE_PAID_RETURN', reasonCode: 'size' } });
    const courier = await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } });
    const ship = await db().shipment.create({ data: { storeId: f.S, orderId: checking.orderId, courierAccountId: courier.id, status: 'DELIVERED', idempotencyKey: randomUUID() } });
    await db().deliveryCheck.create({ data: { storeId: f.S, orderId: checking.orderId, shipmentId: ship.id, courierClaim: 'DELIVERED' } });
    await db().exchange.create({ data: { storeId: f.S, orderId: delivered.orderId, number: 'EXC-533', reason: 'size', tier: 1 } });
    const now = await f.place('ah-now', { phone: '+880 1700-000533' });

    expect(await approvalHistory(f.ordersDeps(), f.reader, now.orderId)).toBeNull();

    f.overrides.set('customers.approvalHistory', { enabled: true, recent: 3, reasonsShown: 5 });
    try {
      const h = await approvalHistory(f.ordersDeps(), f.reader, now.orderId);
      expect(h!.phone).toBe('01700-000533');
      expect(h!.counts).toMatchObject({ orders: 5, delivered: 1, checking: 1, refused: 1, chargePaid: 1, ourFault: 0, exchanges: 1, cancelled: 1 });
      expect(h!.reasons).toEqual([
        { key: 'changed-mind', count: 1 },
        { key: 'size', count: 1 },
      ]);
      expect(h!.recent).toHaveLength(3);
      expect(h!.recent.map((r) => r.id)).not.toContain(now.orderId);
      // a first order has nothing to show; an unknown id or another store's order reads nothing
      const first = await f.place('ah-first', { phone: '01700000535' });
      expect((await approvalHistory(f.ordersDeps(), f.reader, first.orderId))!.counts.orders).toBe(0);
      expect(await approvalHistory(f.ordersDeps(), f.reader, 'not-an-id')).toBeNull();
      expect(await approvalHistory(f.ordersDeps(), f.reader, randomUUID())).toBeNull();
    } finally {
      f.overrides.delete('customers.approvalHistory');
    }
  });
});
