// PR 157 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a number's history is read in any stored form
// through the one phone helper (E.164 from the checkout, the local form typed by the team), each earlier order with what
// became of it — a refusal with its reason, an our-fault one marked and never counted (SIM-F-044), a cancel with its
// code, calls not answered — and only `orders.read` is needed. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { orderPhoneHistory, phoneOrders } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 157 · phone history (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;

  beforeAll(async () => {
    f = await setUpOrders('phone_history');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  /** Test data: an earlier order's outcome, as the later stages would leave it (the status and the courier's reason). */
  async function finish(orderId: string, status: 'DELIVERED' | 'RETURNED' | 'CANCELLED', reasonCode?: string) {
    await db().order.update({ where: { id: orderId }, data: { status, ...(status === 'CANCELLED' ? { cancelReasonCode: reasonCode ?? null } : {}) } });
    if (status === 'RETURNED') await db().orderEvent.create({ data: { storeId: f.S, orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode: reasonCode ?? null, actorType: 'COURIER', source: 'courier' } });
  }

  it('every other order of the number in any stored form, newest first, with what became of it', async () => {
    const phone = '01700000303';
    const a = await f.place('ph-1', { phone });
    const b = await f.place('ph-2', { phone });
    const c = await f.place('ph-3', { phone });
    const d = await f.place('ph-4', { phone });
    await f.place('ph-other', { phone: '01700000399' });
    await finish(a.orderId, 'RETURNED', 'changed-mind');
    await finish(b.orderId, 'RETURNED', 'late'); // the shop's fault: shown, never counted
    await finish(c.orderId, 'CANCELLED', 'CUSTOMER_BEFORE_CONFIRM');
    // an order the team typed in by hand, stored in the local form
    await db().order.update({ where: { id: d.orderId }, data: { phone } });
    await db().callTask.create({ data: { storeId: f.S, orderId: d.orderId, reason: 'confirm', outcome: 'NO_ANSWER' } });
    const n = await f.place('ph-5', { phone: '+880 1700-000303' });

    const past = await phoneOrders(f.ordersDeps(), f.S, '01700-000303', { excludeOrderId: n.orderId, take: 50 });
    expect(past.map((x) => x.id).sort()).toEqual([a.orderId, b.orderId, c.orderId, d.orderId].sort());
    expect(past.find((x) => x.id === a.orderId)).toMatchObject({ status: 'RETURNED', refusalKey: 'changed-mind' });
    expect(past.find((x) => x.id === c.orderId)).toMatchObject({ status: 'CANCELLED', cancelCode: 'CUSTOMER_BEFORE_CONFIRM' });
    expect(past.find((x) => x.id === d.orderId)!.callOutcomes).toEqual(['NO_ANSWER']);

    // the order page's history: orders.read is enough; the number as the team reads it; the our-fault refusal marked
    const h = await orderPhoneHistory(f.ordersDeps(), f.reader, n.orderId);
    expect(h!.phone).toBe('01700-000303');
    expect(h!.summary).toMatchObject({ orders: 4, refused: 1, ourFault: 1, cancelled: 1, noAnswer: 1, open: 1 });
    expect(h!.recent.find((x) => x.id === b.orderId)).toMatchObject({ refusalKey: 'late', ourFault: true });
    expect(h!.recent.find((x) => x.id === a.orderId)).toMatchObject({ refusalKey: 'changed-mind', ourFault: false });
    // the owner takes "late" off his our-fault list: it counts as a refusal again
    f.overrides.set('risk.history', { orders: 200, ourFaultRefusals: [], noAnswerOutcomes: ['NO_ANSWER'] });
    try {
      expect((await orderPhoneHistory(f.ordersDeps(), f.reader, n.orderId))!.summary).toMatchObject({ refused: 2, ourFault: 0 });
    } finally {
      f.overrides.delete('risk.history');
    }
  });

  it('a first order has an empty history; another store, an unknown id or no order read nothing', async () => {
    const o = await f.place('ph-first', { phone: '01700000304' });
    const h = await orderPhoneHistory(f.ordersDeps(), f.reader, o.orderId);
    expect(h).toMatchObject({ phone: '01700-000304', summary: { orders: 0 }, recent: [] });
    expect(await orderPhoneHistory(f.ordersDeps(), f.reader, 'not-an-id')).toBeNull();
    expect(await orderPhoneHistory(f.ordersDeps(), f.reader, '01a16af2-30f0-7462-aab8-719bb3ce51b1')).toBeNull();
    expect(await phoneOrders(f.ordersDeps(), f.S, null, { take: 10 })).toEqual([]);
  });
});
