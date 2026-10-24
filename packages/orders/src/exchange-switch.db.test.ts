// PR 188 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the exchange variant switcher. Another size of
// the same product and colour at the same price, stock-checked; on an approved exchange the linked exchange order's
// line changes through the order service's edit, the old size let go and the new one held under the checkout's row
// locks (OUT_OF_STOCK changes nothing). SIM-F-022: the SKU coming back is untouched by a switch. Made-up test values.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { approveExchange, confirmOrder, exchangeDetail, exchangeSizes, openExchange, orderStep, switchExchangeVariant, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 188 · the exchange variant switcher (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  let skyXl: string;
  let skyXxl: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');
  const stock = (variantId: string, n: number) => db().stockLevel.updateMany({ where: { variantId }, data: { onHand: n, available: n } });
  const held = (orderId: string) => db().stockReservation.findMany({ where: { orderId, status: 'CONVERTED', releasedAt: null }, select: { variantId: true, quantity: true } });

  async function delivered(name: string) {
    const o = await f.place(name);
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    await orderStep(d(), r, by, 'delivered');
    return o;
  }

  beforeAll(async () => {
    f = await setUpOrders('exchange_switch');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
    skyXl = f.variant('oxford-cotton-shirt', 'sky', 'XL').id;
    skyXxl = f.variant('oxford-cotton-shirt', 'sky', 'XXL').id;
    await stock(skyXl, 10);
    await stock(skyXxl, 0);
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('requested: another size of the same piece at the same price, stock-checked; never another colour', async () => {
    const o = await delivered('sw-requested');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    const [sizes] = await exchangeSizes(d(), f.staff, ex.exchangeId);
    expect(sizes!.sizes.find((s) => s.current)?.variantId).toBe(f.v.skyL);
    expect(sizes!.sizes.map((s) => s.sizeKey)).toEqual(['s', 'm', 'l', 'xl', 'xxl']);
    expect(sizes!.sizes.every((s) => s.samePrice)).toBe(true);
    const item = (await exchangeDetail(d(), f.staff, ex.exchangeId)).items[0]!;
    const v0 = (await exchangeDetail(d(), f.staff, ex.exchangeId)).version;

    expect(await code(switchExchangeVariant(d(), f.staff, ex.exchangeId, { exchangeItemId: item.id, newVariantId: f.v.whiteM }))).toBe('NOT_SAME_PIECE');
    expect(await code(switchExchangeVariant(d(), f.staff, ex.exchangeId, { exchangeItemId: item.id, newVariantId: skyXxl }))).toBe('OUT_OF_STOCK');
    expect(await code(switchExchangeVariant(d(), f.staff, ex.exchangeId, { exchangeItemId: item.id, newVariantId: f.v.skyL }))).toBe('NOTHING_CHANGED');
    expect(await code(switchExchangeVariant(d(), f.staff, ex.exchangeId, { exchangeItemId: item.id, newVariantId: skyXl }, { version: v0 + 9 }))).toBe('STALE');
    expect(await code(switchExchangeVariant(d(), f.reader, ex.exchangeId, { exchangeItemId: item.id, newVariantId: skyXl }))).toBe('FORBIDDEN');

    const sw = await switchExchangeVariant(d(), f.staff, ex.exchangeId, { exchangeItemId: item.id, newVariantId: skyXl }, { version: v0 });
    expect(sw).toMatchObject({ newOrderId: null, from: { variantId: f.v.skyL }, to: { variantId: skyXl } });
    const after = await exchangeDetail(d(), f.staff, ex.exchangeId);
    expect(after.items[0]).toMatchObject({ newSizeLabel: 'XL', newUnitMinor: item.newUnitMinor, oldSku: line.sku });
    expect(after.money).toEqual((await exchangeDetail(d(), f.staff, ex.exchangeId)).money);
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'exchange.switched' } })).toBe(1);
  });

  it('approved: the exchange order line changes through the edit — old size let go, new size held; out of stock changes nothing', async () => {
    const o = await delivered('sw-approved');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    const ap = await approveExchange(d(), f.staff, ex.exchangeId);
    expect(await held(ap.newOrderId)).toEqual([{ variantId: f.v.skyL, quantity: 1 }]);
    const item = (await exchangeDetail(d(), f.staff, ex.exchangeId)).items[0]!;
    const before = await db().order.findUniqueOrThrow({ where: { id: ap.newOrderId } });

    expect(await code(switchExchangeVariant(d(), f.staff, ex.exchangeId, { exchangeItemId: item.id, newVariantId: skyXxl }))).toBe('OUT_OF_STOCK');
    expect(await held(ap.newOrderId)).toEqual([{ variantId: f.v.skyL, quantity: 1 }]);
    expect((await exchangeDetail(d(), f.staff, ex.exchangeId)).items[0]!.newVariantId).toBe(f.v.skyL);

    const sw = await switchExchangeVariant(d(), f.staff, ex.exchangeId, { exchangeItemId: item.id, newVariantId: skyXl });
    expect(sw).toMatchObject({ newOrderId: ap.newOrderId, to: { variantId: skyXl } });
    expect(await held(ap.newOrderId)).toEqual([{ variantId: skyXl, quantity: 1 }]);
    const nl = await db().orderItem.findFirstOrThrow({ where: { orderId: ap.newOrderId, status: 'ACTIVE' } });
    expect(nl).toMatchObject({ variantId: skyXl, sizeLabel: 'XL', unitPriceMinor: item.newUnitMinor });
    const nowOrder = await db().order.findUniqueOrThrow({ where: { id: ap.newOrderId } });
    expect(nowOrder).toMatchObject({ version: before.version + 1, totalMinor: before.totalMinor, codAmountMinor: before.codAmountMinor });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: ap.newOrderId, type: 'order.edit' } });
    expect(ev.data).toMatchObject({ exchange: { id: ex.exchangeId } });
    // the pick-up still expects the old piece (SIM-F-022: a switch never touches what comes back)
    const ret = await db().returnItem.findFirstOrThrow({ where: { returnId: ap.returnId } });
    expect(ret.expectedSku).toBe(line.sku);
  });
});
