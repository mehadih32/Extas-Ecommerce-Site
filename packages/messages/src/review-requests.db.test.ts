// PR 295 on a real PostgreSQL: the Day-3 review request (journey step `day3Review`) goes three days after delivery and
// leaves one ReviewRequest row; it is skipped while reviews are switched off (REVIEWS_OFF) and for an order whose every
// line was already reviewed (REVIEWED), and with `reviews.requests.skipReviewed` off he is asked anyway. Made-up data.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { registry, type MessageChannel } from '@extas/settings';
import { runMessages, sendDue, type MessagesDeps } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 295 · the Day-3 review request on PostgreSQL', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const outbox: { channel: MessageChannel; purpose: string; text: string }[] = [];
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({
    provider: 'test',
    mode: 'MOCK',
    send: async (m) => {
      outbox.push({ channel, purpose: m.purpose, text: m.text });
      return { ok: true, messageId: randomUUID() };
    },
  });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });

  /** A placed order, delivered now (as the courier hook writes it), its Day-3 row brought due and sent. */
  async function deliveredAndDue(name: string, review?: 'all') {
    // each order starts on the real clock (the timeline rows are stamped by PostgreSQL), then moves to its Day 3
    f.clock.now = new Date(Date.now() + 1_000);
    const o = await f.place(name);
    await db().order.update({ where: { id: o.orderId }, data: { status: 'DELIVERED', deliveredAt: f.clock.now } });
    await db().orderEvent.create({ data: { storeId: f.S, orderId: o.orderId, type: 'order.delivered', fromStatus: 'PLACED', toStatus: 'DELIVERED', actorType: 'SYSTEM', source: 'test' } });
    f.clock.now = new Date(f.clock.now.getTime() + 1_000);
    await runMessages(deps(), f.S);
    if (review) {
      const lines = await db().orderItem.findMany({ where: { orderId: o.orderId, status: 'ACTIVE' }, select: { id: true, productId: true } });
      for (const l of lines) await db().review.create({ data: { storeId: f.S, orderId: o.orderId, orderItemId: l.id, productId: l.productId, rating: 5, status: 'PENDING' } });
    }
    const row = await db().notificationLog.findFirstOrThrow({ where: { orderId: o.orderId, step: 'day3Review' } });
    f.clock.now = new Date(row.sendAfter!.getTime() + 60_000);
    await sendDue(deps(), f.S);
    return { o, row: await db().notificationLog.findUniqueOrThrow({ where: { id: row.id } }) };
  }

  beforeAll(async () => {
    f = await setUpOrders('messages-review-requests');
    f.overrides.set('system.stagingHost', 'shop.example');
  });
  afterAll(async () => f?.t.drop());
  beforeEach(() => {
    outbox.length = 0;
    f.overrides.delete('reviews.submit');
    f.overrides.delete('reviews.requests');
  });

  it('three days after delivery the request goes and is recorded once, with its channel', async () => {
    const { o, row } = await deliveredAndDue('asked');
    expect(row).toMatchObject({ status: 'SENT', channel: 'WHATSAPP' });
    expect(outbox.filter((m) => m.purpose === 'order.review' && m.text.includes(o.number))).toHaveLength(1);
    const req = await db().reviewRequest.findUniqueOrThrow({ where: { orderId: o.orderId } });
    expect(req).toMatchObject({ storeId: f.S, channel: 'WHATSAPP', reviewId: null });
    expect(req.sentAt?.getTime()).toBe(f.clock.now.getTime());
  });

  it('reviews switched off: the request is skipped (REVIEWS_OFF) and nothing is recorded', async () => {
    f.overrides.set('reviews.submit', { ...registry['reviews.submit'].default, enabled: false });
    const { o, row } = await deliveredAndDue('reviews-off');
    expect(row).toMatchObject({ status: 'SKIPPED', reason: 'REVIEWS_OFF' });
    expect(await db().reviewRequest.count({ where: { orderId: o.orderId } })).toBe(0);
    expect(outbox.filter((m) => m.purpose === 'order.review')).toHaveLength(0);
  });

  it('every line already reviewed: not asked again (REVIEWED); with skipReviewed off he is asked anyway', async () => {
    const a = await deliveredAndDue('reviewed', 'all');
    expect(a.row).toMatchObject({ status: 'SKIPPED', reason: 'REVIEWED' });
    expect(await db().reviewRequest.count({ where: { orderId: a.o.orderId } })).toBe(0);
    f.overrides.set('reviews.requests', { skipReviewed: false, resultDays: 30 });
    const b = await deliveredAndDue('reviewed-asked', 'all');
    expect(b.row).toMatchObject({ status: 'SENT' });
    expect(await db().reviewRequest.count({ where: { orderId: b.o.orderId } })).toBe(1);
  });
});
