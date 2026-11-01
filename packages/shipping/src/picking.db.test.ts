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
import { bookOrders, pickingList, printJobs, printPicking, setShelf, tickPickLine } from './index';
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

  it('PR 405: a size line marked pulled is done; a new order on it shows "more"; the mark taken back; only with the packing key; ticks are never edited', async () => {
    const a = await confirmed('pk-tick-a');
    const lineOf = (l: Awaited<ReturnType<typeof list>>, orderId: string) => l.groups.flatMap((g) => g.styles.flatMap((st) => st.colours.flatMap((c) => c.sizes))).find((z) => z.orders.some((o) => o.orderId === orderId))!;
    const before = lineOf(await list(), a.orderId);
    expect(before.tick).toEqual({ state: 'none', newOrders: [], at: null });
    expect(before.orders.find((o) => o.orderId === a.orderId)).toMatchObject({ orderNumber: expect.any(String), quantity: expect.any(Number) });

    const after = await tickPickLine(f.shippingDeps(), f.shipper, { key: before.key, ticked: true });
    const done = lineOf(after, a.orderId);
    expect(done.tick.state).toBe('done');
    expect(after.summary.pulled).toBeGreaterThanOrEqual(done.quantity);

    // a new order for the same line after the mark: "more", naming the new order
    const b = await confirmed('pk-tick-b');
    const now = await list();
    const more = lineOf(now, a.orderId);
    // (the fixture's orders all take the same sample piece)
    expect(more.orders.map((o) => o.orderId)).toContain(b.orderId);
    expect(more.tick.state).toBe('more');
    expect(more.tick.newOrders).toEqual([more.orders.find((o) => o.orderId === b.orderId)!.orderNumber]);

    const back = lineOf(await tickPickLine(f.shippingDeps(), f.shipper, { key: before.key, ticked: false }), a.orderId);
    expect(back.tick.state).toBe('none');
    const rows = await db().pickingTick.findMany({ where: { lineKey: before.key }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.ticked)).toEqual([true, false]);
    expect(rows[0]!.orderIds).toContain(a.orderId);

    expect(await refusal(tickPickLine(f.shippingDeps(), f.shipper, { key: 'no-such-line', ticked: true }))).toBe('NOT_FOUND');
    expect(await refusal(tickPickLine(f.shippingDeps(), f.shipper, { key: before.key, ticked: 'yes' }))).toBe('INVALID_INPUT');
    expect(await refusal(tickPickLine(f.shippingDeps(), f.looker, { key: before.key, ticked: true }))).toBe('FORBIDDEN');
    // the table refuses an edit or a removal (migration 0110's trigger)
    expect(await refusal(db().pickingTick.update({ where: { id: rows[0]!.id }, data: { ticked: false } }))).not.toBe('ok');
    expect(await refusal(db().pickingTick.delete({ where: { id: rows[0]!.id } }))).not.toBe('ok');
  });

  it('PR 412: shelf by shelf only when the owner chooses it; a shelf set, moved and cleared is a new row each time, audited; only with the shelf key', async () => {
    const a = await confirmed('pk-shelf-a');
    const productId = (await db().orderItem.findFirstOrThrow({ where: { orderId: a.orderId } })).productId!;
    const first = await list();
    expect(first.sort).toBe('category');
    expect(first.shelves.find((x) => x.productId === productId)).toMatchObject({ code: null });

    expect(await setShelf(f.shippingDeps(), f.shipper, { productId, code: ' B-07 ' })).toEqual({ productId, code: 'B-07', changed: true });
    expect(await setShelf(f.shippingDeps(), f.shipper, { productId, code: 'B-07' })).toMatchObject({ changed: false });
    // the category list does not move with a shelf
    const still = await list();
    expect(still.groups.map((g) => g.category)).toEqual(first.groups.map((g) => g.category));
    expect(still.shelves.find((x) => x.productId === productId)).toMatchObject({ code: 'B-07' });

    f.overrides.set('fulfilment.picking.sort', { mode: 'bin' });
    try {
      const shelf = await list();
      expect(shelf.sort).toBe('bin');
      const g = shelf.groups.find((x) => x.styles.some((st) => st.styleKey === productId))!;
      expect(g.category).toBe('B-07');
      // the summary keeps its categories and the same pieces
      expect(shelf.summary.categories).toEqual(still.summary.categories);
      expect(shelf.summary.pieces).toBe(still.summary.pieces);
      await setShelf(f.shippingDeps(), f.shipper, { productId, code: 'C-01' });
      expect((await list()).groups.find((x) => x.styles.some((st) => st.styleKey === productId))!.category).toBe('C-01');
      await setShelf(f.shippingDeps(), f.shipper, { productId, code: '' });
      const cleared = await list();
      expect(cleared.groups.find((x) => x.styles.some((st) => st.styleKey === productId))!.category).toBe('');
      expect(cleared.shelves.find((x) => x.productId === productId)).toMatchObject({ code: null });
    } finally {
      f.overrides.delete('fulfilment.picking.sort');
    }
    const rows = await db().shelfBin.findMany({ where: { productId }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.code)).toEqual(['B-07', 'C-01', '']);
    expect(await db().auditLog.count({ where: { entityType: 'ShelfBin', entityId: { in: rows.map((r) => r.id) } } })).toBe(3);

    expect(await refusal(setShelf(f.shippingDeps(), f.shipper, { productId: '01900000-0000-7000-8000-000000000000', code: 'A-1' }))).toBe('NOT_FOUND');
    expect(await refusal(setShelf(f.shippingDeps(), f.shipper, { productId, code: 'x'.repeat(41) }))).toBe('INVALID_INPUT');
    expect(await refusal(setShelf(f.shippingDeps(), f.looker, { productId, code: 'A-1' }))).toBe('FORBIDDEN');
    // the table refuses an edit or a removal (migration 0111's trigger)
    expect(await refusal(db().shelfBin.update({ where: { id: rows[0]!.id }, data: { code: 'Z' } }))).not.toBe('ok');
    expect(await refusal(db().shelfBin.delete({ where: { id: rows[0]!.id } }))).not.toBe('ok');
  });
});
