// PR 127 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): "Add to this parcel" — a real order line,
// added through the one order service, priced as its product page prices it, nothing else priced again, the stored
// money consistent (subtotal, total and the COD amount grow by exactly the line), its pieces held on the shared pool,
// and the order seen with it everywhere (the receipt the thank-you, order, tracking and invoice pages read; the admin's
// order view). SIM-F-004 (required): once a courier is booked nothing is added. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orderReceipt } from '@extas/checkout';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { addLine, addOnState, confirmOrder, customerAddOn, customerRemoveAddOn, getOrder, orderStep, removeLine, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const ON = { enabled: true, until: 'confirmed', windowMinutes: 0, maxLines: 2, maxUnits: 2 };

describe.skipIf(!HAS_TEST_DB)('PR 127 · "Add to this parcel" (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const me = (o: { visitorId: string }) => ({ storeId: f.S, customerId: null, visitorId: o.visitorId });
  const price = async (variantId: string) => (await db().productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { priceMinor: true } })).priceMinor!;
  const held = (orderId: string, variantId: string) => db().stockReservation.aggregate({ where: { orderId, variantId, cartId: null, status: 'CONVERTED', releasedAt: null }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0);

  beforeAll(async () => {
    f = await setUpOrders('addon');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off by default: the window says so and a customer add is refused', async () => {
    const o = await f.place('addon-off');
    expect(await addOnState(f.ordersDeps(), me(o), o.number)).toMatchObject({ open: false, closed: 'OFF', lines: [] });
    expect(await code(customerAddOn(f.ordersDeps(), me(o), { number: o.number, variantId: f.v.teeM }))).toBe('ADD_ON_CLOSED');
  });

  it('a real line: priced as its product page, nothing else priced again, the money consistent, the pieces held, seen everywhere', async () => {
    f.overrides.set('orders.addOn', ON);
    try {
      const o = await f.place('addon-add');
      const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      const firstLines = await db().orderItem.findMany({ where: { orderId: o.orderId }, select: { id: true, unitPriceMinor: true, lineTotalMinor: true } });
      expect(await addOnState(f.ordersDeps(), me(o), o.number)).toMatchObject({ open: true, closed: null, maxLines: 2, maxUnits: 2, dueMinor: before.codAmountMinor });
      const tee = await price(f.v.teeM);
      const r = await customerAddOn(f.ordersDeps(), me(o), { number: o.number, variantId: f.v.teeM, quantity: 2 });
      expect(r).toMatchObject({ command: 'addLine', status: 'PLACED', version: before.version + 1 });
      const after = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      expect(after).toMatchObject({
        subtotalMinor: before.subtotalMinor + 2 * tee,
        totalMinor: before.totalMinor + 2 * tee,
        codAmountMinor: before.codAmountMinor + 2 * tee,
        deliveryChargeMinor: before.deliveryChargeMinor,
        discountMinor: before.discountMinor,
        status: 'PLACED',
      });
      // the first lines are exactly as stored
      expect(await db().orderItem.findMany({ where: { orderId: o.orderId, isAddOn: false }, select: { id: true, unitPriceMinor: true, lineTotalMinor: true } })).toEqual(firstLines);
      const added = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId, isAddOn: true } });
      expect(added).toMatchObject({ variantId: f.v.teeM, quantity: 2, unitPriceMinor: tee, lineTotalMinor: 2 * tee, discountMinor: 0, addedVia: 'thanks', status: 'ACTIVE' });
      expect(await held(o.orderId, f.v.teeM)).toBe(2);
      const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.addLine' } });
      expect(ev).toMatchObject({ actorType: 'CUSTOMER', fromStatus: 'PLACED', toStatus: null });
      // the receipt (thank-you, order page, tracking, invoice) and the admin's order view
      const receipt = await orderReceipt(f.deps(), { storeId: f.S, visitorId: o.visitorId, number: o.number });
      expect(receipt!.lines.find((l) => l.isAddOn)).toMatchObject({ quantity: 2 });
      expect(receipt!.totalMinor).toBe(after.totalMinor);
      expect(receipt!.pay).toEqual({ kind: 'cod', dueMinor: after.codAmountMinor });
      const admin = await getOrder(f.ordersDeps(), f.reader, o.orderId);
      expect(admin.items.find((i) => i.isAddOn)).toMatchObject({ addedVia: 'thanks', lineTotalMinor: 2 * tee });
      // the same piece twice, more pieces than allowed, more lines than allowed
      expect(await code(customerAddOn(f.ordersDeps(), me(o), { number: o.number, variantId: f.v.teeM }))).toBe('ADD_ON_LIMIT');
      expect(await code(customerAddOn(f.ordersDeps(), me(o), { number: o.number, variantId: f.v.linenM, quantity: 3 }))).toBe('ADD_ON_LIMIT');
      await customerAddOn(f.ordersDeps(), me(o), { number: o.number, variantId: f.v.linenM });
      expect(await code(customerAddOn(f.ordersDeps(), me(o), { number: o.number, variantId: f.v.whiteM }))).toBe('ADD_ON_LIMIT');
      // taken out again: the money and the pieces come back exactly
      const linen = await price(f.v.linenM);
      const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId, variantId: f.v.linenM, isAddOn: true } });
      await customerRemoveAddOn(f.ordersDeps(), me(o), { number: o.number, lineId: line.id });
      const out = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      expect(out.codAmountMinor).toBe(after.codAmountMinor);
      expect(await db().orderItem.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: 'REMOVED' });
      expect(await held(o.orderId, f.v.linenM)).toBe(0);
      expect(linen).toBeGreaterThan(0);
      // the first line is not his to take out this way
      expect(await code(customerRemoveAddOn(f.ordersDeps(), me(o), { number: o.number, lineId: firstLines[0]!.id }))).toBe('ADD_ON_ONLY');
      // nobody else's order
      expect(await code(customerAddOn(f.ordersDeps(), { storeId: f.S, customerId: null, visitorId: 'test-visitor-someone-else-000' }, { number: o.number, variantId: f.v.whiteM }))).toBe('NOT_FOUND');
    } finally {
      f.overrides.delete('orders.addOn');
    }
  });

  it('SIM-F-004 (required): after booking nothing is added or taken out — by the customer or the team', async () => {
    f.overrides.set('orders.addOn', ON);
    try {
      const o = await f.place('addon-booked');
      await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
      await customerAddOn(f.ordersDeps(), me(o), { number: o.number, variantId: f.v.teeM });
      const added = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId, isAddOn: true } });
      // the ERP already had the confirmed order: it is sent again as revision 1 with the new line
      const pushes = await db().erpPush.findMany({ where: { referenceId: o.orderId, documentType: 'order.create' }, orderBy: { createdAt: 'asc' }, select: { idempotencyKey: true } });
      expect(pushes.map((p) => p.idempotencyKey)).toEqual([`order:${o.orderId}:create`, `order:${o.orderId}:create:r1`]);
      await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
      const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      expect(await addOnState(f.ordersDeps(), me(o), o.number)).toMatchObject({ open: false, closed: 'BOOKED' });
      // the machine refuses first, for everyone (the courier's parcel is the parcel)
      expect(await code(customerAddOn(f.ordersDeps(), me(o), { number: o.number, variantId: f.v.linenM }))).toBe('BOOKED');
      expect(await code(customerRemoveAddOn(f.ordersDeps(), me(o), { number: o.number, lineId: added.id }))).toBe('BOOKED');
      expect(await code(addLine(f.ordersDeps(), f.staff, o.orderId, { variantId: f.v.linenM }))).toBe('BOOKED');
      expect(await code(removeLine(f.ordersDeps(), f.staff, o.orderId, added.id))).toBe('BOOKED');
      const after = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      expect(after).toMatchObject({ version: before.version, totalMinor: before.totalMinor, codAmountMinor: before.codAmountMinor });
      expect(await db().orderItem.count({ where: { orderId: o.orderId, status: 'ACTIVE' } })).toBe(2);
    } finally {
      f.overrides.delete('orders.addOn');
    }
  });

  it("the owner's step and time; Cash on Delivery only; the band's COD limit; the team's own permission", async () => {
    f.overrides.set('orders.addOn', { ...ON, until: 'placed' });
    try {
      const o = await f.place('addon-step');
      await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
      expect((await addOnState(f.ordersDeps(), me(o), o.number)).closed).toBe('STEP');
      f.overrides.set('orders.addOn', { ...ON, windowMinutes: 30 });
      const t = await f.place('addon-time');
      f.clock.now = new Date(f.clock.now.getTime() + 31 * 60_000);
      expect((await addOnState(f.ordersDeps(), me(t), t.number)).closed).toBe('TIME');
      expect(await code(customerAddOn(f.ordersDeps(), me(t), { number: t.number, variantId: f.v.teeM }))).toBe('ADD_ON_CLOSED');
      // the team is not held to the customer's window, only to the machine
      expect((await addLine(f.ordersDeps(), f.staff, t.orderId, { variantId: f.v.teeM })).command).toBe('addLine');
      expect(await code(addLine(f.ordersDeps(), f.reader, t.orderId, { variantId: f.v.linenM }))).not.toBe('ok');
      expect(await code(addLine(f.ordersDeps(), f.staff, t.orderId, { variantId: randomUUID() }))).toBe('NOT_SELLABLE');
      // picking started: the parcel is being made, nothing more goes in
      await confirmOrder(f.ordersDeps(), f.staff, t.orderId);
      await orderStep(f.ordersDeps(), { storeId: f.S, orderId: t.orderId }, systemBy(), 'startPicking');
      expect(await code(addLine(f.ordersDeps(), f.staff, t.orderId, { variantId: f.v.linenM }))).toBe('ILLEGAL_TRANSITION');
      // a prepaid order: its extra amount would need a payment of its own
      const pre = await f.place('addon-prepaid', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
      expect((await addOnState(f.ordersDeps(), me(pre), pre.number)).closed).toBe('NOT_COD');
      expect(await code(addLine(f.ordersDeps(), f.staff, pre.orderId, { variantId: f.v.teeM }))).toBe('NOT_COD');
      // the band's COD limit
      const c = await f.place('addon-limit');
      const row = await db().order.findUniqueOrThrow({ where: { id: c.orderId }, select: { codAmountMinor: true, deliveryBandId: true } });
      await db().deliveryBand.update({ where: { id: row.deliveryBandId! }, data: { codLimitMinor: row.codAmountMinor + 1 } });
      try {
        expect(await code(addLine(f.ordersDeps(), f.staff, c.orderId, { variantId: f.v.teeM }))).toBe('COD_LIMIT');
      } finally {
        await db().deliveryBand.update({ where: { id: row.deliveryBandId! }, data: { codLimitMinor: null } });
      }
    } finally {
      f.overrides.delete('orders.addOn');
    }
  });
});
