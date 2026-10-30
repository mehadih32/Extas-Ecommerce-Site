// CN-028 · PR 614 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): an exchange through the store's own
// ERP on contract v6. Within the exchange window from the courier's "delivered", an admin approves the exchange and the
// old order's lines are marked; the ERP's live stock is checked first (regular orders come first: the exchange waits and
// the admin is told); the new order names the old order and the line it replaces, with a clear note; a dearer piece is
// the customer's only when `exchange.passPriceRiseToCustomer` is on, and no credit is ever due; the 4-day watch, the
// risk list from `GET /exchanges?status=pending`, the late-return mark; the original sale stands. Store A's exchanges
// never reach store B. qa-gate (30 Oct): the window counts from the courier's result as PR 611 sent it to the ERP; a
// refusal never locks the line; two approvals or two late-return presses do the thing once; a refusal while waiting
// for stock stops the retries; an account hold never pauses an exchange; only the lines the customer kept are
// exchanged; the exchange parcel's result goes by PR 611 and its cancel by PR 610's relay. Every value is a made-up
// test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { erpCheckoutPaused, noteHold, storeDate } from '@extas/inventory';
import { cancelOrder, orderStep } from './commands';
import {
  approveExchangeFor,
  approveExchangeV6,
  closeHandbackList,
  exchangeErpState,
  exchangeWatch,
  exchangeWindowV6,
  markExchangeLateReturn,
  openExchange,
  openHandbackList,
  refuseExchange,
  runErpReturns,
  scanHandbackParcel,
  syncErpExchanges,
  systemBy,
} from './index';
import { setUpErpOrders, type ErpFixture, type ShippedOrder } from './test/erp-v6-fixture';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}
async function data(p: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await p;
    return {};
  } catch (e) {
    return (e as { data?: Record<string, unknown> }).data ?? {};
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 614 · an exchange through the ERP (PostgreSQL, ERP contract v6)', () => {
  let f: ErpFixture;
  const db = () => f.t.prisma;
  const d = () => f.erpDeps();
  const erp = () => f.world.v6('SAMPLE-CO-1');
  const lineOf = (orderId: string) => db().orderItem.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  /** Shipped through the ERP and delivered; an exchange of its first line for size L opened. */
  async function opened(name: string, quantity = 1): Promise<{ o: ShippedOrder; exchangeId: string }> {
    const o = await f.shipped(name, [{ variantId: f.v.skyM, quantity }]);
    await f.delivered(o);
    const line = await lineOf(o.orderId);
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL, quantity: 1 }] });
    return { o, exchangeId: ex.exchangeId };
  }
  let skyL = '';
  const HOUR = 3_600_000;
  /** Every `POST /orders` the practice ERP gets while `fn` runs (an exchange order is one of them). */
  async function erpOrderPosts<T>(fn: () => Promise<T>): Promise<{ value: T; posts: number }> {
    const count = () => f.world.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/orders')).length;
    const before = count();
    const value = await fn();
    return { value, posts: count() - before };
  }

  beforeAll(async () => {
    f = await setUpErpOrders('exchange_v6');
    skyL = await f.sku(f.v.skyL);
    for (const id of Object.values(f.v)) f.world.setStock(await f.sku(id), 'SAMPLE-WH-1', { onHand: 50 });
  });
  afterAll(async () => {
    f?.restore();
    await f?.t.drop();
  });

  it('a store still on v5 approves the old way: the ERP path refuses', async () => {
    const o = await f.shipped('xv-v5');
    await f.delivered(o);
    const line = await lineOf(o.orderId);
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    expect(await code(approveExchangeV6(d(), f.staff, ex.exchangeId))).toBe('ERP_MODEL');
    expect(await approveExchangeFor(d(), f.staff, ex.exchangeId)).toMatchObject({ exchangeId: ex.exchangeId, newOrderId: expect.any(String) });
  });

  it('approved within the window: the ERP takes a new order naming the old line, no bill, no credit; the original sale stands', async () => {
    f.v6();
    const { o, exchangeId } = await opened('xv-one', 2);
    const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(await code(approveExchangeV6(d(), f.reader, exchangeId))).toBe('FORBIDDEN');
    const r = await approveExchangeV6(d(), f.staff, exchangeId, { note: 'size M for size L', lines: [{ exchangeItemId: (await db().exchangeItem.findFirstOrThrow({ where: { exchangeId } })).id, lineIds: [o.lineIds[1]!] }] });
    expect(r).toMatchObject({ status: 'SENT', newExternalOrderId: `${o.ext}-X1`, erpExchangeId: expect.any(String), customerPaysMinor: 0, attempts: 1 });

    const ex = await db().exchange.findUniqueOrThrow({ where: { id: exchangeId } });
    expect(ex).toMatchObject({ status: 'APPROVED', newOrderId: r.newOrderId, walletCreditMinor: 0 });
    const link = await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId }, include: { lines: true } });
    expect(link).toMatchObject({ ofExternalOrderId: o.ext, newExternalOrderId: `${o.ext}-X1`, erpStatus: 'WAITING_DELIVERY', newOrderId: r.newOrderId, sendAttempts: 1, approvedById: f.staff.actor.staffUserId });
    expect(link.note).toContain(o.ext);
    expect(link.note).toContain('size M for size L');
    expect(link.lines).toEqual([expect.objectContaining({ oldLineId: o.lineIds[1], newLineId: `${o.ext}-X1-1`, newSku: skyL, oldShopPriceMinor: 90_000, newShopPriceMinor: 90_000, customerPaysMinor: 0 })]);
    // the new order is the ERP's under its own id, naming the old one; it is not a sale
    const eo = await db().erpOrder.findFirstOrThrow({ where: { orderId: r.newOrderId! }, include: { lines: true } });
    expect(eo).toMatchObject({ externalOrderId: `${o.ext}-X1`, exchangeOfId: o.orderId, erpTotalMinor: 0n });
    expect(eo.lines).toEqual([expect.objectContaining({ lineId: `${o.ext}-X1-1`, replacesLineId: o.lineIds[1], sku: skyL, shopPriceMinor: 90_000 })]);
    const x = [...erp().exchanges.values()].find((e) => e.externalOrderId === `${o.ext}-X1`)!;
    expect(x).toMatchObject({ ofExternalOrderId: o.ext, status: 'WAITING_DELIVERY', billed: false });
    expect(x.lines[0]).toMatchObject({ replacesLineId: o.lineIds[1] });
    // the original sale is as it was
    const after = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect({ status: after.status, totalMinor: after.totalMinor, paidMinor: after.paidMinor }).toEqual({ status: before.status, totalMinor: before.totalMinor, paidMinor: before.paidMinor });
    expect(await exchangeErpState(d(), f.staff, exchangeId)).toMatchObject({ status: 'WAITING_DELIVERY', erpExchangeId: r.erpExchangeId, newExternalOrderId: `${o.ext}-X1`, waitingStock: false, finished: false });
    // the same exchange is never sent twice: approving it again gives the same answer and asks the ERP nothing
    const again = await erpOrderPosts(() => approveExchangeV6(d(), f.staff, exchangeId));
    expect(again.value).toMatchObject({ status: 'SENT', erpExchangeId: r.erpExchangeId, newOrderId: r.newOrderId, newExternalOrderId: `${o.ext}-X1` });
    expect(again.posts).toBe(0);
    // the send is in the store's ERP outbox as the new order's document (its shipment, result and cancel follow it)
    expect(await db().erpPush.findFirst({ where: { storeId: f.S, referenceId: r.newOrderId!, documentType: 'order.create' } })).toMatchObject({ status: 'SENT', idempotencyKey: `exchange:${exchangeId}:a1` });

    // the exchange parcel is delivered: PR 611 tells the ERP; the 4-day watch starts; it is on the risk list
    await f.courierResult(r.newOrderId!, 'DELIVERED');
    expect(await db().erpPush.count({ where: { storeId: f.S, referenceId: r.newOrderId!, documentType: 'order.delivery', status: 'SENT' } })).toBe(1);
    await syncErpExchanges(d(), f.S);
    const watched = await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId } });
    expect(watched.erpStatus).toBe('WAITING_RETURN');
    expect(watched.deadline).not.toBeNull();
    const w = await exchangeWatch(d(), f.staff);
    expect(w.source).toBe('erp');
    expect(w.rows).toEqual([expect.objectContaining({ exchangeId, erpStatus: 'WAITING_RETURN', atRiskMinor: 90_000, daysLeft: 4, late: false })]);
    expect(w.totalAtRiskMinor).toBe(90_000);

    // the old piece comes back on the exchange parcel's return; the owner approves it: settled even, the exchange is done
    const list = await openHandbackList(d(), f.staff, { courier: 'hand', handedBackAt: storeDate(f.clock.now, 'Asia/Dhaka') });
    await scanHandbackParcel(d(), f.staff, list.id, { code: r.newOrderNumber!, receivedCount: 1 });
    expect((await closeHandbackList(d(), f.staff, list.id)).parcels[0]).toMatchObject({ result: 'IN_RETURN_STOCK', exchange: true });
    erp().decidePiece(o.ext, o.lineIds[1]!, 'APPROVED');
    await syncErpExchanges(d(), f.S);
    const done = await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId } });
    expect(done).toMatchObject({ erpStatus: 'SETTLED', settledKind: 'EVEN' });
    expect(done.finishedAt).not.toBeNull();
    expect((await db().exchange.findUniqueOrThrow({ where: { id: exchangeId } })).status).toBe('COMPLETED');
    expect((await exchangeWatch(d(), f.staff)).rows).toEqual([]);
  });

  it('only within the window from the courier`s "delivered" as the ERP has it: 72 h − 1 ms is open, 72 h is closed', async () => {
    const { o, exchangeId } = await opened('xv-late');
    const start = f.clock.now;
    // the courier's result went to the ERP at `start`; the shop's own delivered mark says two days later
    expect(await db().erpDeliveryResult.findFirstOrThrow({ where: { erpOrder: { orderId: o.orderId } } })).toMatchObject({ outcome: 'DELIVERED', at: start });
    await db().order.update({ where: { id: o.orderId }, data: { deliveredAt: new Date(start.getTime() + 48 * HOUR) } });
    try {
      f.clock.now = new Date(start.getTime() + 72 * HOUR);
      expect(await data(approveExchangeV6(d(), f.staff, exchangeId))).toMatchObject({ why: 'WINDOW' });
      f.clock.now = new Date(start.getTime() + 72 * HOUR - 1);
      expect(await approveExchangeV6(d(), f.staff, exchangeId)).toMatchObject({ status: 'SENT' });
    } finally {
      // time never runs back for the tests after (the ERP's `updatedSince` reads only what changed later)
      f.clock.now = new Date(start.getTime() + 72 * HOUR);
    }
  });

  it('with no ERP result yet the shop`s delivered mark counts; the owner`s window (policy.exchange.windowHours) moves it', async () => {
    const o = await f.shipped('xv-window');
    await orderStep(d(), { storeId: f.S, orderId: o.orderId }, systemBy('test'), 'delivered');
    const start = f.clock.now;
    expect(await db().erpDeliveryResult.count({ where: { erpOrder: { orderId: o.orderId } } })).toBe(0);
    const line = await lineOf(o.orderId);
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    // the owner's window: the setting, and the live exchange rule's `windowHours` (Smart Rules) when the store has one
    const rule = await db().smartRule.findFirst({ where: { storeId: f.S, kind: 'exchange', status: 'ACTIVE', archivedAt: null } });
    const params = (rule?.params ?? null) as { key: string; value: unknown }[] | null;
    const withWindow = (h: unknown) => params!.map((x) => (x.key === 'windowHours' ? { ...x, value: h } : x));
    f.perStore.set(`rules.public.cacheSeconds@${f.S}`, 0);
    f.perStore.set(`policy.exchange.windowHours@${f.S}`, 24);
    if (rule && params) await db().smartRule.update({ where: { id: rule.id }, data: { params: withWindow(24) as never } });
    try {
      f.clock.now = new Date(start.getTime() + 24 * HOUR);
      expect(await data(approveExchangeV6(d(), f.staff, ex.exchangeId))).toMatchObject({ why: 'WINDOW' });
      // the courier's result reaches the ERP with the courier's own time (the start): the ERP's line is delivered now
      f.clock.now = start;
      await f.courierResult(o.orderId, 'DELIVERED');
      f.clock.now = new Date(start.getTime() + 24 * HOUR - 1);
      expect(await approveExchangeV6(d(), f.staff, ex.exchangeId)).toMatchObject({ status: 'SENT' });
    } finally {
      if (rule && params) await db().smartRule.update({ where: { id: rule.id }, data: { params: params as never } });
      f.perStore.delete(`policy.exchange.windowHours@${f.S}`);
      f.perStore.delete(`rules.public.cacheSeconds@${f.S}`);
      f.clock.now = new Date(start.getTime() + 24 * HOUR); // never back (see above)
    }
  });

  it('qa-gate I6: the 72 h rule is checked before the ERP is asked; the practice ERP is named as it is, never "cannot be reached"', async () => {
    const { exchangeId } = await opened('xv-practice');
    const start = f.clock.now;
    // the store's ERP is the practice one (no real key yet), its practice data switched off
    await db().integration.updateMany({ where: { storeId: f.S, kind: 'ERP' }, data: { mode: 'MOCK' } });
    f.perStore.set('erp.mock.stockEnabled@-', false);
    try {
      // within the window: the true reason; nothing planned, nothing sent
      expect(await erpOrderPosts(() => code(approveExchangeV6(d(), f.staff, exchangeId)))).toEqual({ value: 'ERP_ON_PRACTICE', posts: 0 });
      expect(await data(approveExchangeV6(d(), f.staff, exchangeId))).toMatchObject({ reason: 'ERP_ON_PRACTICE' });
      expect(await db().erpExchangeLink.count({ where: { exchangeId } })).toBe(0);
      // past the window: the 72 h rule answers first, whatever the ERP's state
      f.clock.now = new Date(start.getTime() + 72 * HOUR);
      expect(await code(approveExchangeV6(d(), f.staff, exchangeId))).toBe('EXCHANGE_CLOSED');
      expect(await data(approveExchangeV6(d(), f.staff, exchangeId))).toMatchObject({ why: 'WINDOW' });
      // a case that is not the store's is still not found, before the ERP is asked
      expect(await code(approveExchangeV6(d(), f.staff, '00000000-0000-4000-8000-000000000000'))).toBe('NOT_FOUND');
    } finally {
      await db().integration.updateMany({ where: { storeId: f.S, kind: 'ERP' }, data: { mode: 'LIVE' } });
      f.perStore.delete('erp.mock.stockEnabled@-');
      f.clock.now = new Date(start.getTime() + 72 * HOUR); // never back (see above)
    }
    // the real ERP back: the window is still the rule; nothing went meanwhile
    expect(await erpOrderPosts(() => data(approveExchangeV6(d(), f.staff, exchangeId)))).toEqual({ value: expect.objectContaining({ why: 'WINDOW' }), posts: 0 });
  });

  it('qa-gate I7: the case shows how many of its window hours are left, by the same rule the approval uses', async () => {
    const { o, exchangeId } = await opened('xv-hours');
    const start = f.clock.now;
    const ends = new Date(start.getTime() + 72 * HOUR).toISOString();
    // the shop's own mark says later; the ERP's result (the courier's "delivered") is what counts
    await db().order.update({ where: { id: o.orderId }, data: { deliveredAt: new Date(start.getTime() + 24 * HOUR) } });
    try {
      f.clock.now = new Date(start.getTime() + 30 * HOUR + 1);
      expect(await exchangeWindowV6(d(), f.staff, exchangeId)).toEqual({ state: 'OPEN', windowHours: 72, hoursLeft: 42, endsAt: ends, deliveredAt: start.toISOString() });
      f.clock.now = new Date(start.getTime() + 72 * HOUR - 1);
      expect(await exchangeWindowV6(d(), f.staff, exchangeId)).toMatchObject({ state: 'OPEN', hoursLeft: 1 });
      f.clock.now = new Date(start.getTime() + 72 * HOUR);
      expect(await exchangeWindowV6(d(), f.staff, exchangeId)).toEqual({ state: 'CLOSED', windowHours: 72, hoursLeft: 0, endsAt: ends, deliveredAt: start.toISOString() });
      // the same rule refuses the approval at that moment
      expect(await data(approveExchangeV6(d(), f.staff, exchangeId))).toMatchObject({ why: 'WINDOW' });
      expect(await exchangeWindowV6(d(), f.staff, 'not-a-case')).toBeNull();
    } finally {
      f.clock.now = new Date(start.getTime() + 72 * HOUR); // never back (see above)
    }
  });

  it('regular orders come first: the exchange waits for stock, the admin is told, and it goes by itself with a new key later', async () => {
    const { exchangeId } = await opened('xv-stock');
    f.world.setStock(skyL, 'SAMPLE-WH-1', { onHand: 1 });
    const calls = f.world.calls.length;
    const w = await approveExchangeV6(d(), f.staff, exchangeId);
    expect(w).toMatchObject({ status: 'WAITING_STOCK', shortSkus: [expect.objectContaining({ sku: skyL })], newOrderId: null });
    expect(await exchangeErpState(d(), f.staff, exchangeId)).toMatchObject({ status: 'WAITING_STOCK', waitingStock: true, shortSkus: [expect.objectContaining({ sku: skyL })] });
    // the last piece stays for a regular order: the ERP was not asked to take it
    expect(f.world.calls.slice(calls).some((c) => c.method === 'POST' && c.path.endsWith('/orders'))).toBe(false);
    expect((await db().exchange.findUniqueOrThrow({ where: { id: exchangeId } })).status).toBe('REQUESTED');
    expect(await db().orderEvent.count({ where: { type: 'exchange.waitingStock', data: { path: ['exchangeId'], equals: exchangeId } } })).toBe(1);

    // the ERP itself refuses once (stock taken in between): the exchange waits and the next try is a new key
    f.world.setStock(skyL, 'SAMPLE-WH-1', { onHand: 50 });
    const real = globalThis.fetch;
    const keys: string[] = [];
    let refuse = 1;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (/\/orders$/.test(new URL(url).pathname) && (init?.method ?? 'GET').toUpperCase() === 'POST') {
        keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
        if (refuse-- > 0) return new Response(JSON.stringify({ error: { code: 'INSUFFICIENT_STOCK', message: 'not enough stock', details: { shortSkus: [{ sku: skyL, wanted: 1, available: 0 }] } } }), { status: 409, headers: { 'content-type': 'application/json' } });
      }
      return real(input, init);
    }) as typeof fetch;
    try {
      const again = await runErpReturns(d(), f.S);
      expect(again.exchanges).toMatchObject({ sent: 0, waiting: 1 });
      const sent = await runErpReturns(d(), f.S);
      expect(sent.exchanges).toMatchObject({ sent: 1, waiting: 0 });
    } finally {
      globalThis.fetch = real;
    }
    expect(keys).toEqual([`exchange:${exchangeId}:a1`, `exchange:${exchangeId}:a2`]);
    const link = await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId } });
    expect(link).toMatchObject({ erpStatus: 'WAITING_DELIVERY', sendAttempts: 2, lastRefusal: null, approvedById: f.staff.actor.staffUserId });
    expect((await db().exchange.findUniqueOrThrow({ where: { id: exchangeId } })).status).toBe('APPROVED');
  });

  it('a dearer piece: the customer pays the difference when the owner passes it on, otherwise the shop absorbs it; never a credit', async () => {
    for (const pass of [true, false]) {
      const { exchangeId } = await opened(`xv-rise-${pass}`);
      await db().exchangeItem.updateMany({ where: { exchangeId }, data: { newUnitMinor: { increment: 20_000 } } });
      f.perStore.set(`exchange.passPriceRiseToCustomer@${f.S}`, pass);
      const r = await approveExchangeV6(d(), f.staff, exchangeId);
      f.perStore.delete(`exchange.passPriceRiseToCustomer@${f.S}`);
      expect(r.customerPaysMinor).toBe(pass ? 20_000 : 0);
      const ex = await db().exchange.findUniqueOrThrow({ where: { id: exchangeId } });
      const n = await db().order.findUniqueOrThrow({ where: { id: r.newOrderId! } });
      expect(ex.walletCreditMinor).toBe(0);
      expect(n.subtotalMinor).toBe(pass ? 20_000 : 0);
      const line = await db().erpOrderLine.findFirstOrThrow({ where: { erpOrder: { orderId: r.newOrderId! } } });
      expect(line.customerPriceMinor).toBe(pass ? 20_000 : 0);
    }
  });

  it('the ERP refuses a line it never delivered: said in words, nothing placed; the line is free again', async () => {
    const o = await f.shipped('xv-undelivered');
    // the shop marks it delivered but the ERP never heard of the delivery
    await orderStep(d(), { storeId: f.S, orderId: o.orderId }, systemBy('test'), 'delivered');
    const line = await lineOf(o.orderId);
    const a = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    expect(await code(approveExchangeV6(d(), f.staff, a.exchangeId))).toBe('ERP_REFUSED');
    expect(await data(approveExchangeV6(d(), f.staff, a.exchangeId))).toMatchObject({ erpCode: 'LINE_NOT_DELIVERED' });
    expect((await db().exchange.findUniqueOrThrow({ where: { id: a.exchangeId } })).newOrderId).toBeNull();
    // the refused send is closed: it holds no line
    expect(await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId: a.exchangeId } })).toMatchObject({ erpExchangeId: null, lastRefusal: 'LINE_NOT_DELIVERED', finishedAt: expect.any(Date) });
    expect(await exchangeErpState(d(), f.staff, a.exchangeId)).toMatchObject({ status: 'REFUSED', finished: true });

    // the shop closes that exchange; the courier's result reaches the ERP; a new exchange of the same piece takes the line
    await refuseExchange(d(), f.staff, a.exchangeId, { note: 'the ERP refused it' });
    await f.courierResult(o.orderId, 'DELIVERED');
    const b = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    expect(await approveExchangeV6(d(), f.staff, b.exchangeId)).toMatchObject({ status: 'SENT' });
    expect((await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId: b.exchangeId }, include: { lines: true } })).lines.map((l) => l.oldLineId)).toEqual([o.lineIds[0]]);
  });

  it('a refused exchange is approved again once the cause is fixed: the same case, its next key', async () => {
    const o = await f.shipped('xv-again');
    await orderStep(d(), { storeId: f.S, orderId: o.orderId }, systemBy('test'), 'delivered');
    const line = await lineOf(o.orderId);
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    expect(await code(approveExchangeV6(d(), f.staff, ex.exchangeId))).toBe('ERP_REFUSED');
    await f.courierResult(o.orderId, 'DELIVERED');
    expect(await approveExchangeV6(d(), f.staff, ex.exchangeId)).toMatchObject({ status: 'SENT', attempts: 2 });
    expect(await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId: ex.exchangeId } })).toMatchObject({ finishedAt: null, erpStatus: 'WAITING_DELIVERY', lastRefusal: null });
  });

  it('two approvals at once: one exchange order, one parcel; both see the same answer', async () => {
    const { o, exchangeId } = await opened('xv-twice');
    const [a, b] = await Promise.all([approveExchangeV6(d(), f.staff, exchangeId), approveExchangeV6(d(), f.staff, exchangeId)]);
    for (const r of [a, b]) expect(r).toMatchObject({ status: 'SENT', erpExchangeId: a.erpExchangeId, newOrderId: a.newOrderId, newExternalOrderId: `${o.ext}-X1` });
    expect(await db().erpExchangeLink.count({ where: { exchangeId } })).toBe(1);
    expect([...erp().exchanges.values()].filter((x) => x.ofExternalOrderId === o.ext)).toHaveLength(1);
    expect(await db().order.count({ where: { storeId: f.S, number: a.newOrderNumber! } })).toBe(1);
  });

  it('an account hold never pauses an exchange: the checkout is paused, the exchange still goes', async () => {
    const { exchangeId } = await opened('xv-hold');
    const linkId = await f.linkId();
    erp().hold('no payment');
    await noteHold(db(), f.S, linkId, { onHold: true, reason: 'no payment' }, f.clock.now);
    try {
      expect((await erpCheckoutPaused(f.inv(), f.S)).paused).toBe(true);
      expect(await approveExchangeV6(d(), f.staff, exchangeId)).toMatchObject({ status: 'SENT' });
    } finally {
      erp().release();
      await noteHold(db(), f.S, linkId, { onHold: false }, f.clock.now);
    }
  });

  it('a partly delivered parcel: only the lines the customer kept are exchanged', async () => {
    const o = await f.shipped('xv-partial', [{ variantId: f.v.skyM, quantity: 2 }]);
    await f.courierResult(o.orderId, 'PARTIAL', [o.lineIds[1]!]);
    await orderStep(d(), { storeId: f.S, orderId: o.orderId }, systemBy('test'), 'delivered');
    const line = await lineOf(o.orderId);
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL, quantity: 1 }] });
    const item = await db().exchangeItem.findFirstOrThrow({ where: { exchangeId: ex.exchangeId } });
    // the piece that came back is not the customer's to exchange
    expect(await data(approveExchangeV6(d(), f.staff, ex.exchangeId, { lines: [{ exchangeItemId: item.id, lineIds: [o.lineIds[0]!] }] }))).toMatchObject({ free: [o.lineIds[1]] });
    expect(await approveExchangeV6(d(), f.staff, ex.exchangeId)).toMatchObject({ status: 'SENT' });
    expect((await db().erpExchangeLine.findFirstOrThrow({ where: { exchangeItemId: item.id } })).oldLineId).toBe(o.lineIds[1]);
  });

  it('a refusal while it waited for stock stops the retries: closed and said, never sent again by itself', async () => {
    const { exchangeId } = await opened('xv-wait-refused');
    f.world.setStock(skyL, 'SAMPLE-WH-1', { onHand: 1 });
    expect(await approveExchangeV6(d(), f.staff, exchangeId)).toMatchObject({ status: 'WAITING_STOCK' });
    f.world.setStock(skyL, 'SAMPLE-WH-1', { onHand: 50 });
    const real = globalThis.fetch;
    let posts = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (/\/orders$/.test(new URL(url).pathname) && (init?.method ?? 'GET').toUpperCase() === 'POST') {
        posts++;
        return new Response(JSON.stringify({ error: { code: 'EXCHANGE_OPEN', message: 'that line already has an exchange' } }), { status: 409, headers: { 'content-type': 'application/json' } });
      }
      return real(input, init);
    }) as typeof fetch;
    try {
      expect((await runErpReturns(d(), f.S)).exchanges).toMatchObject({ sent: 0, waiting: 0, refused: 1 });
      expect((await runErpReturns(d(), f.S)).exchanges).toMatchObject({ sent: 0, waiting: 0, refused: 0 });
    } finally {
      globalThis.fetch = real;
    }
    expect(posts).toBe(1);
    expect(await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId } })).toMatchObject({ erpStatus: 'REFUSED', lastRefusal: 'EXCHANGE_OPEN', finishedAt: expect.any(Date) });
    expect(await exchangeErpState(d(), f.staff, exchangeId)).toMatchObject({ status: 'REFUSED', waitingStock: false, finished: true });
  });

  it('the exchange order cancelled in the shop is cancelled at the ERP (PR 610`s relay)', async () => {
    const { exchangeId } = await opened('xv-cancel');
    const r = await approveExchangeV6(d(), f.staff, exchangeId);
    await cancelOrder(d(), f.staff, r.newOrderId!, { reasonCode: 'NOT_ORDERED' });
    expect(await db().erpPush.findFirst({ where: { storeId: f.S, referenceId: r.newOrderId!, documentType: 'order.status' } })).toMatchObject({ status: 'PENDING' });
    await f.relay();
    expect(await db().erpPush.findFirst({ where: { storeId: f.S, referenceId: r.newOrderId!, documentType: 'order.status' } })).toMatchObject({ status: 'SENT' });
    expect(erp().orders.get(r.newExternalOrderId)!.status).toBe('CANCELLED');
  });

  it('the customer refuses the exchange parcel: the ERP cancels the exchange, and so does the shop', async () => {
    const { o, exchangeId } = await opened('xv-refused');
    const r = await approveExchangeV6(d(), f.staff, exchangeId);
    await f.courierResult(r.newOrderId!, 'RETURNED');
    await syncErpExchanges(d(), f.S);
    expect(await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId } })).toMatchObject({ erpStatus: 'CANCELLED' });
    expect((await db().exchange.findUniqueOrThrow({ where: { id: exchangeId } })).status).toBe('CANCELLED');
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('DELIVERED');
  });

  it('the old piece not back in 4 days: late on the risk list, billed the night after; a late return is marked by hand', async () => {
    const { exchangeId } = await opened('xv-deadline');
    const r = await approveExchangeV6(d(), f.staff, exchangeId);
    await f.courierResult(r.newOrderId!, 'DELIVERED');
    await syncErpExchanges(d(), f.S);
    const start = f.clock.now;
    f.clock.now = new Date(start.getTime() + 5 * 86_400_000);
    const late = (await exchangeWatch(d(), f.staff)).rows.find((x) => x.exchangeId === exchangeId)!;
    expect(late).toMatchObject({ late: true });
    expect(late.daysLeft).toBeLessThan(0);

    expect(await code(markExchangeLateReturn(d(), f.staff, exchangeId, { handedBackAt: 'yesterday' }))).toBe('INVALID_INPUT');
    const input = { handedBackAt: storeDate(f.clock.now, 'Asia/Dhaka'), courier: 'pathao', note: 'came in a different lot' };
    // pressed twice at once: one mark, one timeline row
    const [marked, twice] = await Promise.all([markExchangeLateReturn(d(), f.staff, exchangeId, input), markExchangeLateReturn(d(), f.staff, exchangeId, input)]);
    expect(marked.lateReturnMarkedAt).toBe(f.clock.now.toISOString());
    expect(twice).toEqual(marked);
    const rows = () => db().orderEvent.count({ where: { type: 'exchange.lateReturnMarked', data: { path: ['exchangeId'], equals: exchangeId } } });
    expect(await rows()).toBe(1);
    expect(erp().exchanges.get(r.erpExchangeId!)!.status).toBe('RETURNED_WAITING_CHECK');
    const link = await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId } });
    expect(link.lateReturn).toMatchObject({ handedBackAt: storeDate(f.clock.now, 'Asia/Dhaka'), courier: 'PATHAO', note: 'came in a different lot' });
    // marked once is enough: pressed again later, the same mark and nothing new
    expect(await markExchangeLateReturn(d(), f.staff, exchangeId, { handedBackAt: storeDate(f.clock.now, 'Asia/Dhaka') })).toEqual(marked);
    expect(await rows()).toBe(1);

    // another exchange not back at all: the ERP's night bills it, the shop's exchange is done (the bill is the ERP's)
    const other = await opened('xv-billed');
    const r2 = await approveExchangeV6(d(), f.staff, other.exchangeId);
    await f.courierResult(r2.newOrderId!, 'DELIVERED');
    f.clock.now = new Date(f.clock.now.getTime() + 6 * 86_400_000);
    erp().runNight();
    await syncErpExchanges(d(), f.S);
    expect(await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId: other.exchangeId } })).toMatchObject({ erpStatus: 'BILLED' });
    expect((await db().exchange.findUniqueOrThrow({ where: { id: other.exchangeId } })).status).toBe('COMPLETED');
    f.clock.now = start;
  });

  it('CN-029 §16: store B cannot approve, see or mark store A`s exchanges', async () => {
    const { exchangeId } = await opened('xv-iso');
    f.v6(f.B);
    expect(await code(approveExchangeV6(d(), f.staffB, exchangeId))).toBe('NOT_FOUND');
    expect(await code(markExchangeLateReturn(d(), f.staffB, exchangeId, { handedBackAt: storeDate(f.clock.now, 'Asia/Dhaka') }))).toBe('NOT_FOUND');
    expect((await exchangeWatch(d(), f.staffB)).rows).toEqual([]);
    expect(await exchangeErpState(d(), f.staffB, exchangeId)).toBeNull();
    expect(await exchangeWindowV6(d(), f.staffB, exchangeId)).toBeNull();
    expect(await db().erpExchangeLink.count({ where: { storeId: f.B } })).toBe(0);
  });
});
