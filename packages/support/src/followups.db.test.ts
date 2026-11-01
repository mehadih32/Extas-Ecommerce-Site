// PR 433 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): follow-ups on chats that did not become an
// order. Off as it ships, nothing; on, a quiet chat whose products were sent and not ordered gets one after afterHours,
// in the store's words with the product's name, listed in the inbox's Follow-ups view; a person sends it (an ordinary
// reply, logged) or skips it (it does not come back in that quiet stretch); the caps hold (per chat, per person across
// chats, per day, the reply window); the customer writing closes it; an order after it is credited; win-back on a
// cancelled order only when switched on; the owner's live coupon is mentioned, never changed; a reader is refused.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { chatFollowUp, chatVisitorId, receiveMessage, replyToConversation, sendFollowUp, skipFollowUp, supportInbox, supportThread, sweepFollowUps, type SupportDeps, type Who } from './index';

const H = 3_600_000;

describe.skipIf(!HAS_TEST_DB)('PR 433 · follow-ups (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  const overrides = new Map<string, unknown>();
  let clock = new Date('2026-11-01T06:00:00Z').getTime();
  const at = (hours: number) => (clock += hours * H);
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => new Date(clock) });
  const who: Record<'agent' | 'reader', Who> = {} as never;
  let n = 0;
  let productId = '';
  const on = (over: Partial<Value<'support.followUp'>> = {}) => overrides.set('support.followUp', { ...registry['support.followUp'].default, enabled: true, banglishReply: 'en', ...over });
  const say = (contact: string, text: string, kind: 'whatsapp' | 'messenger' = 'whatsapp') =>
    receiveMessage(deps(), { storeId: S, channel: { kind, externalId: `sample-${kind}-433` }, contact: { externalId: contact, name: 'New' }, message: { externalId: `m433-${++n}`, text, sentAt: new Date(clock) } });
  const answer = async (conversationId: string, body = 'Here it is.') => {
    const th = await supportThread(deps(), who.agent, conversationId);
    return replyToConversation(deps(), who.agent, { conversationId, body, requestKey: `r433-${++n}-abcdefgh`, version: th.version });
  };
  const share = (conversationId: string) => t.prisma.supportProductShare.create({ data: { storeId: S, conversationId, productId, refCode: `s433share${++n}`, createdAt: new Date(clock) } });
  const rows = (conversationId: string) => t.prisma.supportFollowUp.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
  const version = async (id: string) => (await supportThread(deps(), who.agent, id)).version;

  beforeAll(async () => {
    t = await createTestDatabase('support_followups');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const agent = await createRole(t.prisma, SYSTEM, { key: 't433-agent', nameEn: 'agent', nameBn: 'agent', permissions: ['support.read', 'support.reply'] });
    const reader = await createRole(t.prisma, SYSTEM, { key: 't433-reader', nameEn: 'reader', nameBn: 'reader', permissions: ['support.read'] });
    for (const [k, r] of [['agent', agent], ['reader', reader]] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `t433-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: r.id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    for (const kind of ['whatsapp', 'messenger'] as const) await t.prisma.supportChannel.create({ data: { storeId: S, kind, externalId: `sample-${kind}-433`, name: `${kind} (sample)`, enabled: true } });
    productId = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-polo-433', nameEn: 'Sample Polo', nameBn: 'স্যাম্পল পোলো' } })).id;
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('does nothing while switched off (as it ships)', async () => {
    expect(registry['support.followUp'].default.enabled).toBe(false);
    const r = await say('off', 'dam koto?');
    await share(r.conversationId);
    await answer(r.conversationId);
    at(10);
    expect(await sweepFollowUps(deps(), S)).toEqual({ made: 0, closed: 0, ordered: 0 });
    expect(await chatFollowUp(deps(), who.agent, r.conversationId)).toBeNull();
    const box = await supportInbox(deps(), who.agent, { view: 'followup' });
    expect(box.followUps).toBe(false);
    expect(box.counts.followup).toBe(0);
    await expect(sendFollowUp(deps(), who.agent, { conversationId: r.conversationId, followUpId: r.conversationId, body: 'x', requestKey: 'k433-off-abcdefgh', version: 'v' })).rejects.toMatchObject({ code: 'FOLLOW_UP_OFF' });
    // the chat stays quiet past the person's gap, so it never counts later
    at(24 * 8);
  });

  it('puts up a follow-up on a quiet chat whose products were not ordered; a person sends it; an order after it is credited', async () => {
    on();
    const r = await say('rahim', 'dam koto?');
    await share(r.conversationId);
    await answer(r.conversationId);
    at(3);
    expect((await sweepFollowUps(deps(), S)).made).toBe(0);
    await expect(chatFollowUp(deps(), who.reader, r.conversationId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    at(1.5);
    expect((await sweepFollowUps(deps(), S)).made).toBe(1);
    const f = await chatFollowUp(deps(), who.agent, r.conversationId);
    expect(f).toMatchObject({ rule: 'products', lang: 'en', offer: null, windowEndsAt: null });
    expect(f!.body).toBe('Hi, did you like the Sample Polo we sent? Tell us your size and we can place the order for you here.');
    const box = await supportInbox(deps(), who.agent, { view: 'followup' });
    expect(box.followUps).toBe(true);
    expect(box.rows.map((x) => x.id)).toEqual([r.conversationId]);
    expect(box.counts.followup).toBe(1);
    // nothing went out by itself
    expect(await t.prisma.message.count({ where: { conversationId: r.conversationId, direction: 'OUT' } })).toBe(1);

    const press = { conversationId: r.conversationId, followUpId: f!.id, body: `${f!.body} We have M and L.`, requestKey: 'k433-send-abcdefgh', version: await version(r.conversationId) };
    const sent = await sendFollowUp(deps(), who.agent, press);
    expect(sent).toMatchObject({ replay: false, delivery: 'NOT_SENT' });
    expect(await sendFollowUp(deps(), who.agent, press)).toMatchObject({ replay: true, messageId: sent.messageId });
    const [row] = await rows(r.conversationId);
    expect(row).toMatchObject({ outcome: 'SENT', messageId: sent.messageId, decidedById: who.agent.actor.staffUserId, ruleKey: 'products' });
    const m = await t.prisma.message.findUniqueOrThrow({ where: { id: sent.messageId } });
    expect(m).toMatchObject({ direction: 'OUT', senderType: 'STAFF', senderName: 'Sample agent', body: press.body });
    expect(await t.prisma.conversationEvent.count({ where: { conversationId: r.conversationId, kind: 'FOLLOWUP_SENT', actorStaffId: who.agent.actor.staffUserId } })).toBe(1);
    expect(await chatFollowUp(deps(), who.agent, r.conversationId)).toBeNull();
    // one per chat as shipped: never a second, however quiet
    at(10);
    await sweepFollowUps(deps(), S);
    expect(await rows(r.conversationId)).toHaveLength(1);

    // the customer orders from the product sent: the follow-up is credited, once
    at(1);
    const o = await t.prisma.order.create({
      data: { storeId: S, number: 'EX4330', source: 'WHATSAPP', currency: 'BDT', status: 'PLACED', placedAt: new Date(clock), subtotalMinor: 1000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1000, paymentMethod: 'COD', phone: '+8801700004330', idempotencyKey: 'f433-1' }, // hardcode-ok: made-up
    });
    await t.prisma.supportProductShare.updateMany({ where: { conversationId: r.conversationId }, data: { orderId: o.id } });
    expect((await sweepFollowUps(deps(), S)).ordered).toBe(1);
    expect((await sweepFollowUps(deps(), S)).ordered).toBe(0);
    expect((await rows(r.conversationId))[0]!.outcome).toBe('ORDERED');
    expect(await t.prisma.conversationEvent.findFirst({ where: { conversationId: r.conversationId, kind: 'FOLLOWUP_ORDERED' } })).toMatchObject({ actorType: 'SYSTEM', data: { number: 'EX4330' } });
  });

  it('a bag left in the chat: skipped, it does not come back in that quiet stretch; the customer writing closes a waiting one', async () => {
    on({ gapDays: 1 });
    at(24 * 2);
    const r = await say('karim', 'আমার ব্যাগ');
    const cart = await t.prisma.cart.create({ data: { storeId: S, visitorId: chatVisitorId(r.conversationId) } });
    await t.prisma.cartItem.create({ data: { storeId: S, cartId: cart.id, variantId: productId, quantity: 2, unitPriceMinor: 1000 } });
    await answer(r.conversationId);
    at(5);
    await sweepFollowUps(deps(), S);
    const f = await chatFollowUp(deps(), who.agent, r.conversationId);
    expect(f).toMatchObject({ rule: 'bag', lang: 'bn' });
    expect(f!.body).toContain('ব্যাগ রেডি');
    expect(await skipFollowUp(deps(), who.agent, { conversationId: r.conversationId, followUpId: f!.id })).toEqual({ skipped: true });
    await expect(skipFollowUp(deps(), who.agent, { conversationId: r.conversationId, followUpId: f!.id })).rejects.toMatchObject({ code: 'FOLLOW_UP_GONE', status: 409 });
    await expect(sendFollowUp(deps(), who.agent, { conversationId: r.conversationId, followUpId: f!.id, body: 'x', requestKey: 'k433-gone-abcdefgh', version: await version(r.conversationId) })).rejects.toMatchObject({ code: 'FOLLOW_UP_GONE' });
    expect(await t.prisma.message.count({ where: { conversationId: r.conversationId, body: 'x' } })).toBe(0);
    expect(await t.prisma.conversationEvent.count({ where: { conversationId: r.conversationId, kind: 'FOLLOWUP_SKIPPED' } })).toBe(1);
    at(5);
    await sweepFollowUps(deps(), S);
    expect(await rows(r.conversationId)).toHaveLength(1);

    // the chat moves: a new quiet stretch gets one again; then the customer writes and it closes
    await say('karim', 'ekto pore boli');
    await answer(r.conversationId);
    at(5);
    await sweepFollowUps(deps(), S);
    expect((await rows(r.conversationId)).map((x) => x.outcome)).toEqual(['SKIPPED', null]);
    await say('karim', 'ok order korbo');
    expect(await chatFollowUp(deps(), who.agent, r.conversationId)).toBeNull();
    await sweepFollowUps(deps(), S);
    expect((await rows(r.conversationId)).map((x) => x.outcome)).toEqual(['SKIPPED', 'CLOSED']);
  });

  it('holds the caps: one person across chats in gapDays, the store\'s day, the reply window', async () => {
    on({ perDay: 50 });
    at(24 * 3);
    const customerId = (await t.prisma.customer.create({ data: { storeId: S, name: 'Sumon (sample)', phone: '+8801700004331' } })).id; // hardcode-ok: made-up number
    const a = await say('sumon-wa', 'dam?', 'whatsapp');
    const b = await say('sumon-fb', 'dam?', 'messenger');
    for (const c of [a, b]) {
      await t.prisma.conversation.update({ where: { id: c.conversationId }, data: { customerId } });
      await share(c.conversationId);
      await answer(c.conversationId);
    }
    at(5);
    await sweepFollowUps(deps(), S);
    const fa = await chatFollowUp(deps(), who.agent, a.conversationId);
    const fb = await chatFollowUp(deps(), who.agent, b.conversationId);
    // one person, two channels: one follow-up (on the chat answered last)
    expect([!!fa, !!fb]).toEqual([false, true]);
    await sendFollowUp(deps(), who.agent, { conversationId: b.conversationId, followUpId: fb!.id, body: fb!.body, requestKey: 'k433-cap-abcdefgh', version: await version(b.conversationId) });
    at(5);
    await sweepFollowUps(deps(), S);
    expect(await rows(a.conversationId)).toHaveLength(0);

    // the store's day
    on({ perDay: 1 });
    at(24 * 2);
    const c1 = await say('day-1', 'dam?');
    const c2 = await say('day-2', 'dam?');
    for (const c of [c1, c2]) {
      await share(c.conversationId);
      await answer(c.conversationId);
    }
    at(5);
    expect((await sweepFollowUps(deps(), S)).made).toBe(1);
    expect((await sweepFollowUps(deps(), S)).made).toBe(0);
    on({ perDay: 3 });
    expect((await sweepFollowUps(deps(), S)).made).toBe(1);

    // Messenger's reply window closing within the margin: none
    at(24 * 2);
    const w = await say('window', 'dam?', 'messenger');
    await share(w.conversationId);
    await answer(w.conversationId);
    await t.prisma.conversation.update({ where: { id: w.conversationId }, data: { windowExpiresAt: new Date(clock + 5.5 * H) } });
    at(5);
    await sweepFollowUps(deps(), S);
    expect(await rows(w.conversationId)).toHaveLength(0);
  });

  it('win-back on a cancelled order only when switched on; mentions the owner\'s live coupon and never changes it', async () => {
    at(24 * 3);
    const r = await say('wb', 'cancel korechi');
    const o = await t.prisma.order.create({
      data: { storeId: S, number: 'EX4331', source: 'WHATSAPP', currency: 'BDT', status: 'CANCELLED', cancelledAt: new Date(clock), placedAt: new Date(clock - H), subtotalMinor: 1000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1000, paymentMethod: 'COD', phone: '+8801700004332', idempotencyKey: 'f433-2' }, // hardcode-ok: made-up
    });
    await t.prisma.conversation.update({ where: { id: r.conversationId }, data: { orderId: o.id } });
    await answer(r.conversationId);
    on();
    at(5);
    await sweepFollowUps(deps(), S);
    expect(await rows(r.conversationId)).toHaveLength(0);

    const coupon = await t.prisma.coupon.create({ data: { storeId: S, code: 'SAMPLE433', kind: 'PERCENT', value: { percent: 10 }, enabled: false } });
    on({ rules: ['cancelled'], offerCode: 'sample433' });
    await say('wb', 'hmm');
    await answer(r.conversationId);
    at(5);
    await sweepFollowUps(deps(), S);
    const off = await chatFollowUp(deps(), who.agent, r.conversationId);
    expect(off).toMatchObject({ rule: 'cancelled', offer: null });
    await t.prisma.coupon.update({ where: { id: coupon.id }, data: { enabled: true } });
    const f = await chatFollowUp(deps(), who.agent, r.conversationId);
    expect(f!.offer).toEqual({ code: 'SAMPLE433' });
    expect(f!.body).toMatch(/cancelled\..*You can use the code SAMPLE433 at checkout\.$/);
    await sendFollowUp(deps(), who.agent, { conversationId: r.conversationId, followUpId: f!.id, body: f!.body, requestKey: 'k433-wb-abcdefgh', version: await version(r.conversationId) });
    expect((await rows(r.conversationId)).at(-1)).toMatchObject({ outcome: 'SENT', offerCouponId: coupon.id, ruleKey: 'cancelled' });
    // the coupon itself is the owner's: unchanged
    expect(await t.prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({ enabled: true, usedCount: 0, value: { percent: 10 }, usageLimit: null, endsAt: null });
  });
});
