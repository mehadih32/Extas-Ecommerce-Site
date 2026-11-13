// S28 · PR 669 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the replacement case. Off as shipped; on, a
// defective or wrong piece of a delivered order is sent again free through the exchange's own approval: the same piece, the new
// parcel costs the customer nothing (no price difference, no charge, no wallet credit), the old piece is due back by the owner's
// days, and the case is marked REPLACEMENT on the returns board. Its own hours; the exchange rule is untouched. Made-up values.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { registry } from '@extas/settings';
import { approveExchange, confirmOrder, exchangeDetail, listExchanges, openExchange, openReplacement, orderStep, replacementView, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 669 · replacement case (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');
  const rule = (v: Partial<(typeof registry)['returns.replacement']['default']>) => f.overrides.set('returns.replacement', { ...registry['returns.replacement'].default, ...v });
  const lineOf = (orderId: string) => db().orderItem.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: 'asc' } });

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
    f = await setUpOrders('replacement');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped: refused, and the view says why', async () => {
    expect(registry['returns.replacement'].default).toEqual({ enabled: false, hours: 168, oldPieceDays: 7, reasons: ['defect', 'damage', 'wrong'] });
    const o = await delivered('rp-off');
    const line = await lineOf(o.orderId);
    expect(await code(openReplacement(d(), f.staff, o.orderId, { reason: 'defect', items: [{ orderItemId: line.id }] }))).toBe('EXCHANGE_CLOSED');
    expect(await replacementView(d(), f.staff, o.orderId)).toMatchObject({ enabled: false, canOpen: false, closed: 'off', lines: [] });
  });

  it('on: the same piece is sent again free; nothing to pay, no credit; the old piece is due in the owner\'s days; marked REPLACEMENT on the board', async () => {
    rule({ enabled: true, oldPieceDays: 4 });
    const o = await delivered('rp-on');
    const line = await lineOf(o.orderId);
    const view = await replacementView(d(), f.staff, o.orderId);
    expect(view).toMatchObject({ enabled: true, canOpen: true, closed: null, hours: 168, oldPieceDays: 4 });
    expect(view?.lines.map((l) => l.lineId)).toEqual([line.id]);
    const t0 = f.clock.now.getTime();
    const r = await openReplacement(d(), f.staff, o.orderId, { reason: 'defect', reasonNote: 'a seam came apart', items: [{ orderItemId: line.id }] });
    expect(r.status).toBe('REQUESTED');
    expect(r.money).toMatchObject({ differenceMinor: 0, creditMinor: 0, chargeMinor: 0, codMinor: 0, owedMinor: 0 });
    const ex = await exchangeDetail(d(), f.staff, r.exchangeId);
    expect(ex).toMatchObject({ kind: 'REPLACEMENT', reason: 'defect', isOurMistake: true, money: { differenceMinor: 0, creditMinor: 0, chargeMinor: 0, codMinor: 0 } });
    expect(ex.items[0]).toMatchObject({ newVariantId: line.variantId, newSku: line.sku });
    const row = await db().exchange.findUniqueOrThrow({ where: { id: r.exchangeId } });
    expect(row.oldPieceDueAt!.getTime() - t0).toBeGreaterThan(3.9 * 86_400_000);
    expect(row.oldPieceDueAt!.getTime() - t0).toBeLessThan(4.1 * 86_400_000);
    expect((await listExchanges(d(), f.staff, {})).find((x) => x.id === r.exchangeId)?.kind).toBe('REPLACEMENT');
    // one case per piece at a time
    expect(await code(openReplacement(d(), f.staff, o.orderId, { reason: 'defect', items: [{ orderItemId: line.id }] }))).toBe('EXCHANGE_LIMIT');
    expect((await replacementView(d(), f.staff, o.orderId))?.lines).toEqual([]);
    // approving goes through the exchange's own approval: the new parcel costs the customer nothing
    const ap = await approveExchange(d(), f.staff, r.exchangeId, { note: 'send again' });
    const n = await db().order.findUniqueOrThrow({ where: { id: ap.newOrderId }, include: { items: true } });
    expect(n.totalMinor).toBe(0);
    expect(n.codAmountMinor).toBe(0);
    expect(n.items[0]).toMatchObject({ variantId: line.variantId, lineTotalMinor: 0 });
    // the old piece comes back: its pick-up is open
    expect(await db().returnRecord.count({ where: { exchangeId: r.exchangeId, kind: 'EXCHANGE_PICKUP' } })).toBe(1);
  });

  it('only its own reasons, its own hours; a size swap is not a replacement; the exchange rule is not touched', async () => {
    rule({ enabled: true, reasons: ['wrong'], hours: 24 });
    const o = await delivered('rp-rules');
    const line = await lineOf(o.orderId);
    expect(await code(openReplacement(d(), f.staff, o.orderId, { reason: 'defect', items: [{ orderItemId: line.id }] }))).toBe('NOT_EXCHANGEABLE');
    expect(await code(openReplacement(d(), f.staff, o.orderId, { reason: 'size' as never, items: [{ orderItemId: line.id }] }))).toBe('INVALID_INPUT');
    // 25 hours after delivery the window of 24 hours has passed, the exchange's own 72 hours have not
    f.clock.now = new Date(f.clock.now.getTime() + 25 * 3_600_000);
    expect(await replacementView(d(), f.staff, o.orderId)).toMatchObject({ canOpen: false, closed: 'PASSED' });
    expect(await code(openReplacement(d(), f.staff, o.orderId, { reason: 'wrong', rootCause: 'wrong-pick', items: [{ orderItemId: line.id }] }))).toBe('EXCHANGE_CLOSED');
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    expect((await exchangeDetail(d(), f.staff, ex.exchangeId)).kind).toBe('EXCHANGE');
  });

  it('refuses a person without the key and an order that is not delivered', async () => {
    rule({ enabled: true });
    const o = await f.place('rp-undelivered');
    const line = await lineOf(o.orderId);
    expect(await code(openReplacement(d(), f.reader, o.orderId, { reason: 'defect', items: [{ orderItemId: line.id }] }))).toBe('FORBIDDEN');
    expect(await code(openReplacement(d(), f.staff, o.orderId, { reason: 'defect', items: [{ orderItemId: line.id }] }))).toBe('ILLEGAL_TRANSITION');
    expect(await replacementView(d(), f.staff, o.orderId)).toMatchObject({ canOpen: false, closed: 'NOT_DELIVERED' });
  });
});
