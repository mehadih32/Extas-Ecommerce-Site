// PR 185 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the four-tier exchange engine through the one
// order service. A size exchange is opened on a delivered order (the order keeps its state, the timeline and the audit
// row say who and why), the tiers are strictly in order, the window and the per-piece limit hold, and approving it
// makes the linked exchange order with its stock held under the checkout's row locks and the old piece's pick-up. The
// SIM-F-022 groundwork: a wrong item keeps its root cause and the SKU really coming back. The sample Smart Rules
// exchange rule is live (72 hours, one exchange per piece, a charge per band). Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { approveExchange, confirmOrder, exchangeChoices, exchangeDetail, listExchanges, openExchange, orderStep, refuseExchange, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 185 · the four-tier exchange engine (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');
  const lineOf = (orderId: string) => db().orderItem.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const stock = (variantId: string, n: number) => db().stockLevel.updateMany({ where: { variantId }, data: { onHand: n, available: n } });

  /** Places an order and walks it to DELIVERED through the machine. */
  async function delivered(name: string, lines?: { variantId: string; quantity?: number }[]) {
    const o = await f.place(name, lines ? { lines } : {});
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    await orderStep(d(), r, by, 'delivered');
    return o;
  }

  beforeAll(async () => {
    f = await setUpOrders('exchange');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('a size exchange: tier 1 offered, opened on the delivered order (its state stays), approved into a linked exchange order with its stock held and the pick-up opened', async () => {
    const o = await delivered('ex-size');
    const line = await lineOf(o.orderId);
    const ch = await exchangeChoices(d(), f.staff, o.orderId, { orderItemId: line.id, reason: 'size', sizeKey: 'l' });
    expect(ch).toMatchObject({ closed: null, tier: 1, window: { state: 'OPEN' }, windowHours: 72, perItemLeft: 1 });
    expect(ch.options.map((x) => x.variantId)).toEqual([f.v.skyL]);
    expect(ch.sizes.map((s) => s.key)).toContain('l');
    const opt = ch.options[0]!;
    expect(opt.money.chargeState).toBe('SET');
    expect(opt.money.codMinor).toBe(opt.money.owedMinor + opt.money.chargeMinor);

    const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    const key = `exchange-${randomUUID()}`;
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] }, { idempotencyKey: key });
    expect(ex).toMatchObject({ status: 'REQUESTED', replay: false, money: { codMinor: opt.money.codMinor, chargeMinor: opt.money.chargeMinor } });
    expect(ex.number).toMatch(/^XC-\d+$/);
    // the same press again gives the same exchange, never a second one
    expect(await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] }, { idempotencyKey: key })).toMatchObject({ exchangeId: ex.exchangeId, replay: true });
    const after = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(after).toMatchObject({ status: 'DELIVERED', version: before.version + 1, codAmountMinor: before.codAmountMinor, totalMinor: before.totalMinor });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.exchange' } });
    expect(ev).toMatchObject({ actorType: 'STAFF', actorId: f.staffId, reasonCode: 'size', fromStatus: 'DELIVERED', toStatus: null });
    expect(ev.data).toMatchObject({ exchangeId: ex.exchangeId, items: [{ from: line.sku, quantity: 1, tier: 1 }] });
    expect(await db().auditLog.count({ where: { entityId: o.orderId, action: 'order.exchange' } })).toBe(1);

    const ap = await approveExchange(d(), f.staff, ex.exchangeId, { note: 'Size L sent' });
    expect(ap.confirmed).toBe(false);
    const n = await db().order.findUniqueOrThrow({ where: { id: ap.newOrderId }, include: { items: true } });
    expect(n).toMatchObject({ status: 'PLACED', source: 'ADMIN', paymentMethod: 'COD', flags: ['EXCHANGE'], phone: before.phone, shippingAddressText: before.shippingAddressText, deliveryBandId: before.deliveryBandId, customerId: before.customerId });
    expect(n.number).not.toBe(before.number);
    expect(n.totalMinor).toBe(ex.money.codMinor);
    expect(n.codAmountMinor).toBe(ex.money.codMinor);
    expect(n.deliveryChargeMinor).toBe(ex.money.chargeMinor);
    expect(n.items).toHaveLength(1);
    expect(n.items[0]).toMatchObject({ variantId: f.v.skyL, quantity: 1, addedVia: 'exchange', lineTotalMinor: ex.money.owedMinor });
    const held = await db().stockReservation.aggregate({ where: { orderId: ap.newOrderId, variantId: f.v.skyL, status: 'CONVERTED', releasedAt: null }, _sum: { quantity: true } });
    expect(held._sum.quantity).toBe(1);
    const ret = await db().returnRecord.findUniqueOrThrow({ where: { id: ap.returnId }, include: { items: true } });
    expect(ret).toMatchObject({ kind: 'EXCHANGE_PICKUP', status: 'EXPECTED', orderId: o.orderId, exchangeId: ex.exchangeId, ourFault: false });
    expect(ret.items).toEqual([expect.objectContaining({ orderItemId: line.id, quantity: 1, expectedSku: line.sku, variantId: line.variantId })]);
    const view = await exchangeDetail(d(), f.staff, ex.exchangeId);
    expect(view).toMatchObject({ status: 'APPROVED', newOrderNumber: n.number, orderNumber: before.number, decisionNote: 'Size L sent', version: 1 });
    expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: ap.newOrderId, type: 'order.placed' } })).data).toMatchObject({ exchange: { id: ex.exchangeId, fromNumber: before.number } });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'exchange.approved' } })).toBe(1);
    // decided once: a second approval or a refusal is refused
    expect(await code(approveExchange(d(), f.staff, ex.exchangeId))).toBe('EXCHANGE_STATE');
    expect(await code(refuseExchange(d(), f.staff, ex.exchangeId, { note: 'late' }))).toBe('EXCHANGE_STATE');
    // the per-piece limit (one, from the live rule) and the open case
    expect(await code(openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] }))).toBe('EXCHANGE_LIMIT');
    expect((await listExchanges(d(), f.staff, { orderId: o.orderId })).map((x) => x.id)).toEqual([ex.exchangeId]);
  });

  it('the tiers are strictly in order: tier 2 only when tier 1 has nothing, and a piece from a later tier is refused', async () => {
    const o = await delivered('ex-tiers');
    const line = await lineOf(o.orderId);
    const whiteL = f.variant('oxford-cotton-shirt', 'white', 'L').id;
    await stock(whiteL, 10);
    expect(await code(openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: whiteL }] }))).toBe('NOT_OFFERED');
    await stock(f.v.skyL, 0);
    const ch = await exchangeChoices(d(), f.staff, o.orderId, { orderItemId: line.id, reason: 'size', sizeKey: 'l' });
    expect(ch.tier).toBe(2);
    expect(ch.options.map((x) => x.variantId)).toContain(whiteL);
    expect(await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: whiteL }] })).toMatchObject({ status: 'REQUESTED' });
    await stock(f.v.skyL, 100);
  });

  it('OUT_OF_STOCK at approval changes nothing: no order, no hold, the exchange still waits', async () => {
    const o = await delivered('ex-stock');
    const line = await lineOf(o.orderId);
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    const orders = await db().order.count({ where: { storeId: f.S } });
    await stock(f.v.skyL, 0);
    expect(await code(approveExchange(d(), f.staff, ex.exchangeId))).toBe('OUT_OF_STOCK');
    expect(await db().order.count({ where: { storeId: f.S } })).toBe(orders);
    expect(await db().returnRecord.count({ where: { exchangeId: ex.exchangeId } })).toBe(0);
    expect((await exchangeDetail(d(), f.staff, ex.exchangeId)).status).toBe('REQUESTED');
    await stock(f.v.skyL, 100);
    // refused with the reason: the piece may be exchanged again (a refused case does not count)
    expect(await code(refuseExchange(d(), f.staff, ex.exchangeId, {}))).toBe('INVALID_INPUT');
    await refuseExchange(d(), f.staff, ex.exchangeId, { note: 'Customer changed his mind' });
    expect((await exchangeDetail(d(), f.staff, ex.exchangeId)).status).toBe('REJECTED');
    expect(await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] })).toMatchObject({ status: 'REQUESTED' });
  });

  it('SIM-F-022 groundwork: a wrong item needs its root cause, keeps the SKU really coming back, and is free (our mistake)', async () => {
    const o = await delivered('ex-wrong');
    const line = await lineOf(o.orderId);
    const linen = await db().productVariant.findUniqueOrThrow({ where: { id: f.v.linenM } });
    const items = [{ orderItemId: line.id, newVariantId: f.v.skyM, receivedSku: linen.sku }];
    expect(await code(openExchange(d(), f.staff, o.orderId, { reason: 'wrong', items }))).toBe('REASON_REQUIRED');
    expect(await code(openExchange(d(), f.staff, o.orderId, { reason: 'wrong', rootCause: 'no-such-cause', items }))).toBe('REASON_REQUIRED');
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'wrong', rootCause: 'wrong-pick', items });
    expect(ex.money).toMatchObject({ codMinor: 0, chargeMinor: 0, chargeState: 'FREE_OUR_MISTAKE' });
    const ap = await approveExchange(d(), f.staff, ex.exchangeId);
    expect((await db().order.findUniqueOrThrow({ where: { id: ap.newOrderId } })).codAmountMinor).toBe(0);
    const ret = await db().returnRecord.findUniqueOrThrow({ where: { id: ap.returnId }, include: { items: true } });
    expect(ret.ourFault).toBe(true);
    expect(ret.items[0]!.expectedSku).toBe(linen.sku);
    expect((await exchangeDetail(d(), f.staff, ex.exchangeId)).rootCause).toBe('wrong-pick');
  });

  it('the window, the switch and the machine: closed after the hours, off when the owner says so, never before delivery', async () => {
    const o = await delivered('ex-window');
    const line = await lineOf(o.orderId);
    const items = [{ orderItemId: line.id, newVariantId: f.v.skyL }];
    f.overrides.set('policy.exchange.enabled', false);
    expect((await exchangeChoices(d(), f.staff, o.orderId, { orderItemId: line.id, reason: 'size', sizeKey: 'l' })).closed).toBe('OFF');
    expect(await code(openExchange(d(), f.staff, o.orderId, { reason: 'size', items }))).toBe('EXCHANGE_CLOSED');
    f.overrides.delete('policy.exchange.enabled');
    const saved = f.clock.now;
    f.clock.now = new Date(saved.getTime() + 73 * 3_600_000);
    expect((await exchangeChoices(d(), f.staff, o.orderId, { orderItemId: line.id, reason: 'size', sizeKey: 'l' })).closed).toBe('WINDOW');
    expect(await code(openExchange(d(), f.staff, o.orderId, { reason: 'size', items }))).toBe('EXCHANGE_CLOSED');
    f.clock.now = saved;
    // a size exchange is to another size; an order still on its way takes none
    expect(await code(openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyM }] }))).toBe('INVALID_INPUT');
    const open = await f.place('ex-open');
    const openLine = await lineOf(open.orderId);
    expect(await code(openExchange(d(), f.staff, open.orderId, { reason: 'size', items: [{ orderItemId: openLine.id, newVariantId: f.v.skyL }] }))).toBe('ILLEGAL_TRANSITION');
    // permissions
    expect(await code(openExchange(d(), f.reader, o.orderId, { reason: 'size', items }))).toBe('FORBIDDEN');
    expect(await code(exchangeChoices(d(), f.reader, o.orderId, { orderItemId: line.id, reason: 'size' }))).toBe('FORBIDDEN');
  });
});
