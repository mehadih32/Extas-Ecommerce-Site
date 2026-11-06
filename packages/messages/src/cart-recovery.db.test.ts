// S13 · PR 276 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL) — abandoned-cart recovery with the offer rules: a signed-in customer's left bag gets at most
// two messages, ever, and only with his yes for offers: nothing while the switch is off, before the minutes, for a
// guest's bag (no number: C6.3's honest limit), for a bag worth less than the owner's minimum, or with no yes; the
// reminder by the first way he said yes on, with his bag's count, the link that puts the bag back and the SMS stop
// line; the offer only while it is switched on with a code the rules engine lets him use, for a bag worth the offer's
// minimum, once per customer in the days; then nothing. Never a bag the checkout follow-up has (its number typed while
// that ladder is on), a number already followed up in the gap days, or one who ordered since. The order he places
// counts the messages as bringing the bag back. The sender is a stand-in: nothing is ever sent to a real number. Every
// value is a made-up value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { captureDraft } from '@extas/checkout';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { registry, type MessageChannel } from '@extas/settings';
import { CART_RECOVERY_KIND, CART_RECOVERY_STEP, cartRecoveryDue, runMessages, type MessagesDeps, type OutgoingMessage } from './index';

// hardcode-ok: made-up test numbers
const PHONE = { a: '01700002761', b: '01700002762', c: '01700002763', d: '01700002764', e: '01700002765', g: '01700002766' } as const;
const e164 = (p: string) => `+88${p}`;
const MIN = 60_000;
const HOUR = 60 * MIN;
const HOST = 'shop.example.com';
const ON = { ...registry['orders.cartRecovery'].default, enabled: true };

describe.skipIf(!HAS_TEST_DB)('PR 276 · a signed-in customer\'s left bag, two messages at most, the offer under the offer rules (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel })[] = [];
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({ provider: 'test', mode: 'MOCK', send: async (m) => (outbox.push({ channel, ...m }), { ok: true, messageId: `m-${outbox.length}` }) });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const at = (ms: number) => (f.clock.now = new Date(ms));
  const run = () => runMessages(deps(), f.S);
  /** A signed-in customer (his number on his account, his recorded answer for offers) leaves two pieces in his bag. */
  const leave = async (name: string, phone: string | null, yes: MessageChannel[] = ['SMS']) => {
    const bag = await f.bag(name, [{ variantId: f.v.skyM, quantity: 2 }]);
    if (!phone) return { ...bag, customerId: '' }; // a guest's bag: no account
    const c = await db().customer.create({ data: { storeId: f.S, phone: e164(phone), name: 'Test Customer' } });
    await db().cart.update({ where: { id: bag.cartId }, data: { customerId: c.id, lastActivityAt: f.clock.now } });
    for (const ch of yes) await db().consentRecord.create({ data: { storeId: f.S, customerId: c.id, phone: e164(phone), channel: ch, granted: true, source: 'test', scope: 'MARKETING', createdAt: new Date(f.clock.now.getTime() - MIN) } });
    return { ...bag, customerId: c.id };
  };
  const cart = (id: string) => db().cart.findUniqueOrThrow({ where: { id } });
  const logs = (cartId: string) => db().notificationLog.findMany({ where: { storeId: f.S, step: CART_RECOVERY_STEP, dedupeKey: { startsWith: `cartRecovery:${cartId}:` } }, orderBy: { createdAt: 'asc' } });
  const last = () => outbox[outbox.length - 1]!;

  let T = 0;
  beforeAll(async () => {
    f = await setUpOrders('cart-recovery');
    f.overrides.set('messages.enabled', true);
    f.overrides.set('messages.language', 'en');
    f.overrides.set('system.stagingHost', HOST);
    f.overrides.set('customers.journeys', { ...registry['customers.journeys'].default, stopLine: { bn: 'বন্ধ করতে STOP', en: 'Reply STOP for no offers' } });
    T = f.clock.now.getTime();
  });
  afterAll(async () => f?.t.drop());

  it('the pure ladder: the minutes, the catch-up window, the offer only when on, with a code, after a reminder that went', () => {
    const cfg = { ...ON, offer: { ...ON.offer, enabled: true, couponCode: 'X' } };
    const c = { recoveryCount: 0, lastActivityAt: new Date(T) };
    expect(cartRecoveryDue(cfg, c, null, new Date(T + 119 * MIN))).toBeNull();
    expect(cartRecoveryDue(cfg, c, null, new Date(T + 120 * MIN))).toBe(1);
    expect(cartRecoveryDue(cfg, c, null, new Date(T + 120 * MIN + 25 * HOUR))).toBeNull();
    const one = { ...c, recoveryCount: 1 };
    expect(cartRecoveryDue(cfg, one, null, new Date(T + 48 * HOUR))).toBeNull();
    expect(cartRecoveryDue(cfg, one, new Date(T + 2 * HOUR), new Date(T + 26 * HOUR))).toBe(2);
    expect(cartRecoveryDue({ ...cfg, offer: { ...cfg.offer, couponCode: ' ' } }, one, new Date(T), new Date(T + 48 * HOUR))).toBeNull();
    expect(cartRecoveryDue({ ...cfg, offer: { ...cfg.offer, enabled: false } }, one, new Date(T), new Date(T + 48 * HOUR))).toBeNull();
    expect(cartRecoveryDue(cfg, { ...c, recoveryCount: 2 }, new Date(T), new Date(T + 96 * HOUR))).toBeNull();
  });

  it('off as shipped; then never a guest bag, a bag under the minimum, before the minutes or without a yes; the reminder by SMS when WhatsApp has no yes', async () => {
    at(T);
    const a = await leave('cr-a', PHONE.a, ['SMS']);
    const guest = await leave('cr-guest', null);
    const none = await leave('cr-none', PHONE.b, []);
    at(T + 121 * MIN);
    await run();
    expect((await cart(a.cartId)).recoveryCount).toBe(0);
    f.overrides.set('orders.cartRecovery', { ...ON, minBagMinor: 100_000_000 });
    await run();
    expect((await cart(a.cartId)).recoveryCount).toBe(0);
    f.overrides.set('orders.cartRecovery', ON);
    at(T + 100 * MIN);
    await run();
    expect((await cart(a.cartId)).recoveryCount).toBe(0);
    at(T + 121 * MIN);
    const before = outbox.length;
    const r = await run();
    expect(r?.cartRecovery).toMatchObject({ queued: 1, reminders: 1, offers: 0 });
    expect(outbox.length).toBe(before + 1);
    const m = last();
    expect(m.channel).toBe('SMS');
    expect(m.to).toBe(e164(PHONE.a));
    const c = await cart(a.cartId);
    expect(c.recoveryCount).toBe(1);
    expect(c.restoreCode).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(m.text).toContain('2 item(s)');
    expect(m.text).toContain(`https://${HOST}/api/bag/back/${c.restoreCode}?l=en`);
    expect(m.text).toContain('Reply STOP for no offers');
    const rm = await db().recoveryMessage.findFirstOrThrow({ where: { storeId: f.S, cartId: a.cartId } });
    expect(rm).toMatchObject({ kind: CART_RECOVERY_KIND, attempt: 1, channel: 'SMS', offerCouponId: null });
    expect(rm.sentAt).not.toBeNull();
    for (const id of [guest.cartId, none.cartId]) {
      expect((await cart(id)).recoveryCount).toBe(0);
      expect(await logs(id)).toHaveLength(0);
    }
  });

  it('the offer rules: only with a code he may use, a bag worth the offer minimum, once per customer in the days; then nothing (two at most)', async () => {
    const T2 = T + 10 * 24 * HOUR;
    at(T2);
    const a = await leave('cr-offer', PHONE.c, ['SMS', 'WHATSAPP']);
    at(T2 + 121 * MIN);
    await run();
    expect((await logs(a.cartId)).map((l) => l.channel)).toEqual(['WHATSAPP']);
    await f.coupon('GUEST276', 5_000, { audience: 'GUESTS' });
    await f.coupon('BACK276', 5_000);
    // a code the rules engine refuses him (guests only): no offer
    f.overrides.set('orders.cartRecovery', { ...ON, offer: { ...ON.offer, enabled: true, couponCode: 'guest276' } });
    at(T2 + 121 * MIN + 24 * HOUR);
    await run();
    expect((await cart(a.cartId)).recoveryCount).toBe(1);
    // a bag under the offer's minimum: no offer
    f.overrides.set('orders.cartRecovery', { ...ON, offer: { ...ON.offer, enabled: true, couponCode: 'back276', minBagMinor: 100_000_000 } });
    await run();
    expect((await cart(a.cartId)).recoveryCount).toBe(1);
    // a usable code and the bag fits: the offer, the way the reminder went, with the code
    f.overrides.set('orders.cartRecovery', { ...ON, offer: { ...ON.offer, enabled: true, couponCode: 'back276' } });
    const r = await run();
    expect(r?.cartRecovery.offers).toBe(1);
    expect(last().channel).toBe('WHATSAPP');
    expect(last().text).toContain('BACK276');
    const offer = await db().recoveryMessage.findFirstOrThrow({ where: { storeId: f.S, cartId: a.cartId, attempt: 2 } });
    expect(offer.offerCouponId).not.toBeNull();
    expect(offer.sentAt).not.toBeNull();
    at(T2 + 10 * 24 * HOUR);
    const n = outbox.length;
    await run();
    expect(outbox.length).toBe(n);
    expect((await cart(a.cartId)).recoveryCount).toBe(2);
    // the same customer's next left bag, inside the offer's days: the reminder may go (after the number's gap), the offer not
    const c = await db().cart.findUniqueOrThrow({ where: { id: a.cartId }, select: { customerId: true } });
    const b = await f.bag('cr-offer-2', [{ variantId: f.v.skyM, quantity: 1 }]);
    await db().cart.update({ where: { id: b.cartId }, data: { customerId: c.customerId, lastActivityAt: f.clock.now } });
    at(f.clock.now.getTime() + 121 * MIN);
    await run();
    expect((await cart(b.cartId)).recoveryCount).toBe(1);
    at(f.clock.now.getTime() + 25 * HOUR);
    await run();
    expect((await cart(b.cartId)).recoveryCount).toBe(1);
  });

  it('never a bag the checkout follow-up has, a number followed up in the gap days, or one who ordered since; his order counts the bag as back', async () => {
    const T3 = T + 40 * 24 * HOUR;
    at(T3);
    f.overrides.set('checkout.capture.enabled', true);
    f.overrides.set('orders.followUp', { ...registry['orders.followUp'].default, enabled: true });
    f.overrides.set('orders.cartRecovery', ON);
    // his number typed at checkout while the checkout follow-up is on: that ladder's, not this one's
    const d = await leave('cr-draft', PHONE.d, ['SMS']);
    await captureDraft(f.deps(), { storeId: f.S, visitorId: d.visitorId, customerId: d.customerId, input: { form: { name: 'Test Customer', phone: PHONE.d, address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' }, step: 'delivery' } });
    // a number that had a checkout follow-up message in the gap days
    const g = await leave('cr-gap', PHONE.e, ['SMS']);
    await db().notificationLog.create({ data: { storeId: f.S, channel: 'SMS', recipient: e164(PHONE.e), status: 'SENT', dedupeKey: `test-gap-276`, step: 'checkoutFollowUp', createdAt: new Date(T3 - 24 * HOUR) } });
    // one who ordered since his bag began
    const o = await leave('cr-ordered', PHONE.g, ['SMS']);
    await f.place('cr-ordered-elsewhere', { phone: PHONE.g, customerId: o.customerId });
    at(T3 + 121 * MIN);
    await run();
    for (const id of [d.cartId, g.cartId, o.cartId]) expect(await logs(id)).toHaveLength(0);
    f.overrides.set('orders.followUp', registry['orders.followUp'].default);
    f.overrides.set('checkout.capture.enabled', false);

    // the reminder goes, then he orders from that bag: its message counts as bringing it back
    const T4 = T + 60 * 24 * HOUR;
    at(T4);
    const back = await db().cart.findFirstOrThrow({ where: { id: d.cartId } });
    await db().cart.update({ where: { id: back.id }, data: { lastActivityAt: f.clock.now } });
    at(T4 + 121 * MIN);
    await run();
    const sent = await db().recoveryMessage.findFirstOrThrow({ where: { storeId: f.S, cartId: d.cartId } });
    expect(sent.sentAt).not.toBeNull();
    const placed = await f.place('cr-draft', { phone: PHONE.d, customerId: d.customerId });
    expect((await db().recoveryMessage.findUniqueOrThrow({ where: { id: sent.id } })).recoveredOrderId).toBe(placed.orderId);
  });
});
