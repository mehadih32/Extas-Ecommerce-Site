// PR 542 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the advance request's messages. A person's
// "Request advance" sends one message per channel ticked (never the call, which is the call queue's) with the advance
// and its pay link, and never the journey's "advance asked" on top; planned again, nothing new; "Send again" goes again;
// once the order no longer waits, a queued one is skipped. Without a press, an order that waits for an advance (a gift,
// PR 605) gets only the journey's own step, which says the advance, not the order total. Every value is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { awaitAdvance, recordAdvance, requestAdvance, resendAdvance, systemBy } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_JOURNEY, type MessageChannel } from '@extas/settings';
import { ADVANCE_REQUEST, runMessages, type MessagesDeps } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 542 · the advance request messages (PostgreSQL)', () => {
  let f: OrdersFixture;
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
  const mine = (o: { number: string }, purpose?: string) => outbox.filter((m) => new RegExp(`${o.number}(?!\\d)`).test(m.text) && (!purpose || m.purpose === purpose));

  beforeAll(async () => {
    f = await setUpOrders('messages_advance');
    f.overrides.set('system.stagingHost', 'shop.example');
    // quiet hours off here: the test runs at any hour
    f.overrides.set('messages.quietHours', { on: false, fromHour: 22, toHour: 8 });
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(async () => {
    f.clock.now = new Date();
    await run();
    outbox.length = 0;
  });

  it('SIM-F-016: one message per channel ticked, with the advance and its pay link; never the journey step on top, never twice', async () => {
    f.overrides.set('messages.journey', { ...DEFAULT_JOURNEY, advanceRequested: { ...DEFAULT_JOURNEY.advanceRequested, on: true } });
    const o = await f.place('adv-msg');
    await run();
    outbox.length = 0;
    const r = await requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'full', channels: ['SMS', 'WHATSAPP', 'CALL'] });
    await run();
    const sent = mine(o, 'order.advanceRequest');
    expect(sent.map((m) => m.channel).sort()).toEqual(['SMS', 'WHATSAPP']);
    const amount = `৳${(r.amountMinor / 100).toLocaleString('en')}`;
    for (const m of sent) {
      expect(m.text).toContain(amount);
      expect(m.text).toMatch(new RegExp(`https://shop\\.example(/bn)?/pay/${r.token}`));
    }
    expect(mine(o, 'order.advanceRequested')).toHaveLength(0);
    const rows = await db().notificationLog.findMany({ where: { orderId: o.orderId, step: ADVANCE_REQUEST } });
    expect(rows.map((x) => x.status)).toEqual(['SENT', 'SENT']);
    expect(rows.every((x) => x.dedupeKey.startsWith(`order:${o.orderId}:advanceRequest:`))).toBe(true);
    await run();
    expect(mine(o, 'order.advanceRequest')).toHaveLength(2);
    // "Send again" goes again on the channel picked
    await resendAdvance(f.ordersDeps(), f.staff, o.orderId, { channels: ['SMS'] });
    await run();
    expect(mine(o, 'order.advanceRequest').map((m) => m.channel).sort()).toEqual(['SMS', 'SMS', 'WHATSAPP']);
    f.overrides.delete('messages.journey');
  });

  it('a queued request whose order no longer waits (paid in between) is skipped, never sent', async () => {
    const o = await f.place('adv-moved');
    const r = await requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'full', channels: ['SMS'] });
    // the money is in (as the payments service writes it), then the order service's hook
    const w = await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { advanceRequiredMinor: true } });
    await db().payment.update({ where: { id: r.paymentId }, data: { status: 'PAID' } });
    await db().order.update({ where: { id: o.orderId }, data: { paidMinor: w.advanceRequiredMinor! } });
    await recordAdvance(f.ordersDeps(), { storeId: f.S, orderId: o.orderId }, systemBy('payments'));
    await run();
    expect(mine(o, 'order.advanceRequest')).toHaveLength(0);
    const row = await db().notificationLog.findFirstOrThrow({ where: { orderId: o.orderId, step: ADVANCE_REQUEST } });
    expect(row).toMatchObject({ status: 'SKIPPED', reason: 'ORDER_MOVED_ON' });
  });

  it('without a press, the journey step says the advance itself (not the total), and no request message goes', async () => {
    f.overrides.set('messages.journey', { ...DEFAULT_JOURNEY, advanceRequested: { ...DEFAULT_JOURNEY.advanceRequested, on: true } });
    const o = await f.place('adv-journey');
    await awaitAdvance(f.ordersDeps(), { storeId: f.S, orderId: o.orderId }, systemBy('gift'), { requiredMinor: 20_000 });
    await run();
    expect(mine(o, 'order.advanceRequest')).toHaveLength(0);
    const step = mine(o, 'order.advanceRequested');
    expect(step).toHaveLength(1);
    expect(step[0]!.text).toContain('৳200');
    f.overrides.delete('messages.journey');
  });
});
