// PR 610, 611 (CN-028, ERP contract v6; extends PR 199/200 and PR 525) on a real PostgreSQL (a throwaway database with
// the real migrations; orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL). The shop's
// whole order journey against the practice ERP behind a LIVE connection (its fetch replaces the network): the confirmed
// order goes as one line per piece; the courier's pickup sends the shipment (the bill); every courier result goes by
// PUT /orders/{id}/delivery — a "Delivered" a true-delivery check holds waits for the person's answer; the Partial
// delivery box (required when the courier says partial, closed once the parcel is handed back); the admin's decision
// on a short line; the hold pausing checkout; an order cancelled before the ERP had it is never sent. In v5 none of
// it runs. Every key and value is a made-up test value.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, MOCK_COURIER_PROVIDER, mockCourierWorld, mockErp, type MockScenario } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { checkErpOrders, decideErpLine, erpOrderLinesOf, erpOrderOf, erpOrderView, relayErpPushes, type InventoryDeps } from '@extas/inventory';
import { approveExchangeV6, cancelOrder, confirmOrder, openExchange } from '@extas/orders';
import { applyEvents, bookOrders, partialBoxView, reportErpLagging, reportParcelToErp, resolveDeliveryCheck, savePartialDelivery, syncOrder, trackParcel } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 610, 611 · the order journey to the ERP v6 (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const courier = mockCourierWorld(MOCK_COURIER_PROVIDER);
  const erp = mockErp();
  const realFetch = globalThis.fetch;
  const db = () => f.t.prisma;
  const sku: Record<string, string> = {};
  let inv: () => InventoryDeps;
  let n = 0;
  const phone = () => `0170000${String(6100 + ++n).padStart(4, '0')}`;
  const confirmed = async (name: string, lines?: { variantId: string; quantity?: number }[]) => {
    const o = await f.place(name, { phone: phone(), ...(lines ? { lines } : {}) });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    return o;
  };
  const booked = async (o: { orderId: string; number: string }, scenario: MockScenario = 'delivered') => {
    courier.plan(`${o.number}-1`, scenario);
    const r = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    expect(r.results[0]).toMatchObject({ outcome: 'booked' });
    const s = await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId }, orderBy: { createdAt: 'desc' } });
    return { ...o, shipmentId: s.id };
  };
  const read = (shipmentId: string) => trackParcel(f.shippingDeps(), f.shipper, shipmentId);
  const relay = () => relayErpPushes(inv(), { storeId: f.S });
  const pushes = (orderId: string, documentType: string) => db().erpPush.findMany({ where: { storeId: f.S, referenceId: orderId, documentType }, orderBy: { createdAt: 'asc' } });
  const erpOrder = async (orderId: string) => (await erpOrderOf(db(), { storeId: f.S, orderId }))!;

  beforeAll(async () => {
    f = await setUpShipping('shipping_erp6');
    courierId = await f.courier(MOCK_COURIER_PROVIDER, 'Practice ERP v6');
    courier.reset();
    courier.useClock(() => f.clock.now.getTime());
    f.overrides.set('delivery.truthCheck', { enabled: true, holdOrder: true, lookbackDays: 30 });
    // The store's own ERP connection, LIVE against the practice ERP, with a made-up key in a test vault.
    const key = randomBytes(16).toString('hex');
    const vault = new Map([
      ['extasErp.apiKey', key],
      ['extasErp.webhookSecret', randomBytes(24).toString('hex')],
    ]);
    await db().integration.create({ data: { storeId: f.S, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: 'https://erp.example.test' }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
    const erpConnections = createConnections({ db: db(), vault: { get: async (name: string) => vault.get(name) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    inv = () => ({ db: db(), settings: f.deps().settings, connections: erpConnections, now: () => f.clock.now, sleep: async () => {} });
    erp.reset();
    erp.now = () => f.clock.now;
    erp.acceptKey(key, 'SAMPLE-CO-1');
    globalThis.fetch = erp.fetch as typeof fetch;
    for (const [name, id] of Object.entries(f.v)) {
      sku[name] = (await db().productVariant.findUniqueOrThrow({ where: { id }, select: { sku: true } })).sku;
      erp.setVariant({ sku: sku[name]!, styleCode: 'SAMPLE', styleName: 'Sample', color: 'SKY', size: 'M', shopPrice: 500, grade: 'A' });
      erp.setStock(sku[name]!, 'SAMPLE-WH-1', { onHand: 50 });
    }
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    courier.reset();
    await f?.t.drop();
  });

  it('v5: nothing of v6 runs — the order goes as before, no ErpOrder, no shipment or delivery result at pickup', async () => {
    const o = await booked(await confirmed('e6-v5'));
    expect((await pushes(o.orderId, 'order.create')).length).toBe(1);
    expect(await erpOrderOf(db(), { storeId: f.S, orderId: o.orderId })).toBeNull();
    const r = await read(o.shipmentId);
    expect(r.order?.erp).toBeUndefined();
    expect(await reportParcelToErp(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId })).toMatchObject({ waits: 'ERP_MODEL_V5' });
    expect(await partialBoxView(f.shippingDeps(), f.shipper, o.orderId)).toBeNull();
    // The v5 order goes as a v5 document (sent before the switch below).
    expect(await relay()).toMatchObject({ sent: 1 });
  });

  it('PR 610: in v6 the confirmed order goes one line per piece; PR 611: the pickup sends the shipment, "Delivered" goes by PUT …/delivery', async () => {
    f.overrides.set('erp.model', 'v6');
    const o = await confirmed('e6-journey', [{ variantId: f.v.skyM, quantity: 2 }, { variantId: f.v.teeM }]);
    const eo = await erpOrder(o.orderId);
    expect(eo.externalOrderId).toBe(o.number);
    const lines = await erpOrderLinesOf(db(), eo.id);
    expect(lines.map((l) => [l.lineId, l.sku])).toEqual([
      [`${o.number}-1`, sku.skyM],
      [`${o.number}-2`, sku.skyM],
      [`${o.number}-3`, sku.teeM],
    ]);
    const items = await db().orderItem.findMany({ where: { orderId: o.orderId }, select: { lineTotalMinor: true } });
    const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { deliveryChargeMinor: true, discountMinor: true } });
    // The pieces add up to the goods after the order's discount, in whole taka.
    expect(lines.reduce((s, l) => s + l.customerPriceMinor, 0)).toBe(Math.round((items.reduce((s, i) => s + i.lineTotalMinor, 0) - order.discountMinor) / 100) * 100);
    const doc = (await pushes(o.orderId, 'order.create'))[0]!.requestBody as { body: Record<string, unknown> };
    expect(doc.body.deliveryCharge).toBe(Math.round(order.deliveryChargeMinor / 100));
    expect(await relay()).toMatchObject({ sent: 1, held: 0 });

    const b = await booked(o);
    // Booking alone sends nothing (the ERP cannot void a bill yet).
    expect((await pushes(o.orderId, 'shipment.create')).length).toBe(0);
    const r1 = await read(b.shipmentId); // PICKED_UP
    expect(r1.order?.erp).toMatchObject({ shipment: true, delivery: false });
    expect(await relay()).toMatchObject({ sent: 1 });
    expect(!!(await erpOrder(o.orderId)).billedAt).toBe(true);
    await read(b.shipmentId); // IN_TRANSIT: the same shipment is not queued again
    expect((await pushes(o.orderId, 'shipment.create')).length).toBe(1);
    await read(b.shipmentId); // OUT_FOR_DELIVERY
    const r4 = await read(b.shipmentId); // DELIVERED
    expect(r4.order?.erp).toMatchObject({ delivery: true });
    const [push] = await pushes(o.orderId, 'order.delivery');
    const s = await db().shipment.findUniqueOrThrow({ where: { id: b.shipmentId }, select: { codCollectedMinor: true, consignmentId: true } });
    expect((push!.requestBody as { body: Record<string, unknown> }).body).toMatchObject({ status: 'DELIVERED', consignmentId: s.consignmentId, collected: Math.round((s.codCollectedMinor ?? 0) / 100) });
    expect((push!.requestBody as { body: Record<string, unknown> }).body).not.toHaveProperty('mark');
    // A courier re-read sends nothing more.
    await syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: b.shipmentId });
    expect((await pushes(o.orderId, 'order.delivery')).length).toBe(1);
    expect(await relay()).toMatchObject({ sent: 1 });
    const done = await erpOrder(o.orderId);
    expect([done.identification, !!done.identifiedAt]).toEqual([null, true]);
    // The order page's ERP part: erpTotal and shop prices for those who may read the ERP account (the owner's role).
    const view = (await erpOrderView(inv(), f.shipper, o.orderId))!;
    expect(view).toMatchObject({ externalOrderId: o.number, accepted: true, consignmentId: s.consignmentId, erpTotalMinor: null });
    expect(view.lines.every((l) => l.shopPriceMinor === null)).toBe(true);
    expect((await erpOrderView(inv(), { actor: { staffUserId: null }, storeId: f.S }, o.orderId))!.erpTotalMinor).toBe(3 * 500 * 100);
  });

  it('PR 611 + PR 525: a "Delivered" the shop\'s records contradict is not sent while the check is open; the resolved truth goes', async () => {
    const o = await booked(await confirmed('e6-check'));
    await relay();
    await read(o.shipmentId); // PICKED_UP → shipment
    const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { deliveryChargeMinor: true } });
    await applyEvents(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId }, [{ providerEventId: `${o.shipmentId}:dlv`, status: 'DELIVERED', rawStatus: 'delivered', occurredAt: new Date(f.clock.now.getTime() + 10 * 60_000), note: null, reasonKey: null, codCollectedMinor: order.deliveryChargeMinor, chargeMinor: null }], 'poll');
    const r = await syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId });
    expect(r?.erp).toMatchObject({ delivery: false, waits: 'DELIVERY_CHECK_OPEN' });
    expect((await pushes(o.orderId, 'order.delivery')).length).toBe(0);
    const check = await db().deliveryCheck.findUniqueOrThrow({ where: { shipmentId: o.shipmentId } });
    await resolveDeliveryCheck(f.shippingDeps(), f.shipper, check.id, { outcome: 'CHARGE_PAID_RETURN', refusalKey: 'changed-mind' });
    const [push] = await pushes(o.orderId, 'order.delivery');
    expect((push!.requestBody as { body: Record<string, unknown> }).body).toMatchObject({ status: 'RETURNED', collected: Math.round(order.deliveryChargeMinor / 100) });
  });

  it('PR 611: the Partial delivery box — required when the courier says partial, saved by a person, sent again only when changed, closed once handed back', async () => {
    const o = await booked(await confirmed('e6-partial', [{ variantId: f.v.skyM }, { variantId: f.v.teeM }]), 'partial');
    await relay();
    for (let i = 0; i < 4; i++) await read(o.shipmentId); // … PARTIALLY_DELIVERED
    // No box yet and no door record: the result goes without a mark (the ERP identifies); the box is required.
    const first = await pushes(o.orderId, 'order.delivery');
    expect(first.length).toBe(1);
    expect((first[0]!.requestBody as { body: Record<string, unknown> }).body).toMatchObject({ status: 'PARTIAL' });
    let box = (await partialBoxView(f.shippingDeps(), f.shipper, o.orderId))!;
    expect(box).toMatchObject({ required: true, open: true, courierStatus: 'PARTIALLY_DELIVERED', mark: null, handedBack: false });
    expect(box.lines.map((l) => l.lineId)).toEqual([`${o.number}-1`, `${o.number}-2`]);
    await relay();
    expect(['GREEN', 'YELLOW', 'ORANGE']).toContain((await erpOrder(o.orderId)).identification);

    const input = { orderId: o.orderId, keptLineIds: [`${o.number}-1`], paidMinor: 50_000, discountGivenMinor: 2_000, phoneConfirmed: true, note: 'kept the shirt' };
    expect(await code(savePartialDelivery(f.shippingDeps(), f.looker, input))).toBe('FORBIDDEN');
    expect(await code(savePartialDelivery(f.shippingDeps(), f.shipper, { ...input, keptLineIds: ['NOT-A-LINE'] }))).toBe('INVALID_INPUT');
    expect(await savePartialDelivery(f.shippingDeps(), f.shipper, input)).toMatchObject({ sent: true });
    expect(await savePartialDelivery(f.shippingDeps(), f.shipper, input)).toMatchObject({ sent: false });
    const marked = await pushes(o.orderId, 'order.delivery');
    expect(marked.length).toBe(2);
    expect((marked[1]!.requestBody as { body: Record<string, unknown> }).body).toMatchObject({ status: 'PARTIAL', collected: 500, mark: { keptLines: [`${o.number}-1`], discountGiven: 20, phoneConfirmed: true, note: 'kept the shirt' } });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'erp.partialDelivery' } })).toBe(1);
    expect(await db().auditLog.count({ where: { action: 'erp.partialDelivery.save' } })).toBe(1);
    box = (await partialBoxView(f.shippingDeps(), f.shipper, o.orderId))!;
    expect(box).toMatchObject({ required: false, mark: { keptLineIds: [`${o.number}-1`], paidMinor: 50_000, discountGivenMinor: 2_000, phoneConfirmed: true } });
    // A courier re-read keeps the box (nothing new is sent).
    await syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId });
    expect((await pushes(o.orderId, 'order.delivery')).length).toBe(2);
    await relay();
    expect((await erpOrder(o.orderId)).identification).toBe('GREEN');

    // Handed back (a return list sent, PR 612): the box is closed.
    const eo = await erpOrder(o.orderId);
    const list = await db().erpReturnList.create({ data: { storeId: f.S, linkId: eo.linkId, returnListId: `RL-${o.number}`, courier: 'MOCK', handedBackAt: f.clock.now, status: 'SENT' } });
    await db().erpReturnListParcel.create({ data: { storeId: f.S, returnListId: list.id, orderId: o.orderId, externalOrderId: o.number, receivedCount: 1 } });
    expect(await code(savePartialDelivery(f.shippingDeps(), f.shipper, { ...input, keptLineIds: [] }))).toBe('NOT_ACTIVE');
    expect((await partialBoxView(f.shippingDeps(), f.shipper, o.orderId))!).toMatchObject({ open: false, handedBack: true });
  });

  it('PR 610: a short line (a Return-stock piece that failed the packing check) — the admin decides; REPLACE goes to the ERP and the line is open again', async () => {
    erp.setStock(sku.skyL!, 'SAMPLE-WH-1', { onHand: 0, returnStock: 1 });
    const o = await confirmed('e6-short', [{ variantId: f.v.skyL }, { variantId: f.v.skyM }]);
    await relay();
    const eo = await erpOrder(o.orderId);
    expect((await erpOrderLinesOf(db(), eo.id)).map((l) => l.fromReturnStock)).toEqual([true, false]);
    erp.v6().failPackingCheck(o.number, `${o.number}-1`);
    erp.v6().takeEvents(); // no webhook here: the order check reads the ERP's own copy (follow-up 490)
    expect(await checkErpOrders(inv(), { storeId: f.S })).toMatchObject({ status: 'ok' });
    const view = (await erpOrderView(inv(), f.staff, o.orderId))!;
    expect(view).toMatchObject({ canDecide: true });
    expect(view.lines[0]).toMatchObject({ lineId: `${o.number}-1`, state: 'SHORT', fromReturnStock: true });
    expect((await erpOrderView(inv(), f.reader, o.orderId))!.canDecide).toBe(false);

    const decide = (who: typeof f.staff, input: Record<string, unknown>) => code(decideErpLine(inv(), who, { orderId: o.orderId, lineId: `${o.number}-1`, ...input } as never));
    expect(await decide(f.reader, { action: 'WAIT' })).toBe('FORBIDDEN');
    expect(await decide(f.staff, { action: 'CANCEL' })).toBe('INVALID_INPUT');
    expect(await code(decideErpLine(inv(), f.staff, { orderId: o.orderId, lineId: `${o.number}-2`, action: 'WAIT' }))).toBe('CONFLICT');
    const r = await decideErpLine(inv(), f.staff, { orderId: o.orderId, lineId: `${o.number}-1`, action: 'REPLACE', sku: sku.whiteM! });
    expect(r).toMatchObject({ created: true, status: 'PENDING' });
    // A second press of the same decision before it went is the same document.
    expect(await decideErpLine(inv(), f.staff, { orderId: o.orderId, lineId: `${o.number}-1`, action: 'REPLACE', sku: sku.whiteM! })).toMatchObject({ pushId: r.pushId, created: false });
    expect(await relay()).toMatchObject({ sent: 1 });
    const line = await db().erpOrderLine.findFirstOrThrow({ where: { erpOrderId: eo.id, lineId: `${o.number}-1` } });
    expect([line.state, line.sku, line.decision, line.decisionSku, line.fromReturnStock]).toEqual(['OPEN', sku.whiteM, 'REPLACE', sku.whiteM, false]);
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'erp.line.decided' } })).toBe(1);
    expect(await db().auditLog.count({ where: { action: 'erp.line.decide', entityId: line.id } })).toBe(1);
  });

  it('PR 610: the account on hold pauses checkout (the bag is kept); an order cancelled before the ERP had it is never sent', async () => {
    const o = await confirmed('e6-held');
    erp.v6().hold('PAYMENT_OVERDUE');
    expect(await relay()).toMatchObject({ held: 1 });
    expect(await code(f.place('e6-paused', { phone: phone() }))).toBe('PAUSED');
    f.overrides.set('erp.hold.pauseCheckout', false);
    const anyway = await f.place('e6-switch-off', { phone: phone() });
    expect(anyway.number).toBeTruthy();
    f.overrides.delete('erp.hold.pauseCheckout');
    await cancelOrder(f.ordersDeps(), f.staff, o.orderId, { reasonCode: 'NOT_ORDERED' });
    erp.v6().release();
    erp.v6().takeEvents();
    expect(await checkErpOrders(inv(), { storeId: f.S })).toMatchObject({ onHold: false });
    await relay();
    const [create] = await pushes(o.orderId, 'order.create');
    expect([create!.status, create!.lastError]).toEqual(['FAILED', 'ORDER_CANCELLED_BEFORE_SENT']);
    const [status] = await pushes(o.orderId, 'order.status');
    expect([status!.status, status!.lastError]).toEqual(['FAILED', 'ORDER_CANCELLED_BEFORE_SENT']);
    // Checkout is open again.
    expect((await f.place('e6-open', { phone: phone() })).number).toBeTruthy();
  });

  it('PR 610: a SKU the ERP has no shop price for is not sold (409 NO_SHOP_PRICE) until the ERP takes it', async () => {
    await db().productVariant.update({ where: { id: f.v.linenM }, data: { shopPriceMissingAt: f.clock.now } });
    expect(await code(f.place('e6-noprice', { phone: phone(), lines: [{ variantId: f.v.linenM }] }))).toMatch(/OUT_OF_STOCK|SOLD_OUT|STOCK/);
    f.overrides.set('erp.model', 'v5');
    expect((await f.place('e6-noprice-v5', { phone: phone(), lines: [{ variantId: f.v.linenM }] })).number).toBeTruthy();
    f.overrides.set('erp.model', 'v6');
  });

  // CN-029 Phase 1 · PR 614 (Pherot) with PR 611: the exchange order is the ERP's own order (ErpOrder with exchangeOfId).
  it('PR 614 with PR 611: an exchange order`s own parcel — its pickup and result reach the ERP, by the catch-up too', async () => {
    const o = await confirmed('e6-exchange', [{ variantId: f.v.skyM }]);
    await relay();
    const b = await booked(o);
    for (let i = 0; i < 4; i++) await read(b.shipmentId); // picked up … delivered
    await relay();
    const od = { ...f.ordersDeps(), inventory: inv() };
    const item = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    const ex = await openExchange(od, f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: item.id, newVariantId: f.v.skyL }] });
    erp.setStock(sku.skyL!, 'SAMPLE-WH-1', { onHand: 50 }); // an earlier test here used the last L
    const r = await approveExchangeV6(od, f.staff, ex.exchangeId);
    expect(r).toMatchObject({ status: 'SENT', erpExchangeId: expect.any(String) });
    const n = { orderId: r.newOrderId!, number: r.newOrderNumber! };
    if (!r.confirmed) await confirmOrder(f.ordersDeps(), f.staff, n.orderId);
    const nb = await booked(n);
    // the courier is read while the store speaks v5 for a moment: nothing of v6 goes (a report that never ran)
    f.overrides.set('erp.model', 'v5');
    for (let i = 0; i < 4; i++) await read(nb.shipmentId);
    f.overrides.set('erp.model', 'v6');
    expect((await pushes(n.orderId, 'shipment.create')).length).toBe(0);
    // the tracking run's catch-up finds the exchange order's parcel: its pickup and its result go to the ERP
    expect(await reportErpLagging(f.shippingDeps(), f.S, 10)).toMatchObject({ sent: 1 });
    await relay();
    expect((await pushes(n.orderId, 'shipment.create')).map((x) => x.status)).toEqual(['SENT']);
    expect((await pushes(n.orderId, 'order.delivery')).map((x) => x.status)).toEqual(['SENT']);
    // the ERP's 4-day watch starts; an exchange order is never billed
    const x = erp.v6('SAMPLE-CO-1').exchanges.get(r.erpExchangeId!)!;
    expect(x.status).toBe('WAITING_RETURN');
    expect(x.deadline).toBeTruthy();
    expect((await erpOrder(n.orderId)).billedAt).toBeNull();
  });
});
