// PR 146 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the two-size follow-up through the one order
// service. Required acceptance test: SIM-F-036 (a family buying S, M and L, who said in the bag the sizes are for
// different people, gets no "2 sizes — check" flag, only a note; an order with S and M and no such answer is asked).
// Also: off by default, once per order, the customer's "only M" takes S out with the money and the stock consistent and
// closes the flag and the call task, the team's "keep all", and SIM-F-004 (no answer changes a booked parcel). Every
// value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { answerTwoSize, customerTwoSizeAnswer, customerTwoSizeState, twoSizeCheck, twoSizeQuestions } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 146 · the two-size follow-up (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  let skyS: string;
  const ON = { enabled: true, askCustomer: true, callTask: true };
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const me = (o: { visitorId: string }) => ({ storeId: f.S, customerId: null, visitorId: o.visitorId });
  const ref = (o: { orderId: string }) => ({ storeId: f.S, orderId: o.orderId });
  const order = (id: string) => db().order.findUniqueOrThrow({ where: { id } });
  const held = (orderId: string, variantId: string) => db().stockReservation.aggregate({ where: { orderId, variantId, status: 'CONVERTED', releasedAt: null }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0);
  const lineOf = (orderId: string, variantId: string) => db().orderItem.findFirstOrThrow({ where: { orderId, variantId } });
  const twoSizeTasks = (orderId: string) => db().callTask.findMany({ where: { orderId, reason: 'TWO_SIZE' } });
  /** The bag's answer for this order's group, as the bag's two-sizes card keeps it (`product|colour|size+size…`). */
  const answerInBag = async (orderId: string, variantIds: string[], answer: string) => {
    const vs = await db().productVariant.findMany({ where: { id: { in: variantIds } }, select: { productId: true, colourId: true, sizeId: true } });
    const key = `${vs[0]!.productId}|${vs[0]!.colourId ?? ''}|${vs.map((v) => v.sizeId!).sort().join('+')}`;
    await db().cart.updateMany({ where: { convertedOrderId: orderId }, data: { sizeAnswers: { [key]: answer } } });
  };

  beforeAll(async () => {
    f = await setUpOrders('twosize');
    skyS = f.variant('oxford-cotton-shirt', 'sky', 'S').id;
    await db().stockLevel.updateMany({ where: { variantId: skyS }, data: { onHand: 100, available: 100 } });
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off by default: nothing is asked, flagged or noted', async () => {
    const o = await f.place('ts-off', { lines: [{ variantId: skyS }, { variantId: f.v.skyM }] });
    expect(await twoSizeCheck(d(), ref(o))).toBeNull();
    expect(await order(o.orderId)).toMatchObject({ twoSizeStatus: null });
    expect((await order(o.orderId)).flags).not.toContain('TWO_SIZES');
    expect(await customerTwoSizeState(d(), me(o), o.number)).toEqual({ open: false, questions: [] });
  });

  it('SIM-F-036: a family buying S, M and L "for different people" gets only a note — no flag, no question, no call', async () => {
    f.overrides.set('orders.twoSize', ON);
    try {
      const o = await f.place('ts-family', { lines: [{ variantId: skyS }, { variantId: f.v.skyM }, { variantId: f.v.skyL }] });
      await answerInBag(o.orderId, [skyS, f.v.skyM, f.v.skyL], 'other');
      expect(await twoSizeCheck(d(), ref(o))).toEqual({ asked: 0, noted: 1 });
      const after = await order(o.orderId);
      expect(after.twoSizeStatus).toBe('NOTED');
      expect(after.flags).toContain('TWO_SIZES_OTHER');
      expect(after.flags).not.toContain('TWO_SIZES');
      expect(await twoSizeTasks(o.orderId)).toHaveLength(0);
      const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.twoSizeCheck' } });
      expect(ev).toMatchObject({ actorType: 'SYSTEM', source: 'two-size-check', fromStatus: 'PLACED', toStatus: null });
      // ONE group of three sizes, never two overlapping pairs
      expect(ev.data).toMatchObject({ asked: [], noted: [{ product: expect.any(String), sizes: [{ label: 'S' }, { label: 'M' }, { label: 'L' }] }] });
      expect(await customerTwoSizeState(d(), me(o), o.number)).toEqual({ open: false, questions: [] });
      // once per order
      expect(await twoSizeCheck(d(), ref(o))).toBeNull();
      expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.twoSizeCheck' } })).toBe(1);
    } finally {
      f.overrides.delete('orders.twoSize');
    }
  });

  it('S and M with no such answer: asked; his "only M" takes S out — money, stock, flag and call task consistent', async () => {
    f.overrides.set('orders.twoSize', ON);
    try {
      const o = await f.place('ts-ask', { lines: [{ variantId: skyS }, { variantId: f.v.skyM }] });
      expect(await twoSizeCheck(d(), ref(o))).toEqual({ asked: 1, noted: 0 });
      const before = await order(o.orderId);
      expect(before).toMatchObject({ twoSizeStatus: 'ASKED', discountMinor: 0 });
      expect(before.flags).toContain('TWO_SIZES');
      expect(await twoSizeTasks(o.orderId)).toMatchObject([{ status: 'OPEN' }]);
      const st = await customerTwoSizeState(d(), me(o), o.number);
      expect(st.open).toBe(true);
      expect(st.questions).toHaveLength(1);
      const q = st.questions[0]!;
      expect(q.sizes.map((s) => s.label)).toEqual(['S', 'M']);
      // somebody else's browser: no such order; a size not in the question: refused
      expect(await code(customerTwoSizeAnswer(d(), { storeId: f.S, customerId: null, visitorId: randomUUID() }, { number: o.number, key: q.key, keep: q.sizes[1]!.sizeId }))).toBe('NOT_FOUND');
      expect(await code(customerTwoSizeAnswer(d(), me(o), { number: o.number, key: q.key, keep: randomUUID() }))).toBe('INVALID_INPUT');

      const s = await lineOf(o.orderId, skyS);
      const r = await customerTwoSizeAnswer(d(), me(o), { number: o.number, key: q.key, keep: q.sizes[1]!.sizeId });
      expect(r).toMatchObject({ command: 'twoSizeAnswer', status: 'PLACED', version: before.version + 1 });
      const after = await order(o.orderId);
      expect(after).toMatchObject({ twoSizeStatus: 'ANSWERED', subtotalMinor: before.subtotalMinor - s.lineTotalMinor, totalMinor: before.totalMinor - s.lineTotalMinor, codAmountMinor: before.codAmountMinor - s.lineTotalMinor, deliveryChargeMinor: before.deliveryChargeMinor });
      expect(after.flags).not.toContain('TWO_SIZES');
      expect((await lineOf(o.orderId, skyS)).status).toBe('REMOVED');
      expect(await held(o.orderId, skyS)).toBe(0);
      expect(await held(o.orderId, f.v.skyM)).toBe(1);
      expect(await twoSizeTasks(o.orderId)).toMatchObject([{ status: 'DONE' }]);
      const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.twoSizeAnswer' } });
      expect(ev).toMatchObject({ actorType: 'CUSTOMER', reasonCode: 'two-size' });
      expect(ev.data).toMatchObject({ keep: 'M', applied: true, via: 'order-page', lines: [{ kind: 'remove', lineId: s.id }] });
      expect(await db().auditLog.count({ where: { entityId: o.orderId, action: 'order.twoSizeAnswer' } })).toBe(1);
      // answered: nothing more to ask, and the same answer again changes nothing
      expect(await customerTwoSizeState(d(), me(o), o.number)).toEqual({ open: false, questions: [] });
      expect(await code(customerTwoSizeAnswer(d(), me(o), { number: o.number, key: q.key, keep: q.sizes[1]!.sizeId }))).toBe('NOTHING_CHANGED');
    } finally {
      f.overrides.delete('orders.twoSize');
    }
  });

  it('the team answers "keep all" (orders.edit): nothing is taken out; a reader may not answer', async () => {
    f.overrides.set('orders.twoSize', { ...ON, askCustomer: false, callTask: false });
    try {
      const o = await f.place('ts-team', { lines: [{ variantId: f.v.skyM }, { variantId: f.v.skyL }] });
      await answerInBag(o.orderId, [f.v.skyM, f.v.skyL], 'help');
      expect(await twoSizeCheck(d(), ref(o))).toEqual({ asked: 1, noted: 0 });
      expect(await twoSizeTasks(o.orderId)).toHaveLength(0);
      // the owner keeps it off his order page: the team asks on the phone
      expect(await customerTwoSizeState(d(), me(o), o.number)).toEqual({ open: false, questions: [] });
      const [q] = await twoSizeQuestions(d(), f.reader, o.orderId);
      expect(await code(customerTwoSizeAnswer(d(), me(o), { number: o.number, key: q!.key, keep: 'all' }))).toBe('EDIT_CLOSED');
      expect(await code(answerTwoSize(d(), f.reader, o.orderId, { key: q!.key, keep: 'all' }))).toBe('FORBIDDEN');
      const before = await order(o.orderId);
      expect(await code(answerTwoSize(d(), f.staff, o.orderId, { key: q!.key, keep: 'all' }, { version: before.version - 1 }))).toBe('STALE');
      await answerTwoSize(d(), f.staff, o.orderId, { key: q!.key, keep: 'all', note: 'Both for him, he wears either' }, { version: before.version });
      const after = await order(o.orderId);
      expect(after).toMatchObject({ twoSizeStatus: 'ANSWERED', totalMinor: before.totalMinor });
      expect(after.flags).not.toContain('TWO_SIZES');
      expect(await db().orderItem.count({ where: { orderId: o.orderId, status: 'ACTIVE' } })).toBe(2);
      const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.twoSizeAnswer' } });
      expect(ev).toMatchObject({ actorType: 'STAFF', actorId: f.staffId, source: 'admin', message: 'Both for him, he wears either' });
      expect(ev.data).toMatchObject({ keep: 'all', via: 'admin' });
    } finally {
      f.overrides.delete('orders.twoSize');
    }
  });

  it('SIM-F-004: once a courier is booked no answer changes the parcel', async () => {
    f.overrides.set('orders.twoSize', ON);
    try {
      const o = await f.place('ts-booked', { lines: [{ variantId: skyS }, { variantId: f.v.skyM }] });
      await twoSizeCheck(d(), ref(o));
      const [q] = await twoSizeQuestions(d(), f.staff, o.orderId);
      await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
      expect(await customerTwoSizeState(d(), me(o), o.number)).toEqual({ open: false, questions: [] });
      expect(await code(customerTwoSizeAnswer(d(), me(o), { number: o.number, key: q!.key, keep: q!.sizes[1]!.sizeId }))).toBe('BOOKED');
      expect(await code(answerTwoSize(d(), f.staff, o.orderId, { key: q!.key, keep: q!.sizes[1]!.sizeId }))).toBe('BOOKED');
      expect(await db().orderItem.count({ where: { orderId: o.orderId, status: 'ACTIVE' } })).toBe(2);
    } finally {
      f.overrides.delete('orders.twoSize');
    }
  });
});
