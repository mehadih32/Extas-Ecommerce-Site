// S05 · PR 138, 144, 147, 153 on a real PostgreSQL (a throwaway database with the real migrations, the sample catalogue
// and store; orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL). The one order service:
// the row lock (two commands at once: one wins, the other is refused), the version check (STALE), idempotent replays,
// the timeline and audit rows in the same transaction, the append-only timeline; cancellation with reasons and refund
// requests; hold and release; notes and flags. Acceptance tests (SIMULATION-PLAN): F-041 paid cancel → refund request,
// F-043 waiting for the advance is never auto-cancelled, F-056 the customer's cancel (CN-020 (5)), F-004 cancel after
// booking with the courier's answer. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import {
  addNote,
  approveCancelRequest,
  archiveNote,
  awaitAdvance,
  cancelAfterBooking,
  cancelOrder,
  confirmOrder,
  customerCancel,
  customerCancelState,
  getOrder,
  holdOrder,
  listNotes,
  listOrders,
  orderFollowUps,
  orderStep,
  reasonLists,
  recordAdvance,
  recordCourierCancel,
  refuseCancelRequest,
  releaseOrder,
  setFlags,
  systemBy,
} from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!HAS_TEST_DB)('the order core on PostgreSQL (S05)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const d = () => f.ordersDeps();
  const db = () => f.t.prisma;
  const orderOf = (id: string) => db().order.findUniqueOrThrow({ where: { id } });
  const eventsOf = (id: string) => db().orderEvent.findMany({ where: { orderId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  /** A courier booking for the order (S08 books for real; here a row is enough: booked = an active shipment). */
  const book = async (orderId: string, status: 'PENDING_PICKUP' | 'IN_TRANSIT' = 'PENDING_PICKUP') =>
    (await db().shipment.create({ data: { storeId: f.S, orderId, courierAccountId: courierId, status, idempotencyKey: randomUUID(), bookedAt: f.clock.now } })).id;

  beforeAll(async () => {
    f = await setUpOrders('orders');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  describe('PR 138 · the one order service', () => {
    it('confirm: PLACED → CONFIRMED, the version goes up, one timeline row and one audit row, the ERP document queued (D6)', async () => {
      const o = await f.place('confirm');
      const r = await confirmOrder(d(), f.staff, o.orderId);
      expect(r).toMatchObject({ from: 'PLACED', status: 'CONFIRMED', version: 1, replay: false, refundRequestIds: [] });
      const row = await orderOf(o.orderId);
      expect(row).toMatchObject({ status: 'CONFIRMED', version: 1 });
      expect(row.confirmedAt).not.toBeNull();
      const ev = (await eventsOf(o.orderId)).filter((e) => e.type === 'order.confirm');
      expect(ev).toMatchObject([{ fromStatus: 'PLACED', toStatus: 'CONFIRMED', actorType: 'STAFF', actorId: f.staffId, source: 'admin' }]);
      expect(await db().auditLog.count({ where: { entityId: o.orderId, action: 'order.confirm' } })).toBe(1);
      expect(await db().erpPush.count({ where: { referenceId: o.orderId, documentType: 'order.create' } })).toBe(1);
    });

    it('an illegal command is refused with a clear code and the commands open now; nothing is written', async () => {
      const o = await f.place('illegal');
      const before = await db().orderEvent.count({ where: { orderId: o.orderId } });
      const e = await orderStep(d(), ref(o.orderId), systemBy('test'), 'handover').catch((x) => x);
      expect(e).toMatchObject({ code: 'ILLEGAL_TRANSITION', status: 409 });
      expect(e.data.allowed).toContain('confirm');
      expect(await db().orderEvent.count({ where: { orderId: o.orderId } })).toBe(before);
      expect((await orderOf(o.orderId)).version).toBe(0);
    });

    it('two commands at the same moment: the row lock lets one win and refuses the other (no lost update)', async () => {
      const o = await f.place('race');
      let first = true;
      const slow = { ...d(), hooks: { afterLock: async () => { if (first) { first = false; await sleep(400); } } } };
      const [a, b] = await Promise.allSettled([confirmOrder(slow, f.staff, o.orderId), (async () => { await sleep(100); return confirmOrder(slow, f.staff, o.orderId); })()]);
      const codes = [a, b].map((x) => (x.status === 'fulfilled' ? 'ok' : (x.reason as { code: string }).code)).sort();
      expect(codes).toEqual(['ILLEGAL_TRANSITION', 'ok']);
      expect((await orderOf(o.orderId)).version).toBe(1);
      expect((await eventsOf(o.orderId)).filter((e) => e.type === 'order.confirm')).toHaveLength(1);

      // hold and cancel at once: whichever comes second sees the first's result
      const o2 = await f.place('race-2');
      first = true;
      const [h, c] = await Promise.allSettled([
        holdOrder(slow, f.staff, o2.orderId, { reasonKey: 'customer-wait' }),
        (async () => { await sleep(100); return confirmOrder(slow, f.staff, o2.orderId); })(),
      ]);
      expect(h.status).toBe('fulfilled');
      expect(c.status === 'rejected' && (c.reason as { code: string }).code).toBe('ILLEGAL_TRANSITION');
    });

    it('a command sent with the version the screen showed is refused with STALE when the order changed in between', async () => {
      const o = await f.place('stale');
      await holdOrder(d(), f.staff, o.orderId, { reasonKey: 'customer-wait' }, { version: 0 });
      const e = await releaseOrder(d(), f.staff, o.orderId, {}, { version: 0 }).catch((x) => x);
      expect(e).toMatchObject({ code: 'STALE', status: 409, data: { version: 1, status: 'ON_HOLD' } });
      expect(await releaseOrder(d(), f.staff, o.orderId, {}, { version: 1 })).toMatchObject({ status: 'PLACED', version: 2 });
    });

    it('the same idempotency key gives the first answer again; another request with it is refused (§7.7)', async () => {
      const o = await f.place('idem');
      const key = `test-cancel-${randomUUID()}`;
      const input = { reasonCode: 'OUT_OF_STOCK' };
      const [a, b] = await Promise.all([cancelOrder(d(), f.staff, o.orderId, input, { idempotencyKey: key }), cancelOrder(d(), f.staff, o.orderId, input, { idempotencyKey: key })]);
      expect([a.replay, b.replay].sort()).toEqual([false, true]);
      expect(a.version).toBe(b.version);
      expect(await cancelOrder(d(), f.staff, o.orderId, input, { idempotencyKey: key })).toMatchObject({ status: 'CANCELLED', replay: true });
      expect((await eventsOf(o.orderId)).filter((e) => e.type === 'order.cancel')).toHaveLength(1);
      expect(await code(cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'DUPLICATE_ORDER' }, { idempotencyKey: key }))).toBe('IDEMPOTENCY_MISMATCH');
      expect(await code(cancelOrder(d(), f.staff, o.orderId, input, { idempotencyKey: 'short' }))).toBe('INVALID_INPUT');
    });

    it('permissions are checked in the store: a reader sees orders but cannot change them', async () => {
      const o = await f.place('perm');
      expect(await code(confirmOrder(d(), f.reader, o.orderId))).toBe('FORBIDDEN');
      expect(await code(cancelOrder(d(), f.reader, o.orderId, { reasonCode: 'OTHER', note: 'x' }))).toBe('FORBIDDEN');
      expect(await code(getOrder(d(), f.reader, o.orderId))).toBe('ok');
      expect(await code(confirmOrder(d(), { ...f.staff, storeId: f.S + 999 }, o.orderId))).toBe('FORBIDDEN');
      expect(await code(confirmOrder(d(), f.staff, randomUUID()))).toBe('NOT_FOUND');
    });

    it('the timeline is append-only at the database (PR 139): a row cannot be changed or removed', async () => {
      const o = await f.place('append');
      await confirmOrder(d(), f.staff, o.orderId);
      const [ev] = (await eventsOf(o.orderId)).filter((e) => e.type === 'order.confirm');
      expect(await code(db().orderEvent.update({ where: { id: ev!.id }, data: { message: 'changed' } }))).not.toBe('ok');
      expect(await code(db().orderEvent.delete({ where: { id: ev!.id } }))).not.toBe('ok');
    });

    it('the fulfilment and courier hooks run through the same service (S08): every step on the timeline', async () => {
      const o = await f.place('steps');
      const by = systemBy('test');
      await confirmOrder(d(), f.staff, o.orderId);
      await orderStep(d(), ref(o.orderId), by, 'startPicking');
      await orderStep(d(), ref(o.orderId), by, 'pack');
      expect(await code(orderStep(d(), ref(o.orderId), by, 'handover'))).toBe('NOT_BOOKED');
      await book(o.orderId);
      await orderStep(d(), ref(o.orderId), by, 'handover');
      await orderStep(d(), ref(o.orderId), by, 'courierPickedUp');
      expect(await code(orderStep(d(), ref(o.orderId), by, 'partiallyDelivered'))).toBe('INVALID_INPUT');
      const items = await db().orderItem.findMany({ where: { orderId: o.orderId }, select: { id: true } });
      expect(await orderStep(d(), ref(o.orderId), by, 'partiallyDelivered', { keptItemIds: items.map((i) => i.id) })).toMatchObject({ status: 'PARTIALLY_DELIVERED' });
      const moves = (await eventsOf(o.orderId)).filter((e) => e.toStatus).map((e) => e.toStatus);
      expect(moves).toEqual(['PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'PARTIALLY_DELIVERED']);
      const row = await orderOf(o.orderId);
      expect(row.packedAt && row.handedOverAt && row.deliveredAt).toBeTruthy();
    });
  });

  describe('PR 144 · cancellation with reasons', () => {
    it('the reason lists come from the settings, in both languages', async () => {
      const l = await reasonLists(d(), f.S);
      expect(l.cancel.map((r) => r.key)).toContain('ADVANCE_NOT_PAID');
      expect(l.cancel.find((r) => r.key === 'OTHER')).toMatchObject({ noteRequired: true });
      expect(l.hold.every((r) => r.en && r.bn)).toBe(true);
      expect(l.flags.length).toBeGreaterThan(0);
    });

    it('a reason not on the list, or OTHER without a note, is refused', async () => {
      const o = await f.place('reason');
      expect(await code(cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'BECAUSE' }))).toBe('REASON_REQUIRED');
      expect(await code(cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'OTHER' }))).toBe('REASON_REQUIRED');
      f.overrides.set('orders.cancel.reasons', [{ code: 'OTHER', en: 'Other', bn: 'অন্য' }]);
      expect(await code(cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'OUT_OF_STOCK' }))).toBe('REASON_REQUIRED');
      f.overrides.delete('orders.cancel.reasons');
    });

    it('a cash-on-delivery cancel: held stock released, the call tasks closed, no refund request', async () => {
      const o = await f.place('cod-cancel');
      await db().callTask.create({ data: { storeId: f.S, orderId: o.orderId, reason: 'TEST' } });
      expect(await db().stockReservation.count({ where: { orderId: o.orderId, status: 'CONVERTED', releasedAt: null } })).toBeGreaterThan(0);
      const r = await cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'ADDRESS_UNREACHABLE', note: 'three calls, no answer' });
      expect(r).toMatchObject({ status: 'CANCELLED', refundRequestIds: [] });
      expect(await db().stockReservation.count({ where: { orderId: o.orderId, releasedAt: null } })).toBe(0);
      expect(await db().callTask.findMany({ where: { orderId: o.orderId } })).toMatchObject([{ status: 'DISMISSED', outcome: 'ORDER_CANCELLED' }]);
      expect(await orderOf(o.orderId)).toMatchObject({ cancelReasonCode: 'ADDRESS_UNREACHABLE', cancelNote: 'three calls, no answer' });
      const [ev] = (await eventsOf(o.orderId)).filter((e) => e.type === 'order.cancel');
      expect(ev).toMatchObject({ fromStatus: 'PLACED', toStatus: 'CANCELLED', reasonCode: 'ADDRESS_UNREACHABLE' });
      expect(await db().refund.count({ where: { orderId: o.orderId } })).toBe(0);
    });

    it('SIM-F-041 · a paid order cancelled: a refund REQUEST for the owner, the payment untouched, no money moved', async () => {
      const o = await f.place('paid', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
      const paid = await orderOf(o.orderId);
      expect(paid.paidMinor).toBeGreaterThan(0);
      await confirmOrder(d(), f.staff, o.orderId);
      const r = await cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'OUT_OF_STOCK' });
      expect(r.refundRequestIds).toHaveLength(1);
      const refunds = await db().refund.findMany({ where: { orderId: o.orderId } });
      expect(refunds).toMatchObject([{ status: 'REQUESTED', amountMinor: paid.paidMinor, method: 'original', source: 'CANCEL', reason: 'OUT_OF_STOCK', requestedById: f.staffId, completedAt: null, approvedById: null }]);
      expect(await db().payment.findMany({ where: { orderId: o.orderId, status: 'PAID' } })).toHaveLength(1);
      expect((await orderOf(o.orderId)).paidMinor).toBe(paid.paidMinor);
      const detail = await getOrder(d(), f.staff, o.orderId);
      expect(detail.money.payment).toBe('OWED_BACK');
      expect(detail.refundRequests).toMatchObject([{ status: 'REQUESTED' }]);
      // the ERP had the order (confirmed): its CANCELLED status is queued too
      expect(await db().erpPush.count({ where: { referenceId: o.orderId } })).toBe(2);
    });

    it('a payment still waiting is closed by the cancel, and the shop cannot retry it', async () => {
      const o = await f.place('pay-open', { payment: { method: 'mobile', option: 'bkash' } });
      await cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'OTHER', note: 'test' });
      expect(await db().payment.findMany({ where: { orderId: o.orderId } })).toMatchObject([{ status: 'CANCELLED' }]);
      const { payAction } = await import('@extas/checkout');
      expect(await code(payAction(f.deps(), { storeId: f.S, visitorId: o.visitorId, input: { number: o.number, action: 'retry' } }))).toBe('CART_NOT_OPEN');
      expect(await code(payAction(f.deps(), { storeId: f.S, visitorId: o.visitorId, input: { number: o.number, action: 'approve' } }))).toBe('CART_NOT_OPEN');
    });

    it('SIM-F-043 · "Advance not paid": the order waits, a person is asked past the deadline, it is never cancelled by itself', async () => {
      f.overrides.set('orders.advance.waitHours', 24);
      const o = await f.place('advance');
      await awaitAdvance(d(), ref(o.orderId), systemBy('risk'), { requiredMinor: 50_000, level: 'high' });
      expect(await orderOf(o.orderId)).toMatchObject({ status: 'AWAITING_ADVANCE', advanceRequiredMinor: 50_000 });
      expect(await code(confirmOrder(d(), f.staff, o.orderId))).toBe('ILLEGAL_TRANSITION');
      expect(await code(recordAdvance(d(), ref(o.orderId), systemBy('payments')))).toBe('ADVANCE_SHORT');
      expect(await orderFollowUps(d(), f.S)).toEqual({ holdReviews: 0, advanceOverdue: 0 });
      f.clock.now = new Date(f.clock.now.getTime() + 25 * 3_600_000);
      expect(await orderFollowUps(d(), f.S)).toMatchObject({ advanceOverdue: 1 });
      expect(await orderFollowUps(d(), f.S)).toMatchObject({ advanceOverdue: 0 });
      expect(await db().callTask.findMany({ where: { orderId: o.orderId } })).toMatchObject([{ reason: 'ADVANCE_OVERDUE', status: 'OPEN' }]);
      expect((await orderOf(o.orderId)).status).toBe('AWAITING_ADVANCE');
      // the person decides: cancel with the reason "Advance not paid"
      const r = await cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'ADVANCE_NOT_PAID' });
      expect(r).toMatchObject({ from: 'AWAITING_ADVANCE', status: 'CANCELLED' });
      f.overrides.delete('orders.advance.waitHours');
    });
  });

  describe("SIM-F-056 · the customer's own cancel (CN-020 (5))", () => {
    const me = (visitorId: string) => ({ storeId: f.S, customerId: null, visitorId });

    it('before the team confirms: one tap cancels, as the customer, with his reason', async () => {
      const o = await f.place('c-tap');
      expect(await customerCancelState(d(), me(o.visitorId), o.number)).toMatchObject({ mode: 'tap' });
      const r = await customerCancel(d(), me(o.visitorId), { number: o.number, reasonKey: 'by-mistake' });
      expect(r).toMatchObject({ outcome: 'cancelled', status: 'CANCELLED' });
      expect(await orderOf(o.orderId)).toMatchObject({ cancelReasonCode: 'CUSTOMER_BEFORE_CONFIRM' });
      const [ev] = (await eventsOf(o.orderId)).filter((e) => e.type === 'order.cancel');
      expect(ev).toMatchObject({ actorType: 'CUSTOMER', source: 'shop', reasonCode: 'CUSTOMER_BEFORE_CONFIRM' });
      expect(await db().stockReservation.count({ where: { orderId: o.orderId, releasedAt: null } })).toBe(0);
    });

    it('after confirming: a request the team approves or refuses; after booking: no cancel here', async () => {
      const a = await f.place('c-req');
      await confirmOrder(d(), f.staff, a.orderId);
      expect(await customerCancel(d(), me(a.visitorId), { number: a.number, reasonKey: 'changed-mind' })).toMatchObject({ outcome: 'requested', status: 'CONFIRMED' });
      expect(await code(customerCancel(d(), me(a.visitorId), { number: a.number, reasonKey: 'changed-mind' }))).toBe('CANCEL_REQUESTED');
      expect((await listOrders(d(), f.staff, { view: 'cancelRequests' })).rows.map((r) => r.id)).toContain(a.orderId);
      expect(await approveCancelRequest(d(), f.staff, a.orderId)).toMatchObject({ status: 'CANCELLED' });
      expect(await orderOf(a.orderId)).toMatchObject({ cancelReasonCode: 'CUSTOMER_AFTER_CONFIRM' });

      const b = await f.place('c-refuse');
      await confirmOrder(d(), f.staff, b.orderId);
      await customerCancel(d(), me(b.visitorId), { number: b.number, reasonKey: 'too-slow' });
      expect(await code(approveCancelRequest(d(), f.reader, b.orderId))).toBe('FORBIDDEN');
      expect(await refuseCancelRequest(d(), f.staff, b.orderId, { note: 'already packed for him' })).toMatchObject({ status: 'CONFIRMED' });
      expect((await orderOf(b.orderId)).cancelRequestedAt).toBeNull();
      expect(await code(approveCancelRequest(d(), f.staff, b.orderId))).toBe('NO_CANCEL_REQUEST');

      const c = await f.place('c-booked');
      await confirmOrder(d(), f.staff, c.orderId);
      await book(c.orderId);
      expect(await customerCancelState(d(), me(c.visitorId), c.number)).toMatchObject({ mode: 'none' });
      expect(await code(customerCancel(d(), me(c.visitorId), { number: c.number, reasonKey: 'changed-mind' }))).toBe('CANCEL_NOT_ALLOWED');
    });

    it('a request before confirming holds the confirm; another browser never finds the order; the cut-off is a setting', async () => {
      f.overrides.set('orders.cancel.customer', { cutoff: 'placed', requests: true });
      const o = await f.place('c-placed');
      expect(await customerCancel(d(), me(o.visitorId), { number: o.number, reasonKey: 'found-cheaper' })).toMatchObject({ outcome: 'requested', status: 'PLACED' });
      expect(await code(confirmOrder(d(), f.staff, o.orderId))).toBe('CANCEL_REQUESTED');
      expect(await code(customerCancel(d(), me('test-visitor-someone-else-000'), { number: o.number, reasonKey: 'by-mistake' }))).toBe('NOT_FOUND');
      expect(await code(customerCancel(d(), me(o.visitorId), { number: o.number, reasonKey: 'not-a-reason' }))).toBe('REASON_REQUIRED');
      f.overrides.set('orders.cancel.customer', { cutoff: 'off', requests: false });
      const p = await f.place('c-off');
      expect(await code(customerCancel(d(), me(p.visitorId), { number: p.number, reasonKey: 'by-mistake' }))).toBe('CANCEL_NOT_ALLOWED');
      f.overrides.delete('orders.cancel.customer');
    });

    it('his tap and the team\'s confirm at the same moment: the confirm wins and his tap is refused, never both', async () => {
      const o = await f.place('c-race');
      let first = true;
      const slow = { ...d(), hooks: { afterLock: async () => { if (first) { first = false; await sleep(400); } } } };
      const [c, t] = await Promise.allSettled([confirmOrder(slow, f.staff, o.orderId), (async () => { await sleep(100); return customerCancel(slow, me(o.visitorId), { number: o.number, reasonKey: 'by-mistake' }); })()]);
      expect(c.status).toBe('fulfilled');
      expect(t.status === 'rejected' && (t.reason as { code: string }).code).toBe('CANCEL_NOT_ALLOWED');
      expect((await orderOf(o.orderId)).status).toBe('CONFIRMED');
    });
  });

  describe('SIM-F-004 · cancel after booking (§6.5.7, D5)', () => {
    it('booked: the ordinary cancel is refused; cancel after booking waits for the courier, who confirms it', async () => {
      const o = await f.place('booked');
      await confirmOrder(d(), f.staff, o.orderId);
      const s = await book(o.orderId);
      expect(await code(cancelOrder(d(), f.staff, o.orderId, { reasonCode: 'OUT_OF_STOCK' }))).toBe('BOOKED');
      expect(await code(recordCourierCancel(d(), f.staff, o.orderId, 'confirmed'))).toBe('NO_CANCEL_PENDING');
      expect(await cancelAfterBooking(d(), f.staff, o.orderId, { note: 'wants another colour' })).toMatchObject({ status: 'CONFIRMED' });
      expect(await orderOf(o.orderId)).toMatchObject({ cancelPending: true, cancelReasonCode: 'CUSTOMER_CHANGE_AFTER_BOOKING' });
      expect(await db().shipment.findUniqueOrThrow({ where: { id: s } })).toMatchObject({ status: 'CANCEL_REQUESTED' });
      expect(await code(cancelAfterBooking(d(), f.staff, o.orderId, {}))).toBe('CANCEL_PENDING');
      expect(await code(orderStep(d(), ref(o.orderId), systemBy('test'), 'pack'))).toBe('CANCEL_PENDING');
      expect((await listOrders(d(), f.staff, { view: 'cancelPending' })).rows.map((r) => r.id)).toContain(o.orderId);
      const r = await recordCourierCancel(d(), f.staff, o.orderId, 'confirmed', { courierPerson: 'Desk', courierRef: 'CXL-1' });
      expect(r).toMatchObject({ status: 'CANCELLED' });
      expect(await db().shipment.findUniqueOrThrow({ where: { id: s } })).toMatchObject({ status: 'CANCELLED', cancelOutcome: 'CONFIRMED', cancelRef: 'CXL-1', cancelConfirmedById: f.staffId });
      expect(await orderOf(o.orderId)).toMatchObject({ cancelPending: false, status: 'CANCELLED' });
      expect(await db().stockReservation.count({ where: { orderId: o.orderId, releasedAt: null } })).toBe(0);
      const ev = (await eventsOf(o.orderId)).find((e) => e.type === 'order.cancelAfterBooking');
      expect(ev?.data).toMatchObject({ riskSignal: false, shipmentStatusBefore: 'PENDING_PICKUP' });
    });

    it('the courier could not cancel: the parcel goes on, the order is marked "customer wants a change", never a risk signal', async () => {
      const o = await f.place('refused');
      await confirmOrder(d(), f.staff, o.orderId);
      const s = await book(o.orderId, 'IN_TRANSIT');
      await cancelAfterBooking(d(), f.staff, o.orderId, {});
      const r = await recordCourierCancel(d(), f.staff, o.orderId, 'refused', { courierRef: 'NO-1' });
      expect(r).toMatchObject({ status: 'CONFIRMED' });
      expect(await orderOf(o.orderId)).toMatchObject({ cancelPending: false, customerWantsChange: true, cancelReasonCode: null });
      expect(await db().shipment.findUniqueOrThrow({ where: { id: s } })).toMatchObject({ status: 'IN_TRANSIT', cancelOutcome: 'REFUSED' });
      expect(await code(cancelAfterBooking(d(), f.reader, o.orderId, {}))).toBe('FORBIDDEN');
    });
  });

  describe('PR 153 · hold and release', () => {
    it('a hold carries the reason support reads; release goes back to where it was', async () => {
      const o = await f.place('hold');
      await confirmOrder(d(), f.staff, o.orderId);
      expect(await code(holdOrder(d(), f.staff, o.orderId, { reasonKey: 'no-such' }))).toBe('REASON_REQUIRED');
      expect(await code(holdOrder(d(), f.staff, o.orderId, { reasonKey: 'other' }))).toBe('REASON_REQUIRED');
      await holdOrder(d(), f.staff, o.orderId, { reasonKey: 'waiting-stock', note: 'size M arrives Sunday' });
      expect(await orderOf(o.orderId)).toMatchObject({ status: 'ON_HOLD', holdFromStatus: 'CONFIRMED', holdReasonCode: 'waiting-stock', holdReason: 'size M arrives Sunday' });
      const detail = await getOrder(d(), f.reader, o.orderId);
      expect(detail.order).toMatchObject({ holdReasonCode: 'waiting-stock', holdReason: 'size M arrives Sunday' });
      expect(detail.allowed).toEqual(expect.arrayContaining(['release', 'cancel']));
      expect(await db().stockReservation.count({ where: { orderId: o.orderId, releasedAt: null } })).toBeGreaterThan(0);
      expect((await listOrders(d(), f.staff, { view: 'onHold' })).rows.map((r) => r.id)).toContain(o.orderId);
      expect(await releaseOrder(d(), f.staff, o.orderId, { note: 'stock in' })).toMatchObject({ status: 'CONFIRMED' });
      expect(await orderOf(o.orderId)).toMatchObject({ holdFromStatus: null, holdReasonCode: null, holdReason: null, onHoldSince: null });
    });

    it('a long hold is handed to a person when the owner sets a review time (off by default)', async () => {
      const o = await f.place('hold-long');
      await holdOrder(d(), f.staff, o.orderId, { reasonKey: 'customer-wait' });
      f.clock.now = new Date(f.clock.now.getTime() + 49 * 3_600_000);
      expect(await orderFollowUps(d(), f.S)).toMatchObject({ holdReviews: 0 });
      f.overrides.set('orders.hold.reviewHours', 48);
      expect((await orderFollowUps(d(), f.S)).holdReviews).toBeGreaterThanOrEqual(1);
      expect(await db().callTask.count({ where: { orderId: o.orderId, reason: 'HOLD_REVIEW' } })).toBe(1);
      expect((await orderOf(o.orderId)).status).toBe('ON_HOLD');
      f.overrides.delete('orders.hold.reviewHours');
    });
  });

  describe('PR 147 · notes and internal flags', () => {
    it('notes are added, listed newest first, archived (never deleted), with timeline and audit rows', async () => {
      const o = await f.place('notes');
      const a = await addNote(d(), f.staff, o.orderId, { body: 'Called, he will confirm tonight' });
      await addNote(d(), f.staff, o.orderId, { body: 'Prefers delivery after 5' });
      expect(a).toMatchObject({ isInternal: true, authorId: f.staffId });
      expect((await listNotes(d(), f.reader, o.orderId)).map((n) => n.body)).toEqual(['Prefers delivery after 5', 'Called, he will confirm tonight']);
      await archiveNote(d(), f.staff, o.orderId, a.id);
      expect(await listNotes(d(), f.reader, o.orderId)).toHaveLength(1);
      expect(await listNotes(d(), f.reader, o.orderId, { archived: true })).toHaveLength(2);
      expect((await listNotes(d(), f.staff, o.orderId))[0]).toMatchObject({ authorName: 'Orders Staff' });
      expect((await eventsOf(o.orderId)).filter((e) => e.type.startsWith('order.note')).map((e) => e.type)).toEqual(['order.note', 'order.note', 'order.note.archived']);
      expect(await code(addNote(d(), f.reader, o.orderId, { body: 'x' }))).toBe('FORBIDDEN');
      f.overrides.set('orders.notes.maxChars', 100);
      expect(await code(addNote(d(), f.staff, o.orderId, { body: 'x'.repeat(101) }))).toBe('INVALID_INPUT');
      f.overrides.delete('orders.notes.maxChars');
      expect((await orderOf(o.orderId)).version).toBe(0);
    });

    it("flags are keys of the owner's list, set through the order service", async () => {
      const o = await f.place('flags');
      expect(await code(setFlags(d(), f.staff, o.orderId, { flags: ['made-up'] }))).toBe('INVALID_INPUT');
      const r = await setFlags(d(), f.staff, o.orderId, { flags: ['call-first', 'vip', 'vip'] });
      expect(r).toMatchObject({ status: 'PLACED', version: 1 });
      expect((await orderOf(o.orderId)).internalFlags).toEqual(['call-first', 'vip']);
      await setFlags(d(), f.staff, o.orderId, { flags: ['vip'] });
      const ev = (await eventsOf(o.orderId)).filter((e) => e.type === 'order.setFlags');
      expect(ev[1]?.data).toMatchObject({ added: [], removed: ['call-first'] });
    });
  });

  describe('the order list and one order (admin API data)', () => {
    it('views with counts, search by number or phone, a cursor; the detail shows money and the commands open now', async () => {
      const o = await f.place('list', { phone: '01700000999' });
      const all = await listOrders(d(), f.staff, { limit: 3 });
      expect(all.rows).toHaveLength(3);
      expect(all.next).not.toBeNull();
      const more = await listOrders(d(), f.staff, { limit: 3, cursor: all.next! });
      expect(more.rows[0]!.id).not.toBe(all.rows[2]!.id);
      expect(all.counts.all).toBeGreaterThan(all.counts.new);
      expect((await listOrders(d(), f.staff, { q: o.number })).rows.map((r) => r.id)).toEqual([o.orderId]);
      expect((await listOrders(d(), f.staff, { q: '01700000999' })).rows.map((r) => r.id)).toEqual([o.orderId]);
      expect(await code(listOrders(d(), f.staff, { view: 'nope' }))).toBe('INVALID_INPUT');
      const detail = await getOrder(d(), f.staff, o.orderId);
      expect(detail.order).toMatchObject({ status: 'PLACED', version: 0 });
      expect(detail.allowed).toEqual(['confirm', 'hold', 'cancel', 'requestCancel', 'setFlags', 'addLine', 'removeLine', 'edit', 'twoSizeCheck', 'twoSizeAnswer', 'riskAssess', 'riskSection', 'riskLevel', 'blocklistMatch', 'refuserTerms', 'bundleProposal', 'awaitAdvance']);
      expect(detail.money.payment).toBe('COD_TO_COLLECT');
      expect(detail.customerCancel).toBe('tap');
      expect(detail.timeline[0]).toMatchObject({ type: 'order.placed' });
    });
  });
});
