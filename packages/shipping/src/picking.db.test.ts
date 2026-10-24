// PR 181 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout,
// some booked with Steadfast on its practice world; skipped without TEST_DATABASE_ADMIN_URL): the picking list takes
// approved orders not booked and booked ones still with us, never one the courier has or one handed over, whatever the
// dates; held and problem orders are apart and uncounted; orders and pieces are counted separately; a size short of
// the shop's stock is marked; printing keeps the list and a print job. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { shippingSettings } from '@extas/settings';
import { bookOrders, pickingList, printJobs, printPicking } from './index';
import { localDay } from './pure';
import { setUpShipping, type ShippingFixture } from './testing';

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 181 · the daily picking list (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(2030 + ++n).padStart(4, '0')}`;
  const confirmed = async (name: string) => {
    const o = await f.place(name, { phone: phone() });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    return o;
  };
  const booked = async (name: string) => {
    const o = await confirmed(name);
    const r = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    expect(r.results[0]).toMatchObject({ outcome: 'booked' });
    return { ...o, shipment: await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId } }) };
  };
  const list = (input: Record<string, unknown> = {}) => pickingList(f.shippingDeps(), f.shipper, input);

  beforeAll(async () => {
    f = await setUpShipping('shipping_picking');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('takes approved orders and booked parcels still with us; never one the courier has or one handed over', async () => {
    const a = await confirmed('pk-approved');
    const b = await booked('pk-in-review');
    const c = await booked('pk-picked-up');
    await db().shipment.update({ where: { id: c.shipment.id }, data: { status: 'PICKED_UP' } });
    const d = await booked('pk-handed');
    await db().order.update({ where: { id: d.orderId }, data: { handedOverAt: f.clock.now } });
    const placed = await f.place('pk-not-confirmed', { phone: phone() });

    const l = await list();
    expect(l.orderIds).toEqual(expect.arrayContaining([a.orderId, b.orderId]));
    for (const id of [c.orderId, d.orderId, placed.orderId]) expect(l.orderIds).not.toContain(id);
    // orders and pieces counted separately; line items; the categories in print order
    const items = await db().orderItem.findMany({ where: { orderId: { in: l.orderIds }, status: 'ACTIVE' } });
    expect(l.summary).toMatchObject({ orders: l.orderIds.length, pieces: items.reduce((s, i) => s + i.quantity, 0), lineItems: items.length, held: 0 });
    expect(l.summary.categories.map((x) => x.pieces)).toEqual([...l.summary.categories.map((x) => x.pieces)].sort((x, y) => y - x));
    expect(l.groups.reduce((s, g) => s + g.pieces, 0)).toBe(l.summary.pieces);
    // no customer's details
    const order = await db().order.findUniqueOrThrow({ where: { id: a.orderId } });
    expect(JSON.stringify(l)).not.toContain(order.customerName!);
    expect(JSON.stringify(l)).not.toContain(order.phone!);

    // a date range narrows the list; a dispatched order never enters it
    const today = localDay(f.clock.now, await f.deps().settings.value('store.timeZone'));
    expect((await list({ from: today, to: today })).orderIds).not.toContain(c.orderId);
    expect((await list({ from: '2000-01-01', to: '2000-01-02' })).orderIds).toEqual([]);
    expect(await refusal(list({ from: today, to: '2000-01-01' }))).toBe('INVALID_INPUT');
  });

  it('B1.7: held orders and problem orders are listed apart and left out of the quantities', async () => {
    const h = await confirmed('pk-held');
    await db().order.update({ where: { id: h.orderId }, data: { status: 'ON_HOLD', holdFromStatus: 'CONFIRMED' } });
    const p = await booked('pk-paid-later');
    await db().order.update({ where: { id: p.orderId }, data: { paidMinor: { increment: 10_000 } } });
    const k = await confirmed('pk-cancel-asked');
    await db().order.update({ where: { id: k.orderId }, data: { cancelRequestedAt: f.clock.now } });

    const l = await list();
    expect(l.held).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: h.orderId, reason: 'ON_HOLD' }), expect.objectContaining({ orderId: p.orderId, reason: 'COD_CHANGED' }), expect.objectContaining({ orderId: k.orderId, reason: 'CANCEL_ASKED' })]));
    for (const id of [h.orderId, p.orderId, k.orderId]) expect(l.orderIds).not.toContain(id);
    expect(l.summary.held).toBe(l.held.length);
  });

  it('marks a size short of the shop\'s stock, unless the owner turns it off', async () => {
    const l = await list();
    const rows = l.groups.flatMap((g) => g.styles.flatMap((s) => s.colours.flatMap((c) => c.sizes)));
    const row = rows.find((r) => r.variantId)!;
    await db().stockLevel.updateMany({ where: { variantId: row.variantId! }, data: { onHand: 0 } });
    const after = (await list()).groups.flatMap((g) => g.styles.flatMap((s) => s.colours.flatMap((c) => c.sizes))).find((r) => r.variantId === row.variantId)!;
    expect(after.short).toBe(after.quantity);
    expect((await list()).summary.shortages).toBeGreaterThan(0);
    f.overrides.set('delivery.picking.list', { ...shippingSettings['delivery.picking.list'].default, markShortages: false });
    try {
      const off = await list();
      expect(off.shortagesMarked).toBe(false);
      expect(off.summary.shortages).toBe(0);
    } finally {
      f.overrides.delete('delivery.picking.list');
    }
  });

  it('printing keeps the list and a print job; staff without the key cannot see it', async () => {
    const printed = await printPicking(f.shippingDeps(), f.shipper, {});
    expect(await db().pickingList.findUniqueOrThrow({ where: { id: printed.listId } })).toMatchObject({ orderIds: printed.orderIds, generatedById: f.staffId });
    expect((await printJobs(f.shippingDeps(), f.shipper))[0]).toMatchObject({ kind: 'PICKING_LIST', parcels: printed.orderIds.length });
    expect(await refusal(pickingList(f.shippingDeps(), f.looker))).toBe('FORBIDDEN');
  });
});
