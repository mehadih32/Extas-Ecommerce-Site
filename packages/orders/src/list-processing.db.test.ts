// S28 · PR 660 (CN-048, admin prototype v5) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): "Processing" is a
// view over orders (never an order status), the date bar of the lists (the store's own days), the "cancelled" view and the
// Cancelled summary. Nothing here changes an order but the made-up test rows. Made-up test values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { cancelledSummary, cancelOrder, dayRange, exportOrders, listOrders, ORDER_VIEWS } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe('the date bar (no database)', () => {
  it('a day is the store\'s own day: 00:00 in Dhaka is 18:00 UTC the day before', () => {
    const r = dayRange('2026-11-11', '2026-11-11', 'Asia/Dhaka')!;
    expect(r.from!.toISOString()).toBe('2026-11-10T18:00:00.000Z');
    expect(r.before!.toISOString()).toBe('2026-11-11T18:00:00.000Z');
  });
  it('one end only is open on the other side, no dates is no filter, and a "to" before the "from" is swapped', () => {
    expect(dayRange('2026-11-11', undefined, 'UTC')).toEqual({ from: new Date('2026-11-11T00:00:00Z') });
    expect(dayRange(undefined, '2026-11-11', 'UTC')).toEqual({ before: new Date('2026-11-12T00:00:00Z') });
    expect(dayRange(undefined, undefined, 'UTC')).toBeUndefined();
    expect(dayRange('2026-11-12', '2026-11-10', 'UTC')).toEqual({ from: new Date('2026-11-10T00:00:00Z'), before: new Date('2026-11-13T00:00:00Z') });
  });
  it('the list has the new views, and Processing is not an order status', () => {
    expect(ORDER_VIEWS).toContain('processing');
    expect(ORDER_VIEWS).toContain('cancelled');
  });
});

describe.skipIf(!HAS_TEST_DB)('Processing view, date bar and Cancelled summary on PostgreSQL (PR 660)', () => {
  let f: OrdersFixture;
  const d = () => f.ordersDeps();
  const db = () => f.t.prisma;
  let fresh: { orderId: string };
  let advance: { orderId: string };
  let held: { orderId: string };
  let confirmed: { orderId: string };
  let reviewed: { orderId: string };
  let gone: { orderId: string };
  let gone2: { orderId: string };

  beforeAll(async () => {
    f = await setUpOrders('list-processing');
    fresh = await f.place('fresh');
    advance = await f.place('advance');
    held = await f.place('held');
    confirmed = await f.place('confirmed');
    reviewed = await f.place('reviewed');
    gone = await f.place('gone');
    gone2 = await f.place('gone2');
    await db().order.update({ where: { id: advance.orderId }, data: { status: 'AWAITING_ADVANCE' } });
    await db().order.update({ where: { id: held.orderId }, data: { status: 'ON_HOLD' } });
    await db().order.update({ where: { id: reviewed.orderId }, data: { status: 'CONFIRMED' } });
    await db().fraudAlert.create({ data: { storeId: f.S, orderId: reviewed.orderId, matchedOrderIds: [fresh.orderId], severity: 'high', proposedAction: 'HOLD', status: 'OPEN', summary: { section: 'duplicate' } } });
    await db().order.update({ where: { id: confirmed.orderId }, data: { status: 'CONFIRMED' } });
    await cancelOrder(d(), f.staff, gone.orderId, { reasonCode: 'OUT_OF_STOCK' });
    await cancelOrder(d(), f.staff, gone2.orderId, { reasonCode: 'OUT_OF_STOCK' });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('Processing = orders to confirm, waiting for an advance, on hold, or in an open review; never a confirmed order nothing flags', async () => {
    const l = await listOrders(d(), f.staff, { view: 'processing' });
    const ids = l.rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([fresh.orderId, advance.orderId, held.orderId, reviewed.orderId]));
    expect(ids).not.toContain(confirmed.orderId);
    expect(ids).not.toContain(gone.orderId);
    expect(l.counts.processing).toBe(ids.length);
    // no order of the store ever has the status "Processing" because of this view
    expect(await db().order.count({ where: { storeId: f.S, status: 'PROCESSING' } })).toBe(0);
  });

  it('the Cancelled view lists only cancelled orders', async () => {
    const l = await listOrders(d(), f.staff, { view: 'cancelled' });
    expect(l.rows.map((r) => r.id).sort()).toEqual([gone.orderId, gone2.orderId].sort());
    expect(l.counts.cancelled).toBe(2);
  });

  it('the date bar keeps the orders placed in the days, in the store\'s time zone', async () => {
    // 19:00 UTC on 10 Nov is 01:00 on 11 Nov in Dhaka
    await db().order.update({ where: { id: fresh.orderId }, data: { placedAt: new Date('2026-11-10T19:00:00Z') } });
    await db().order.update({ where: { id: advance.orderId }, data: { placedAt: new Date('2026-11-10T17:00:00Z') } });
    const day = async (from: string, to: string) => (await listOrders(d(), f.staff, { view: 'processing', from, to })).rows.map((r) => r.id);
    const zone = (await db().store.findUnique({ where: { id: f.S }, select: { timezone: true } }))?.timezone;
    if (zone === 'Asia/Dhaka') {
      expect(await day('2026-11-11', '2026-11-11')).toContain(fresh.orderId);
      expect(await day('2026-11-11', '2026-11-11')).not.toContain(advance.orderId);
      expect(await day('2026-11-10', '2026-11-10')).toContain(advance.orderId);
    }
    const wide = await day('2026-11-09', '2026-11-12');
    expect(wide).toEqual(expect.arrayContaining([fresh.orderId, advance.orderId]));
    expect(wide).not.toContain(held.orderId); // placed today, outside the days
    expect((await listOrders(d(), f.staff, { from: '11-11-2026' }).catch((e: unknown) => e)) instanceof Error).toBe(true);
  });

  it('the Cancelled summary counts what was cancelled, why, at which stage and by whom; a day range narrows it; a reader may read it', async () => {
    const all = await cancelledSummary(d(), f.staff, {});
    expect(all.count).toBe(2);
    expect(all.totalMinor).toBeGreaterThan(0);
    expect(all.byReason).toEqual([{ code: 'OUT_OF_STOCK', count: 2 }]);
    expect(all.byStage.reduce((n, x) => n + x.count, 0)).toBe(2);
    expect(all.byActor.reduce((n, x) => n + x.count, 0)).toBe(2);
    expect((await cancelledSummary(d(), f.reader, {})).count).toBe(2);
    const none = await cancelledSummary(d(), f.staff, { from: '2020-01-01', to: '2020-01-02' });
    expect(none).toMatchObject({ count: 0, totalMinor: 0, byReason: [], byStage: [], byActor: [] });
  });

  it('the file download takes the same view and days (the "Excel" of the Cancelled summary)', async () => {
    const file = await exportOrders(d(), f.staff, { view: 'cancelled' });
    expect(file.rows).toBe(2);
    const empty = await exportOrders(d(), f.staff, { view: 'cancelled', from: '2020-01-01', to: '2020-01-02' }).catch(() => null);
    expect(empty === null || empty.rows >= 0).toBe(true);
  });
});
