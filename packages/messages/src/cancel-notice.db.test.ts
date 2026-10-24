// PR 546 on a real PostgreSQL (a throwaway database with the real migrations and the sample store with the default
// pack's templates; orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL). SIM-F-013 is the
// acceptance test: an order cancelled or declined tells the customer — one notice in the log, the reason in plain words
// (never the team's note), and for a duplicate the order that goes ahead with its tracking link; never for a fake or
// test decline (the owner's silent reasons); outside the caps; never twice. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { cancelOrder, confirmOrder, customerCancel, decideReview, screenOrder } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_CANCEL_NOTICE, DEFAULT_JOURNEY, type Journey, type MessageChannel } from '@extas/settings';
import { runMessages, type MessagesDeps } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 546 · the cancellation notice on PostgreSQL', () => {
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
  const cancelOn = () => journey({ cancelled: { ...DEFAULT_JOURNEY.cancelled, on: true } });
  const mine = (o: { number: string }) => outbox.filter((m) => new RegExp(`${o.number}(?!\\d)`).test(m.text));
  const notices = (orderId: string) => db().notificationLog.findMany({ where: { orderId, step: 'cancelled' } });
  /** A customer of his own (his own phone), so another test's orders are never "his other order". */
  const phone = () => `017100${String(++n).padStart(5, '0')}`;
  const me = (visitorId: string) => ({ storeId: f.S, customerId: null, visitorId });

  beforeAll(async () => {
    f = await setUpOrders('cancel-notice');
    f.overrides.set('system.stagingHost', 'shop.example');
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(async () => {
    f.clock.now = new Date();
    f.overrides.delete('messages.journey');
    f.overrides.delete('messages.cancelNotice');
    f.overrides.delete('messages.caps');
    await run();
    outbox.length = 0;
  });

  it('ships off: a cancelled order sends nothing until the owner switches the notice on', async () => {
    expect(DEFAULT_JOURNEY.cancelled.on).toBe(false);
    const o = await f.place('off', { phone: phone() });
    await run();
    await cancelOrder(f.ordersDeps(), f.staff, o.orderId, { reasonCode: 'OUT_OF_STOCK' });
    await run();
    expect(await notices(o.orderId)).toHaveLength(0);
    expect(mine(o).map((m) => m.purpose)).toEqual(['order.placed']);
  });

  it('SIM-F-013: cancel ⇒ one notice in the log, with the reason in plain words and never the team`s note; never twice', async () => {
    cancelOn();
    const o = await f.place('stock', { phone: phone() });
    await run();
    await cancelOrder(f.ordersDeps(), f.staff, o.orderId, { reasonCode: 'OUT_OF_STOCK', note: 'supplier late, internal' });
    await run();
    await run();
    const rows = await notices(o.orderId);
    expect(rows.map((r) => [r.step, r.channel, r.status])).toEqual([['cancelled', 'SMS', 'SENT']]);
    const sms = mine(o).filter((m) => m.purpose === 'order.cancelled');
    expect(sms).toHaveLength(1);
    expect(sms[0]!.text).toContain(DEFAULT_CANCEL_NOTICE.reasons.OUT_OF_STOCK!.bn);
    expect(sms[0]!.text).toContain(`https://shop.example/account/orders/${o.number}`);
    expect(sms[0]!.text).not.toContain('supplier');
  });

  it('the customer`s own one-tap cancel is confirmed to him in his words', async () => {
    cancelOn();
    f.overrides.set('messages.language', 'en');
    try {
      const o = await f.place('tap', { phone: phone() });
      await customerCancel(f.ordersDeps(), me(o.visitorId), { number: o.number, reasonKey: 'by-mistake' });
      await run();
      const [m] = mine(o).filter((x) => x.purpose === 'order.cancelled');
      expect(m!.text).toContain(DEFAULT_CANCEL_NOTICE.reasons.CUSTOMER_BEFORE_CONFIRM!.en);
      expect(m!.text).toMatch(/is cancelled/);
    } finally {
      f.overrides.delete('messages.language');
    }
  });

  it('a duplicate declined in review: the reason, and the order that goes ahead with its own tracking link', async () => {
    cancelOn();
    const tel = phone();
    const a = await f.place('dup-a', { phone: tel });
    const b = await f.place('dup-b', { phone: tel, lines: [{ variantId: f.v.whiteM }] });
    await confirmOrder(f.ordersDeps(), f.staff, a.orderId);
    const r = await screenOrder(f.ordersDeps(), { storeId: f.S, orderId: b.orderId });
    expect(r.alertId).not.toBeNull();
    await decideReview(f.ordersDeps(), f.staff, r.alertId!, { decision: 'decline', note: 'same shirt twice' });
    await run();
    const [m, ...more] = mine(b).filter((x) => x.purpose === 'order.cancelledDuplicate');
    expect(more).toHaveLength(0);
    expect(m!.text).toContain(a.number);
    expect(m!.text).toContain(`https://shop.example/account/orders/${a.number}`);
    expect(m!.text).not.toContain(`/account/orders/${b.number}`);
    expect(m!.text).not.toContain('same shirt');
    // the order that goes ahead is not touched and hears nothing about the other one
    expect((await db().order.findUniqueOrThrow({ where: { id: a.orderId } })).status).toBe('CONFIRMED');
    expect(await notices(a.orderId)).toHaveLength(0);
  });

  it('a duplicate cancelled by hand finds his earlier open order; with none left, the plain notice with the reason', async () => {
    cancelOn();
    const tel = phone();
    const a = await f.place('hand-a', { phone: tel });
    const b = await f.place('hand-b', { phone: tel });
    await cancelOrder(f.ordersDeps(), f.staff, b.orderId, { reasonCode: 'DUPLICATE_ORDER' });
    await run();
    const [m] = mine(b).filter((x) => x.purpose.startsWith('order.cancelled'));
    expect(m).toMatchObject({ purpose: 'order.cancelledDuplicate' });
    expect(m!.text).toContain(`/account/orders/${a.number}`);

    // his only other order is cancelled too: no order "goes ahead", so no such promise
    const lone = await f.place('hand-lone', { phone: phone() });
    await cancelOrder(f.ordersDeps(), f.staff, lone.orderId, { reasonCode: 'DUPLICATE_ORDER' });
    await run();
    const [p] = mine(lone).filter((x) => x.purpose.startsWith('order.cancelled'));
    expect(p).toMatchObject({ purpose: 'order.cancelled' });
    expect(p!.text).toContain(DEFAULT_CANCEL_NOTICE.reasons.DUPLICATE_ORDER!.bn);
  });

  it('SIM-F-013: a fake or test decline sends nothing, and the log says why', async () => {
    cancelOn();
    const o = await f.place('fake', { phone: phone() });
    await cancelOrder(f.ordersDeps(), f.staff, o.orderId, { reasonCode: 'RISK_DECLINED' });
    await run();
    expect(mine(o).filter((m) => m.purpose.startsWith('order.cancel'))).toHaveLength(0);
    expect((await notices(o.orderId)).map((r) => [r.status, r.reason])).toEqual([['SKIPPED', 'REASON_SILENT']]);
    // the owner's own list decides: with nothing silent the same decline is told
    f.overrides.set('messages.cancelNotice', { ...DEFAULT_CANCEL_NOTICE, silent: [] });
    const o2 = await f.place('fake-told', { phone: phone() });
    await cancelOrder(f.ordersDeps(), f.staff, o2.orderId, { reasonCode: 'RISK_DECLINED' });
    await run();
    expect(mine(o2).filter((m) => m.purpose === 'order.cancelled')).toHaveLength(1);
  });

  it('sits outside the caps (SIM-F-013 core review): a full SMS cap never hides a cancellation', async () => {
    cancelOn();
    f.overrides.set('messages.caps', { SMS: 1, WHATSAPP: 1, EMAIL: null, total: 1 });
    const o = await f.place('caps', { phone: phone() });
    await run();
    await cancelOrder(f.ordersDeps(), f.staff, o.orderId, { reasonCode: 'ADDRESS_UNREACHABLE' });
    await run();
    expect((await notices(o.orderId)).map((r) => r.status)).toEqual(['SENT']);
    expect(mine(o).map((m) => m.purpose)).toEqual(['order.placed', 'order.cancelled']);
  });
});
