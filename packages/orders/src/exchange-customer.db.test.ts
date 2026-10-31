// PR 186 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the exchange request from the customer's own
// account. Off by default; only his own order; the same engine as staff (source shop, REQUESTED, nothing booked); a
// faulty piece needs its photo; SIM-F-021 (required): a parcel refused at the door after a try-on is re-shipped in another
// size from his account, linked to the refused order; CN-018 (5): his "you sent the wrong size" claim with its photo,
// decided by staff. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder, customerExchangeChoices, customerExchangeState, customerRequestExchange, decideExchangeClaim, exchangeDetail, orderStep, systemBy, type CustomerRef } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 186 · exchange from the customer\'s account (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  let me: CustomerRef;
  let other: CustomerRef;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');
  const on = (extra: Record<string, unknown> = {}) => f.overrides.set('orders.exchange.account', { enabled: true, claim: true, maxPhotos: 3, photoMaxMb: 5, ...extra });
  const photo = () => randomUUID();
  let n = 0;

  async function shipped(name: string, customer = me) {
    const o = await f.place(name, { customerId: customer.customerId!, phone: `0171000${String(1860 + ++n).padStart(4, '0')}` });
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    return { o, r, line };
  }
  async function delivered(name: string, customer = me) {
    const s = await shipped(name, customer);
    await orderStep(d(), s.r, by, 'delivered');
    return s;
  }

  beforeAll(async () => {
    f = await setUpOrders('exchange_account');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
    const a = await db().customer.create({ data: { storeId: f.S, phone: '+8801710001861', name: 'Account one' } }); // hardcode-ok: a made-up test number
    const b = await db().customer.create({ data: { storeId: f.S, phone: '+8801710001862', name: 'Account two' } }); // hardcode-ok: a made-up test number
    me = { storeId: f.S, customerId: a.id, visitorId: null };
    other = { storeId: f.S, customerId: b.id, visitorId: null };
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('is off by default: no lines, and a request or a choice is refused', async () => {
    const { o, line } = await delivered('acc-off');
    const st = await customerExchangeState(d(), me, o.number);
    expect(st).toMatchObject({ open: false, closed: 'OFF', lines: [], exchanges: [] });
    expect(await code(customerExchangeChoices(d(), me, { number: o.number, orderItemId: line.id, reason: 'size', sizeKey: 'l' }))).toBe('EXCHANGE_CLOSED');
    expect(await code(customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: f.v.skyL }))).toBe('EXCHANGE_CLOSED');
    expect(await db().exchange.count({ where: { orderId: o.orderId } })).toBe(0);
  });

  it('on: his delivered order, a new size from the pieces offered — REQUESTED through the one engine, nothing booked', async () => {
    on();
    try {
      const { o, line } = await delivered('acc-size');
      const st = await customerExchangeState(d(), me, o.number);
      expect(st).toMatchObject({ open: true, closed: null, number: o.number, window: { state: 'OPEN' } });
      expect(st.lines).toHaveLength(1);
      expect(st.lines[0]).toMatchObject({ lineId: line.id, size: null, currentSizeKey: 'm' });
      expect(st.lines[0]!.sizes.map((s) => s.key)).toContain('l');
      const ch = await customerExchangeChoices(d(), me, { number: o.number, orderItemId: line.id, reason: 'size', sizeKey: 'l' });
      expect(ch.closed).toBeNull();
      expect(ch.options.map((x) => x.variantId)).toContain(f.v.skyL);
      // a piece not offered is refused by the engine (the tiers are strictly in order)
      expect(await code(customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: randomUUID() }))).toBe('NOT_OFFERED');
      const r = await customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: f.v.skyL }, { idempotencyKey: 'acc-size-1' });
      expect(r).toMatchObject({ status: 'REQUESTED', replay: false, claimState: null });
      const ex = await db().exchange.findUniqueOrThrow({ where: { id: r.exchangeId } });
      expect(ex).toMatchObject({ source: 'shop', createdById: null, customerId: me.customerId, status: 'REQUESTED', newOrderId: null });
      const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: { contains: 'exchange' } }, orderBy: { createdAt: 'desc' } });
      expect(ev).toMatchObject({ actorType: 'CUSTOMER', actorId: me.customerId });
      // the same press again: the same exchange
      expect((await customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: f.v.skyL }, { idempotencyKey: 'acc-size-1' })).replay).toBe(true);
      // the piece now has one open: shown on the page, and not asked for twice
      const after = await customerExchangeState(d(), me, o.number);
      expect(after.lines[0]).toMatchObject({ size: 'OPEN' });
      expect(after.exchanges).toHaveLength(1);
      expect(after.exchanges[0]).toMatchObject({ number: r.number, status: 'REQUESTED', reason: 'size', items: [{ lineId: line.id, newSizeLabel: expect.any(String), quantity: 1, newProductId: expect.any(String) }] });
      expect(await code(customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: f.v.skyL }))).toBe('EXCHANGE_LIMIT');
      expect(await db().shipment.count({ where: { orderId: { not: o.orderId }, order: { flags: { has: 'EXCHANGE' } } } })).toBe(0);
    } finally {
      f.overrides.delete('orders.exchange.account');
    }
  });

  it('only his own order: another account and a guest get "no such order"; an order not delivered says so', async () => {
    on();
    try {
      const { o, line } = await delivered('acc-own');
      expect(await code(customerExchangeState(d(), other, o.number))).toBe('NOT_FOUND');
      expect(await code(customerRequestExchange(d(), other, { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: f.v.skyL }))).toBe('NOT_FOUND');
      expect(await customerExchangeState(d(), { storeId: f.S, customerId: null, visitorId: o.visitorId }, o.number)).toMatchObject({ closed: 'OFF', lines: [] });
      expect(await code(customerRequestExchange(d(), { storeId: f.S, customerId: null, visitorId: o.visitorId }, { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: f.v.skyL }))).toBe('NOT_FOUND');
      const s = await shipped('acc-on-the-way');
      expect(await customerExchangeState(d(), me, s.o.number)).toMatchObject({ open: false, closed: 'NOT_DELIVERED' });
      // the window has passed
      f.clock.now = new Date(f.clock.now.getTime() + 400 * 3_600_000);
      expect(await customerExchangeState(d(), me, o.number)).toMatchObject({ open: false, closed: 'WINDOW' });
    } finally {
      f.clock.now = new Date(f.clock.now.getTime() - 400 * 3_600_000);
      f.overrides.delete('orders.exchange.account');
    }
  });

  it('a faulty piece is replaced in the same size with its photo, free as our mistake; too many photos are refused', async () => {
    on();
    try {
      const { o, line } = await delivered('acc-problem');
      const st = await customerExchangeState(d(), me, o.number);
      expect(st.problemReason).toBe('defect');
      expect(st.lines[0]!.problem).toBeNull();
      const ch = await customerExchangeChoices(d(), me, { number: o.number, orderItemId: line.id, reason: 'defect' });
      const same = ch.options.find((x) => x.variantId === f.v.skyM)!;
      expect(same).toBeTruthy();
      expect(await code(customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'defect', newVariantId: f.v.skyM, note: 'seam open' }))).toBe('PHOTO_REQUIRED');
      expect(await code(customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'defect', newVariantId: f.v.skyM, photoAssetIds: [photo(), photo(), photo(), photo()] }))).toBe('INVALID_INPUT');
      const r = await customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'defect', newVariantId: f.v.skyM, note: 'seam open', photoAssetIds: [photo()] });
      const ex = await db().exchange.findUniqueOrThrow({ where: { id: r.exchangeId } });
      expect(ex).toMatchObject({ reason: 'defect', reasonNote: 'seam open', isOurMistake: true, deliveryChargeMinor: 0, photoAssetIds: [expect.any(String)] });
      // a wrong item from the account needs no root cause (staff find it at QC)
      const w = await delivered('acc-wrong');
      const wr = await customerRequestExchange(d(), me, { number: w.o.number, orderItemId: w.line.id, reason: 'wrong', newVariantId: f.v.skyM, photoAssetIds: [photo()] });
      expect(wr.status).toBe('REQUESTED');
    } finally {
      f.overrides.delete('orders.exchange.account');
    }
  });

  it('CN-018 (5): "you sent the wrong size" — a claim with its photo waits for staff; accepted, the shop pays the charge', async () => {
    on();
    f.overrides.set('orders.exchange.charge', { sizePays: 'customer', fallbackMinor: 6_000, claimPhoto: true, reshipRefusals: ['size-fit'], reshipFree: false });
    try {
      const { o, line } = await delivered('acc-claim');
      const base = { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: f.v.skyL };
      expect(await code(customerRequestExchange(d(), me, { ...base, claim: { note: 'I ordered M, M came but it is marked L' } }))).toBe('PHOTO_REQUIRED');
      expect(await db().exchange.count({ where: { orderId: o.orderId } })).toBe(0);
      expect(await code(customerRequestExchange(d(), me, { ...base, reason: 'defect', newVariantId: f.v.skyM, photoAssetIds: [photo()], claim: { note: 'x', photoAssetIds: [photo()] } }))).toBe('INVALID_INPUT');
      const r = await customerRequestExchange(d(), me, { ...base, claim: { note: 'the label says L', photoAssetIds: [photo()] } });
      expect(r.claimState).toBe('PENDING');
      const ex = await exchangeDetail(d(), f.staff, r.exchangeId);
      expect(ex).toMatchObject({ claimState: 'PENDING', claimNote: 'the label says L' });
      expect(ex.money.chargeMinor).toBeGreaterThan(0);
      const decided = await decideExchangeClaim(d(), f.staff, r.exchangeId, { accept: true });
      expect(decided).toMatchObject({ claimState: 'ACCEPTED', chargeState: 'CLAIM_ACCEPTED', waivedMinor: ex.money.chargeMinor });
      // claims switched off by the owner: refused
      on({ claim: false });
      const s2 = await delivered('acc-claim-off');
      expect(await code(customerRequestExchange(d(), me, { number: s2.o.number, orderItemId: s2.line.id, reason: 'size', newVariantId: f.v.skyL, claim: { note: 'x', photoAssetIds: [photo()] } }))).toBe('INVALID_INPUT');
    } finally {
      f.overrides.delete('orders.exchange.charge');
      f.overrides.delete('orders.exchange.account');
    }
  });

  it('SIM-F-021: a parcel refused at the door after a try-on takes a size re-ship from his account, linked to the refused order', async () => {
    on();
    try {
      const { o, r, line } = await shipped('acc-tryon');
      await orderStep(d(), r, by, 'returned', { refusalKey: 'size-fit' });
      const st = await customerExchangeState(d(), me, o.number);
      expect(st).toMatchObject({ open: true, closed: null });
      expect(st.lines[0]).toMatchObject({ size: null, problem: 'NOT_DELIVERED' });
      const ex = await customerRequestExchange(d(), me, { number: o.number, orderItemId: line.id, reason: 'size', newVariantId: f.v.skyL });
      const row = await db().exchange.findUniqueOrThrow({ where: { id: ex.exchangeId } });
      expect(row).toMatchObject({ orderId: o.orderId, status: 'REQUESTED', source: 'shop' });
      // a refusal for another reason is no try-on: nothing to ask for
      const other2 = await shipped('acc-changed');
      await orderStep(d(), other2.r, by, 'returned', { refusalKey: 'changed-mind' });
      expect(await customerExchangeState(d(), me, other2.o.number)).toMatchObject({ open: false, closed: 'NOT_DELIVERED' });
    } finally {
      f.overrides.delete('orders.exchange.account');
    }
  });
});
