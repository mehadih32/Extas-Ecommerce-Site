// S05 · PR 140, 141 (and 154) on a real PostgreSQL (a throwaway database with the real migrations and the sample store;
// orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL): what the admin's order screens read
// beside the order service's own list — the "to confirm" view, the payment and channel filters, each row's courier,
// pieces and return/refund chip, and the oldest order of a view. Nothing here changes an order. Made-up test values.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { cancelOrder, listExtras, listOrders, orderHistory, orderNumbers, orderQueueCounts, returnRefundState, staffNames, viewOldest } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe('the return / refund chip (no database)', () => {
  it('waiting work first: a refund to pay, then to approve, then a parcel on its way back', () => {
    expect(returnRefundState([], [])).toBeNull();
    expect(returnRefundState([], [{ status: 'REQUESTED' }, { status: 'APPROVED' }])).toBe('REFUND_APPROVED');
    expect(returnRefundState([{ receivedAt: null }], [{ status: 'REQUESTED' }])).toBe('REFUND_REQUESTED');
    expect(returnRefundState([{ receivedAt: null }], [])).toBe('RETURN_EXPECTED');
    expect(returnRefundState([{ receivedAt: new Date() }], [{ status: 'COMPLETED' }])).toBe('RETURN_RECEIVED');
    expect(returnRefundState([], [{ status: 'COMPLETED' }])).toBe('REFUND_DONE');
    expect(returnRefundState([], [{ status: 'REJECTED' }])).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('the admin order screens read on PostgreSQL (S05 UI)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const d = () => f.ordersDeps();
  const db = () => f.t.prisma;
  let plain: { orderId: string; number: string };
  let asked: { orderId: string; number: string };
  let reviewed: { orderId: string; number: string };
  let paid: { orderId: string; number: string };

  beforeAll(async () => {
    f = await setUpOrders('admin-read');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
    plain = await f.place('plain', { lines: [{ variantId: f.v.skyM, quantity: 2 }, { variantId: f.v.teeM }] });
    asked = await f.place('asked');
    reviewed = await f.place('reviewed');
    paid = await f.place('paid', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await db().order.update({ where: { id: asked.orderId }, data: { cancelRequestedAt: f.clock.now, cancelRequestReason: 'changed my mind' } });
    await db().fraudAlert.create({ data: { storeId: f.S, orderId: reviewed.orderId, matchedOrderIds: [plain.orderId], severity: 'high', proposedAction: 'HOLD', status: 'OPEN', summary: { section: 'duplicate' } } });
    await db().order.update({ where: { id: plain.orderId }, data: { source: 'PHONE' } });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('"to confirm" is the work that can be confirmed now: no open review and no cancel request (those have their own views)', async () => {
    const l = await listOrders(d(), f.staff, { view: 'toConfirm' });
    const ids = l.rows.map((r) => r.id);
    expect(ids).toContain(plain.orderId);
    expect(ids).not.toContain(asked.orderId);
    expect(ids).not.toContain(reviewed.orderId);
    expect(l.counts.toConfirm).toBe(ids.length);
    expect(l.counts.cancelRequests).toBeGreaterThanOrEqual(1);
    expect(l.counts.inReview).toBe(1);
  });

  it('the payment method and the channel filter the list, with the counts of the views unchanged', async () => {
    const all = await listOrders(d(), f.staff, {});
    const bk = await listOrders(d(), f.staff, { payment: 'BKASH' });
    expect(bk.rows.map((r) => r.number)).toEqual([paid.number]);
    expect(bk.counts).toEqual(all.counts);
    const phone = await listOrders(d(), f.staff, { source: 'PHONE' });
    expect(phone.rows.map((r) => r.number)).toEqual([plain.number]);
    expect(phone.rows[0]!.source).toBe('PHONE');
    // PR 430: "from support" is every chat channel together, then one channel
    await db().order.update({ where: { id: reviewed.orderId }, data: { source: 'WHATSAPP' } });
    await db().order.update({ where: { id: asked.orderId }, data: { source: 'MESSENGER' } });
    try {
      const support = await listOrders(d(), f.staff, { source: 'SUPPORT' });
      expect(support.rows.map((r) => r.number).sort()).toEqual([asked.number, reviewed.number].sort());
      expect((await listOrders(d(), f.staff, { source: 'WHATSAPP' })).rows.map((r) => r.number)).toEqual([reviewed.number]);
    } finally {
      await db().order.updateMany({ where: { id: { in: [reviewed.orderId, asked.orderId] } }, data: { source: 'WEBSITE' } });
    }
    await expect(listOrders(d(), f.staff, { payment: 'GOLD' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('each row: the newest courier booking, the pieces and the first product, the return/refund chip', async () => {
    await db().shipment.create({ data: { storeId: f.S, orderId: plain.orderId, courierAccountId: courierId, status: 'BOOKING_FAILED', idempotencyKey: randomUUID(), createdAt: new Date(f.clock.now.getTime() - 60_000) } });
    await db().shipment.create({ data: { storeId: f.S, orderId: plain.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', trackingCode: 'TRK-140', idempotencyKey: randomUUID() } });
    await cancelOrder(d(), f.staff, paid.orderId, { reasonCode: 'OUT_OF_STOCK' });
    const x = await listExtras(d(), f.staff, [plain.orderId, paid.orderId, asked.orderId, plain.orderId]);
    expect(Object.keys(x).sort()).toEqual([plain.orderId, paid.orderId, asked.orderId].sort());
    expect(x[plain.orderId]).toMatchObject({ shipment: { status: 'PENDING_PICKUP', trackingCode: 'TRK-140', courierName: 'Test courier' }, units: 3, lines: 2, returnRefund: null });
    expect(x[plain.orderId]!.firstItem).toBeTruthy();
    expect(x[paid.orderId]).toMatchObject({ shipment: null, returnRefund: 'REFUND_REQUESTED' });
    expect(await listExtras(d(), f.staff, [])).toEqual({});
  });

  it('the oldest order of a view, for "oldest 2 h"; null when the view is empty', async () => {
    const oldest = await viewOldest(d(), f.staff, 'toConfirm');
    const rows = (await listOrders(d(), f.staff, { view: 'toConfirm', limit: 100 })).rows;
    const first = Math.min(...rows.map((r) => r.placedAt.getTime()));
    expect(oldest?.getTime()).toBe(first);
    expect(await viewOldest(d(), f.staff, 'cancelPending')).toBeNull();
  });

  it("one order's customer history: the other orders of the same phone, by what happened to them, newest first", async () => {
    const other = await f.place('other', { phone: '01700000999' }); // hardcode-ok: a made-up test number
    const h = await orderHistory(d(), f.staff, plain.orderId, 2);
    expect(h.matchedBy).toBe('customer'); // the checkout keeps one customer per phone
    expect(h.counts).toEqual({ orders: 3, open: 2, delivered: 0, returned: 0, cancelled: 1 });
    expect(h.recent).toHaveLength(2);
    expect(h.recent.map((r) => r.id)).not.toContain(plain.orderId);
    expect(h.recent[0]!.placedAt.getTime()).toBeGreaterThanOrEqual(h.recent[1]!.placedAt.getTime());
    const alone = await orderHistory(d(), f.staff, other.orderId, 5);
    expect(alone.counts.orders).toBe(0);
    expect(alone.recent).toEqual([]);
    expect((await orderHistory(d(), f.staff, randomUUID(), 5)).matchedBy).toBeNull();
  });

  it('PR 154 search: Bengali digits, part of a phone, the tracking number, the name, the number in any case', async () => {
    const found = async (q: string) => (await listOrders(d(), f.staff, { q, limit: 100 })).rows.map((r) => r.id);
    const other = (await found('01700000999'))[0]!; // hardcode-ok: the made-up test number placed above
    expect(await found('০১৭০০০০০৯৯৯')).toEqual([other]);
    expect(await found('+880 1700-000999')).toEqual([other]);
    expect(await found('0999')).toEqual([other]);
    expect(await found('trk-140')).toEqual([plain.orderId]);
    expect(await found(plain.number.toLowerCase())).toEqual([plain.orderId]);
    expect((await found('test cust')).length).toBeGreaterThanOrEqual(5);
    expect(await found('nobody by this name')).toEqual([]);
  });

  it('the names in the timeline and the linked order numbers, in this store only', async () => {
    const staffId = (f.staff.actor as { staffUserId: string }).staffUserId;
    const names = await staffNames(d(), f.staff, [staffId, null, staffId, randomUUID()]);
    expect(Object.keys(names)).toEqual([staffId]);
    expect(await staffNames(d(), f.staff, [null])).toEqual({});
    const nums = await orderNumbers(d(), f.staff, [plain.orderId, paid.orderId, randomUUID()]);
    expect(nums.map((r) => r.number).sort()).toEqual([plain.number, paid.number].sort());
    expect(nums.find((r) => r.id === paid.orderId)!.status).toBe('CANCELLED');
  });

  it('follow-up 200: the waiting work for the badge and "Needs you now" is the views\' own counts, with the oldest', async () => {
    const views = ['toConfirm', 'inReview', 'cancelRequests', 'cancelPending'] as const;
    const q = await orderQueueCounts(db(), f.S, views);
    const l = await listOrders(d(), f.staff, {});
    for (const v of views) expect(q[v]!.n, v).toBe(l.counts[v]);
    expect(q.toConfirm!.oldest?.getTime()).toBe((await viewOldest(d(), f.staff, 'toConfirm'))?.getTime());
    expect(q.cancelPending).toEqual({ n: 0, oldest: null });
  });

  it('read with the order keys only: someone without orders.read is refused', async () => {
    const nobody = await db().staffUser.create({ data: { email: 'nobody-140@example.com', displayName: 'Nobody', passwordHash: 'not-a-login' } });
    await expect(listExtras(d(), { actor: { staffUserId: nobody.id }, storeId: f.S }, [plain.orderId])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(viewOldest(d(), { actor: { staffUserId: nobody.id }, storeId: f.S }, 'all')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(orderHistory(d(), { actor: { staffUserId: nobody.id }, storeId: f.S }, plain.orderId, 5)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
