// S28 · PR 706 (CN-049) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a message about a practice order
// or a practice customer is never sent (SMS, WhatsApp, e-mail), a practice unfinished checkout gets no follow-up, and a
// real order's message is not stopped by the guard. The sender is a stand-in: nothing is ever sent to a real number.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { registry, type MessageChannel } from '@extas/settings';
import { runMessages, type MessagesDeps, type OutgoingMessage } from './index';

const PRACTICE_PHONE = '+8801000000501'; // hardcode-ok: a made-up practice number
const REAL_PHONE = '+8801700000502'; // hardcode-ok: a made-up test number

describe.skipIf(!HAS_TEST_DB)('practice records never get a message (PR 706)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel })[] = [];
  const sender: MessagesDeps['sender'] = async (_s, channel) => ({
    provider: 'test',
    mode: 'MOCK',
    send: async (m) => (outbox.push({ channel, ...m }), { ok: true, messageId: `m-${outbox.length}` }),
  });
  const deps = (): MessagesDeps => ({
    db: db(),
    settings: f.deps().settings,
    sender,
    now: () => f.clock.now,
  });
  const mkOrder = (number: string, phone: string, isPractice: boolean) =>
    db().order.create({
      data: {
        storeId: f.S,
        number,
        status: 'CONFIRMED',
        source: 'WEBSITE',
        currency: 'BDT',
        subtotalMinor: 1000,
        totalMinor: 1000,
        phone,
        customerName: 'Test Customer',
        idempotencyKey: `k-${number}`,
        isPractice,
        confirmedAt: f.clock.now,
      },
    });
  const queue = (orderId: string, phone: string) =>
    db().notificationLog.create({
      data: {
        storeId: f.S,
        orderId,
        channel: 'SMS',
        recipient: phone,
        status: 'QUEUED',
        step: 'confirmed',
        dedupeKey: `confirmed:${orderId}`,
        sendAfter: new Date(f.clock.now.getTime() - 60_000),
      },
    });

  beforeAll(async () => {
    f = await setUpOrders('practice-msg');
    f.overrides.set('messages.enabled', true);
    f.overrides.set('messages.language', 'en');
    f.overrides.set('system.stagingHost', 'shop.example.com');
  });
  afterAll(async () => f?.t.drop());

  it('a queued message of a practice order is closed as skipped (PRACTICE_RECORD) and nothing is sent', async () => {
    const o = await mkOrder('P-9001', PRACTICE_PHONE, true);
    const row = await queue(o.id, PRACTICE_PHONE);
    await runMessages(deps(), f.S);
    const after = await db().notificationLog.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after).toMatchObject({
      status: 'SKIPPED',
      reason: 'PRACTICE_RECORD',
    });
    expect(outbox.filter((m) => m.to === PRACTICE_PHONE)).toHaveLength(0);
  });

  it('a message to a practice customer (no order) is skipped the same way', async () => {
    const c = await db().customer.create({
      data: {
        storeId: f.S,
        phone: '+8801000000503',
        name: 'Practice Person',
        isPractice: true,
      },
    });
    const row = await db().notificationLog.create({
      data: {
        storeId: f.S,
        customerId: c.id,
        channel: 'SMS',
        recipient: c.phone!,
        status: 'QUEUED',
        step: 'confirmed',
        dedupeKey: `pc:${c.id}`,
        sendAfter: new Date(f.clock.now.getTime() - 60_000),
        orderId: (await mkOrder('P-9002', c.phone!, true)).id,
      },
    });
    await runMessages(deps(), f.S);
    expect(await db().notificationLog.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'SKIPPED', reason: 'PRACTICE_RECORD' });
    expect(outbox.filter((m) => m.to === c.phone)).toHaveLength(0);
  });

  it("a real order's queued message goes out (the test would otherwise prove nothing)", async () => {
    const o = await mkOrder('EX-9003', REAL_PHONE, false);
    const row = await queue(o.id, REAL_PHONE);
    await runMessages(deps(), f.S);
    const after = await db().notificationLog.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after).toMatchObject({ status: 'SENT' });
    expect(outbox.filter((m) => m.to === REAL_PHONE)).toHaveLength(1);
  });

  it('a practice unfinished checkout gets no follow-up reminder', async () => {
    f.overrides.set('orders.followUp', {
      ...registry['orders.followUp'].default,
      enabled: true,
    });
    const last = new Date(f.clock.now.getTime() - 90 * 60_000);
    const mk = (visitorId: string, phone: string, isPractice: boolean) =>
      db().checkoutDraft.create({
        data: {
          storeId: f.S,
          visitorId,
          phone,
          name: 'Test Customer',
          lastStep: 'payment',
          lastActivityAt: last,
          isPractice,
        },
      });
    const practice = await mk('practice-v', PRACTICE_PHONE, true);
    await runMessages(deps(), f.S);
    expect(
      (
        await db().checkoutDraft.findUniqueOrThrow({
          where: { id: practice.id },
        })
      ).followUpCount,
    ).toBe(0);
    expect(outbox.filter((m) => m.to === PRACTICE_PHONE)).toHaveLength(0);
  });
});
