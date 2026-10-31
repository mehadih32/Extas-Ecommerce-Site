// PR 148 follow-up (go-live gate SIM-F-052/F-053) on a real PostgreSQL (a throwaway database with the real migrations and
// the sample store with the default pack's templates; orders placed through the real checkout; skipped without
// TEST_DATABASE_ADMIN_URL). The four later notices: the refund paid out (with the amount), the exchange approved (the
// new parcel's number and what its rider collects), a failed delivery try and the late apology. Each ships off, goes
// once per order, stays outside the caps, and goes in the customer's own language. The timeline rows are written here
// as their owners write them (@extas/payments, @extas/orders, @extas/shipping test their own writing). Every value is a
// made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import type { Prisma } from '@extas/db/client';
import { cancelOrder } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_JOURNEY, type Journey, type MessageChannel } from '@extas/settings';
import { runMessages, type MessagesDeps } from './index';
import { ATTEMPT_FAILED_EVENT, EXCHANGE_APPROVED_EVENT, formatAmount, LATE_EVENT, REFUND_DONE_EVENT } from './pure';

describe.skipIf(!HAS_TEST_DB)('PR 148 follow-up · refund, exchange, failed-try and late notices on PostgreSQL', () => {
  let f: OrdersFixture;
  let n = 0;
  const db = () => f.t.prisma;
  const outbox: { channel: MessageChannel; to: string; text: string; purpose: string }[] = [];
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({
    provider: 'test',
    mode: 'MOCK',
    send: async (m) => {
      outbox.push({ channel, to: m.to, text: m.text, purpose: m.purpose });
      return { ok: true, messageId: randomUUID() };
    },
  });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const run = async () => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000);
    return runMessages(deps(), f.S);
  };
  const journey = (patch: Partial<Journey>) => f.overrides.set('messages.journey', { ...DEFAULT_JOURNEY, ...patch });
  const allOn = () =>
    journey({
      refunded: { ...DEFAULT_JOURNEY.refunded, on: true },
      exchangeApproved: { ...DEFAULT_JOURNEY.exchangeApproved, on: true },
      attemptFailed: { ...DEFAULT_JOURNEY.attemptFailed, on: true },
      lateApology: { ...DEFAULT_JOURNEY.lateApology, on: true },
    });
  const sent = (purpose: string, number: string) => outbox.filter((m) => m.purpose === purpose && new RegExp(`${number}(?!\\d)`).test(m.text));
  const phone = () => `017200${String(++n).padStart(5, '0')}`;
  /** A timeline row as its owner writes it (the refund service, the exchange approval, the courier tracking). */
  const row = (orderId: string, type: string, data: Prisma.InputJsonObject) =>
    db().orderEvent.create({ data: { storeId: f.S, orderId, type, actorType: 'SYSTEM', actorId: null, source: 'test', data } });

  beforeAll(async () => {
    f = await setUpOrders('journey-notices');
    f.overrides.set('system.stagingHost', 'shop.example');
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(async () => {
    f.clock.now = new Date();
    f.overrides.delete('messages.journey');
    f.overrides.delete('messages.caps');
    await run();
    outbox.length = 0;
  });

  it('ship off: the four timeline rows send nothing until the owner switches a notice on', async () => {
    const o = await f.place('off', { phone: phone() });
    await run();
    await row(o.orderId, REFUND_DONE_EVENT, { amountMinor: 85_000 });
    await row(o.orderId, ATTEMPT_FAILED_EVENT, { shipmentId: randomUUID(), trip: 1 });
    await row(o.orderId, LATE_EVENT, { shipmentId: randomUUID() });
    await run();
    expect(outbox.filter((m) => m.purpose !== 'order.placed')).toEqual([]);
    expect(await db().notificationLog.count({ where: { orderId: o.orderId, step: { in: ['refunded', 'exchangeApproved', 'attemptFailed', 'lateApology'] } } })).toBe(0);
  });

  it('the refund paid out: one message with the amount, also on a cancelled order; never twice', async () => {
    allOn();
    const o = await f.place('refund', { phone: phone() });
    await cancelOrder(f.ordersDeps(), f.staff, o.orderId, { reasonCode: 'OUT_OF_STOCK' });
    await row(o.orderId, REFUND_DONE_EVENT, { refundId: randomUUID(), amountMinor: 85_000, method: 'BKASH' });
    await run();
    await row(o.orderId, REFUND_DONE_EVENT, { refundId: randomUUID(), amountMinor: 85_000, method: 'BKASH' });
    await run();
    const m = sent('order.refunded', o.number);
    expect(m).toHaveLength(1);
    expect(m[0]!.text).toContain(formatAmount(85_000, 'BDT'));
    expect(m[0]!.text).toContain(`https://shop.example/account/orders/${o.number}`);
  });

  it('the exchange approved: the new parcel and what its rider collects; a paid parcel gets no amount line', async () => {
    allOn();
    const a = await f.place('ex-original', { phone: phone() });
    const parcel = await f.place('ex-parcel', { phone: phone() });
    const due = await db().order.findUniqueOrThrow({ where: { id: parcel.orderId }, select: { totalMinor: true, paymentMethod: true } });
    expect(due.paymentMethod).toBe('COD');
    await row(a.orderId, EXCHANGE_APPROVED_EVENT, { exchangeId: randomUUID(), newOrderId: parcel.orderId, newOrderNumber: parcel.number });
    await run();
    const [m] = sent('order.exchangeApproved', a.number);
    expect(m!.text).toContain(parcel.number);
    expect(m!.text).toContain(`Please keep ${formatAmount(due.totalMinor, 'BDT')} ready for the rider.`);

    const b = await f.place('ex-original-2', { phone: phone() });
    const paid = await f.place('ex-parcel-paid', { phone: phone(), payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await row(b.orderId, EXCHANGE_APPROVED_EVENT, { exchangeId: randomUUID(), newOrderId: paid.orderId, newOrderNumber: paid.number });
    await run();
    const [p] = sent('order.exchangeApproved', b.number);
    expect(p!.text).toContain(paid.number);
    expect(p!.text).not.toMatch(/৳|ready for the rider/);

    // a row that names no parcel sends nothing, and says why
    const c = await f.place('ex-unknown', { phone: phone() });
    await row(c.orderId, EXCHANGE_APPROVED_EVENT, { exchangeId: randomUUID() });
    await run();
    expect(sent('order.exchangeApproved', c.number)).toHaveLength(0);
    expect(await db().notificationLog.findFirst({ where: { orderId: c.orderId, step: 'exchangeApproved' } })).toMatchObject({ status: 'SKIPPED', reason: 'NO_EVENT' });
  });

  it('a failed try and a late parcel: one notice each with the tracking link, in his own language, outside the caps', async () => {
    allOn();
    f.overrides.set('messages.caps', { SMS: 0, WHATSAPP: 0, EMAIL: 0, total: 0 });
    const o = await f.place('tries', { phone: phone() });
    const ship = randomUUID();
    await row(o.orderId, ATTEMPT_FAILED_EVENT, { shipmentId: ship, trip: 1 });
    await run();
    await row(o.orderId, ATTEMPT_FAILED_EVENT, { shipmentId: ship, trip: 2 });
    await row(o.orderId, LATE_EVENT, { shipmentId: ship });
    await run();
    const failed = sent('order.attemptFailed', o.number);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.text).toContain(`https://shop.example/account/orders/${o.number}`);
    expect(sent('order.lateApology', o.number)).toHaveLength(1);

    // a Bengali order hears it in Bengali
    const bn = await f.place('late-bn', { phone: phone() });
    await db().order.update({ where: { id: bn.orderId }, data: { lang: 'bn' } });
    await row(bn.orderId, LATE_EVENT, { shipmentId: randomUUID() });
    await run();
    const [late] = sent('order.lateApology', bn.number);
    expect(late!.text).toMatch(/[অ-হ]/);
  });
});
