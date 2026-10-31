// Go-live gate F-041 (follow-up 420 of PR 172) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a paid
// parcel that comes back asks its refund in the same step. A prepaid order returned → one refund REQUEST (source RTO,
// the paid amount, the way it came, linked to its payment, no person named, nothing paid out); the same step again
// keeps the one request; a Cash on Delivery parcel that comes back asks nothing; a delivery corrected to returned asks
// it too; the owner's "keep the delivery charge" rule takes the charge off. Review R3: a re-ship exchange on a refused
// prepaid parcel cuts its open refund request by what the new parcel uses (M1); a delivery-charge advance is kept by default and asked back only when
// the owner says so, and an "our fault" refusal asks everything (M3, minor 2). Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { approveExchange, confirmOrder, openExchange, orderStep, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('gate F-041 · a returned paid parcel asks its refund (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');

  async function shipped(name: string, paid: boolean) {
    const o = await f.place(name, paid ? { payment: { method: 'mobile', option: 'bkash' }, pay: true } : {});
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    return { o, r };
  }

  beforeAll(async () => {
    f = await setUpOrders('return_refund');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('a prepaid parcel comes back: one refund REQUEST with the paid amount, on the step, never paid out', async () => {
    const a = await shipped('rr-paid', true);
    const order = await db().order.findUniqueOrThrow({ where: { id: a.o.orderId } });
    expect(order.paidMinor).toBeGreaterThan(0);
    const res = await orderStep(d(), a.r, by, 'returned', { refusalKey: 'after-eid' });
    expect(res.status).toBe('RETURNED');
    expect(res.refundRequestIds).toHaveLength(1);
    const payment = await db().payment.findFirstOrThrow({ where: { orderId: a.o.orderId, status: 'PAID' } });
    const refunds = await db().refund.findMany({ where: { orderId: a.o.orderId } });
    expect(refunds).toMatchObject([{ id: res.refundRequestIds[0], status: 'REQUESTED', source: 'RTO', reason: 'RTO', method: 'original', amountMinor: order.paidMinor, paymentId: payment.id, requestedById: null, approvedById: null, completedAt: null }]);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: a.o.orderId, type: 'order.returned' } });
    expect(ev.data).toMatchObject({ refundRequestIds: res.refundRequestIds });
    // no money moved: the payment is still paid, the order's paid amount the same, no wallet entry
    expect(await db().payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: 'PAID' });
    expect(await db().walletEntry.count({ where: { orderId: a.o.orderId } })).toBe(0);
  });

  const RULES = { toWallet: false, afterDelivery: false, afterDeliverySources: ['RIDER_OVERCHARGE'], rtoDeliveryCharge: 'REFUND', fourEyes: false, rtoAdvance: 'KEEP' };
  const CHARGE = { sizePays: 'customer', fallbackMinor: 6_000, claimPhoto: true, reshipRefusals: ['size-fit'], reshipFree: false };
  async function code(p: Promise<unknown>): Promise<string> {
    try {
      await p;
      return 'ok';
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
  }

  it('review R3 (M1): a re-ship exchange on a refused prepaid parcel cuts its refund request by what the new parcel uses', async () => {
    f.overrides.set('payments.refunds', RULES);
    f.overrides.set('orders.exchange.charge', CHARGE);
    const a = await shipped('rr-reship', true);
    const order = await db().order.findUniqueOrThrow({ where: { id: a.o.orderId } });
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: a.o.orderId } });
    await orderStep(d(), a.r, by, 'returned', { refusalKey: 'size-fit' });
    const [rto] = await db().refund.findMany({ where: { orderId: a.o.orderId } });
    expect(rto).toMatchObject({ status: 'REQUESTED', amountMinor: order.paidMinor });
    const ex = await openExchange(d(), f.staff, a.o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    const item = await db().exchangeItem.findFirstOrThrow({ where: { exchangeId: ex.exchangeId } });
    const used = item.oldUnitMinor * item.quantity;
    expect(used).toBeGreaterThan(0);
    await approveExchange(d(), f.staff, ex.exchangeId);
    const after = await db().refund.findMany({ where: { orderId: a.o.orderId }, orderBy: { createdAt: 'asc' } });
    // the old request closed with the system's note (never deleted); what the new parcel did not use asked again
    expect(after[0]).toMatchObject({ id: rto!.id, status: 'REJECTED', amountMinor: order.paidMinor });
    expect(after[0]!.decisionNote).toMatch(/^Used for exchange /);
    const rest = order.paidMinor - used;
    if (rest > 0) expect(after.slice(1)).toMatchObject([{ status: 'REQUESTED', amountMinor: rest, source: 'RTO', method: 'original', paymentId: rto!.paymentId }]);
    else expect(after).toHaveLength(1);
    expect(await db().auditLog.count({ where: { action: 'refund.reject', entityId: rto!.id } })).toBe(1);
    // the money the exchange used is never refunded on top: a hand request for it finds nothing left
    const room = await db().refund.aggregate({ where: { orderId: a.o.orderId, status: { in: ['REQUESTED', 'APPROVED', 'FAILED', 'COMPLETED'] } }, _sum: { amountMinor: true } });
    expect((room._sum.amountMinor ?? 0) + used).toBeLessThanOrEqual(order.paidMinor);

    // a refund a person already approved is not cut: the approval is refused and nothing changes
    const b = await shipped('rr-reship-approved', true);
    const lineB = await db().orderItem.findFirstOrThrow({ where: { orderId: b.o.orderId } });
    await orderStep(d(), b.r, by, 'returned', { refusalKey: 'size-fit' });
    const exB = await openExchange(d(), f.staff, b.o.orderId, { reason: 'size', items: [{ orderItemId: lineB.id, newVariantId: f.v.skyL }] });
    await db().refund.updateMany({ where: { orderId: b.o.orderId }, data: { status: 'APPROVED' } });
    expect(await code(approveExchange(d(), f.staff, exB.exchangeId))).toBe('REFUND_TAKEN');
    expect(await db().refund.findMany({ where: { orderId: b.o.orderId } })).toMatchObject([{ status: 'APPROVED' }]);
    expect(await db().exchange.findUniqueOrThrow({ where: { id: exB.exchangeId } })).toMatchObject({ status: 'REQUESTED', newOrderId: null });
    f.overrides.delete('orders.exchange.charge');
  });

  it('review R3 (M3): a delivery-charge advance is kept on a refusal unless the owner says to ask it back; our fault asks all', async () => {
    const advanced = async (name: string) => {
      const a = await shipped(name, false);
      const order = await db().order.findUniqueOrThrow({ where: { id: a.o.orderId } });
      await db().payment.create({ data: { storeId: f.S, orderId: a.o.orderId, method: 'BKASH', purpose: 'ADVANCE_DELIVERY_CHARGE', status: 'PAID', amountMinor: order.deliveryChargeMinor, receivedMinor: order.deliveryChargeMinor, currency: 'BDT', idempotencyKey: randomUUID(), paidAt: f.clock.now } });
      await db().order.update({ where: { id: a.o.orderId }, data: { paidMinor: order.deliveryChargeMinor } });
      return { ...a, chargeMinor: order.deliveryChargeMinor };
    };
    f.overrides.set('payments.refunds', RULES);
    const keep = await advanced('rr-adv-keep');
    expect(keep.chargeMinor).toBeGreaterThan(0);
    expect((await orderStep(d(), keep.r, by, 'returned', { refusalKey: 'changed-mind' })).refundRequestIds).toEqual([]);
    expect(await db().refund.count({ where: { orderId: keep.o.orderId } })).toBe(0);

    f.overrides.set('payments.refunds', { ...RULES, rtoAdvance: 'ASK' });
    const ask = await advanced('rr-adv-ask');
    await orderStep(d(), ask.r, by, 'returned', { refusalKey: 'changed-mind' });
    expect(await db().refund.findMany({ where: { orderId: ask.o.orderId } })).toMatchObject([{ status: 'REQUESTED', amountMinor: ask.chargeMinor }]);

    // the shop's own fault ("wrong item" is one of the owner's our-fault reasons): everything goes back, even with KEEP
    f.overrides.set('payments.refunds', { ...RULES, rtoDeliveryCharge: 'KEEP' });
    const ours = await advanced('rr-adv-ours');
    await orderStep(d(), ours.r, by, 'returned', { refusalKey: 'wrong-item' });
    expect(await db().refund.findMany({ where: { orderId: ours.o.orderId } })).toMatchObject([{ status: 'REQUESTED', amountMinor: ours.chargeMinor }]);
    f.overrides.delete('payments.refunds');
  });

  it('a Cash on Delivery parcel that comes back asks nothing', async () => {
    const b = await shipped('rr-cod', false);
    const res = await orderStep(d(), b.r, by, 'returned');
    expect(res.refundRequestIds).toEqual([]);
    expect(await db().refund.count({ where: { orderId: b.o.orderId } })).toBe(0);
  });

  it('a delivery corrected to returned asks it too; "keep the delivery charge" takes the charge off', async () => {
    f.overrides.set('payments.refunds', { ...RULES, rtoDeliveryCharge: 'KEEP' });
    const c = await shipped('rr-corrected', true);
    await orderStep(d(), c.r, by, 'delivered');
    // PR 525: a delivery is corrected only while its true-delivery check is open
    const shipment = await db().shipment.findFirstOrThrow({ where: { orderId: c.o.orderId } });
    await db().deliveryCheck.create({ data: { storeId: f.S, orderId: c.o.orderId, shipmentId: shipment.id, courierClaim: 'DELIVERED', signals: ['DOOR_RETURNED'] } });
    const order = await db().order.findUniqueOrThrow({ where: { id: c.o.orderId } });
    const res = await orderStep(d(), c.r, by, 'deliveryCorrected', { note: 'the courier marked it delivered by mistake' });
    expect(res.status).toBe('RETURNED');
    expect(res.refundRequestIds).toHaveLength(1);
    const [refund] = await db().refund.findMany({ where: { orderId: c.o.orderId } });
    expect(refund).toMatchObject({ source: 'RTO', status: 'REQUESTED', amountMinor: Math.max(0, order.paidMinor - order.deliveryChargeMinor) });
  });
});
