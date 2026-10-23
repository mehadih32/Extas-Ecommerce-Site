// S05 · PR 140 (and 141, 154) on a real PostgreSQL (a throwaway database with the real migrations and the sample store;
// orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL): what the admin's order screens read
// beside the order service's own list — the "to confirm" view, the payment and channel filters, each row's courier,
// pieces and return/refund chip, and the oldest order of a view. Nothing here changes an order. Made-up test values.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { cancelOrder, listExtras, listOrders, returnRefundState, viewOldest } from './index';
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

  it('read with the order keys only: someone without orders.read is refused', async () => {
    const nobody = await db().staffUser.create({ data: { email: 'nobody-140@example.com', displayName: 'Nobody', passwordHash: 'not-a-login' } });
    await expect(listExtras(d(), { actor: { staffUserId: nobody.id }, storeId: f.S }, [plain.orderId])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(viewOldest(d(), { actor: { staffUserId: nobody.id }, storeId: f.S }, 'all')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
