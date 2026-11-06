// S13 · PR 275 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL) — SIM-F-026's acceptance: a customer who typed his number at checkout and left gets at most
// two messages, ever, and only with his yes for offers: nothing while the switch is off or before the minutes pass;
// the reminder by the first way he said yes on (never WhatsApp he did not tick), with his bag's count, the link that
// puts the bag back and the SMS stop line; the offer only while it is switched on with a live code, after the hours;
// then nothing. Never one who ordered since, one the team handled, a number already followed up in the gap days, or
// one with no yes. The order he places counts the follow-ups as bringing it back. The sender is a stand-in: nothing is
// ever sent to a real number. Every value is a made-up value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { captureDraft } from '@extas/checkout';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { registry, type MessageChannel } from '@extas/settings';
import { FOLLOW_UP_STEP, followUpDue, runMessages, type MessagesDeps, type OutgoingMessage } from './index';

// hardcode-ok: made-up test numbers
const PHONE = { a: '01700002751', b: '01700002752', c: '01700002753', d: '01700002754' } as const;
const e164 = (p: string) => `+88${p}`;
const MIN = 60_000;
const HOST = 'shop.example.com';
const ON = { ...registry['orders.followUp'].default, enabled: true };

describe.skipIf(!HAS_TEST_DB)('PR 275 · the follow-up of an unfinished checkout, two messages at most (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel })[] = [];
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({ provider: 'test', mode: 'MOCK', send: async (m) => (outbox.push({ channel, ...m }), { ok: true, messageId: `m-${outbox.length}` }) });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const at = (ms: number) => (f.clock.now = new Date(ms));
  /** A visitor with two pieces in his bag who types his details and leaves (at the clock's time). */
  const leave = async (name: string, phone: string, consent: { sms: boolean; whatsapp: boolean } | null) => {
    const bag = await f.bag(name, [{ variantId: f.v.skyM, quantity: 2 }]);
    const input = { form: { name: 'Test Customer', phone, address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' }, step: 'delivery' as const, ...(consent ? { consent } : {}) };
    expect(await captureDraft(f.deps(), { storeId: f.S, visitorId: bag.visitorId, input })).toEqual({ kept: true });
    return db().checkoutDraft.findFirstOrThrow({ where: { storeId: f.S, visitorId: bag.visitorId } });
  };
  const draft = (id: string) => db().checkoutDraft.findUniqueOrThrow({ where: { id } });
  const logs = (draftId: string) => db().notificationLog.findMany({ where: { storeId: f.S, step: FOLLOW_UP_STEP, dedupeKey: { startsWith: `followUp:${draftId}:` } }, orderBy: { createdAt: 'asc' } });

  let T = 0;
  beforeAll(async () => {
    f = await setUpOrders('follow-up');
    f.overrides.set('checkout.capture.enabled', true);
    f.overrides.set('checkout.consent.enabled', true);
    f.overrides.set('messages.enabled', true);
    f.overrides.set('messages.language', 'en');
    f.overrides.set('system.stagingHost', HOST);
    f.overrides.set('customers.journeys', { ...registry['customers.journeys'].default, stopLine: { bn: 'বন্ধ করতে STOP', en: 'Reply STOP for no offers' } });
    T = f.clock.now.getTime();
  });
  afterAll(async () => f?.t.drop());

  it('the pure ladder: the step reached, the minutes, the catch-up window, the offer only when on and after a reminder that went', () => {
    const cfg = { ...ON, offer: { enabled: true, afterHours: 24, couponCode: 'X' } };
    const left = new Date(T);
    const d = { followUpCount: 0, lastStep: 'delivery', lastActivityAt: left };
    expect(followUpDue(cfg, d, null, new Date(T + 59 * MIN))).toBeNull();
    expect(followUpDue(cfg, d, null, new Date(T + 60 * MIN))).toBe(1);
    expect(followUpDue(cfg, d, null, new Date(T + 60 * MIN + 25 * 60 * MIN))).toBeNull();
    expect(followUpDue({ ...cfg, minStep: 'payment' }, d, null, new Date(T + 60 * MIN))).toBeNull();
    const one = { ...d, followUpCount: 1 };
    expect(followUpDue(cfg, one, null, new Date(T + 48 * 60 * MIN))).toBeNull();
    expect(followUpDue(cfg, one, new Date(T + 60 * MIN), new Date(T + 60 * MIN + 24 * 60 * MIN))).toBe(2);
    expect(followUpDue({ ...cfg, offer: { ...cfg.offer, enabled: false } }, one, new Date(T), new Date(T + 48 * 60 * MIN))).toBeNull();
    expect(followUpDue(cfg, { ...d, followUpCount: 2 }, new Date(T), new Date(T + 96 * 60 * MIN))).toBeNull();
  });

  it('off as shipped, and never before the minutes or without his yes: nothing is queued or sent', async () => {
    at(T);
    const a = await leave('fu-a', PHONE.a, { sms: true, whatsapp: false });
    const quiet = await leave('fu-none', PHONE.d, null);
    at(T + 61 * MIN);
    await runMessages(deps(), f.S);
    expect((await draft(a.id)).followUpCount).toBe(0);
    f.overrides.set('orders.followUp', ON);
    at(T + 30 * MIN);
    await runMessages(deps(), f.S);
    expect((await draft(a.id)).followUpCount).toBe(0);
    at(T + 61 * MIN);
    await runMessages(deps(), f.S);
    // he never ticked anything and has no answer on record: no message
    expect((await draft(quiet.id)).followUpCount).toBe(0);
    expect(await logs(quiet.id)).toHaveLength(0);
  });

  it('the reminder: once, by SMS (WhatsApp not ticked), with his bag count, the bag link and the stop line; run again: nothing more', async () => {
    const a = await db().checkoutDraft.findFirstOrThrow({ where: { storeId: f.S, phone: e164(PHONE.a) } });
    expect(a.followUpCount).toBe(1);
    expect(a.restoreCode).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const sent = outbox.filter((m) => m.to === e164(PHONE.a));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.channel).toBe('SMS');
    expect(sent[0]!.text).toContain('2 item');
    expect(sent[0]!.text).toContain(`https://${HOST}/api/bag/back/${a.restoreCode}?l=en`);
    expect(sent[0]!.text).toContain('Reply STOP for no offers');
    const rm = await db().recoveryMessage.findFirstOrThrow({ where: { storeId: f.S, checkoutDraftId: a.id } });
    expect(rm).toMatchObject({ kind: 'INCOMPLETE', attempt: 1, channel: 'SMS', offerCouponId: null });
    expect(rm.sentAt).not.toBeNull();
    at(T + 10 * 60 * MIN);
    await runMessages(deps(), f.S);
    expect(outbox.filter((m) => m.to === e164(PHONE.a))).toHaveLength(1);
  });

  it('the offer: only once switched on with a live code, after the hours; then the ceiling: never a third message', async () => {
    const a = await db().checkoutDraft.findFirstOrThrow({ where: { storeId: f.S, phone: e164(PHONE.a) } });
    await f.coupon('BACK275', 5_000);
    f.overrides.set('orders.followUp', { ...ON, offer: { enabled: true, afterHours: 24, couponCode: 'back275' } });
    at(T + 61 * MIN + 23 * 60 * MIN);
    await runMessages(deps(), f.S);
    expect((await draft(a.id)).followUpCount).toBe(1);
    at(T + 61 * MIN + 25 * 60 * MIN);
    await runMessages(deps(), f.S);
    expect((await draft(a.id)).followUpCount).toBe(2);
    const sent = outbox.filter((m) => m.to === e164(PHONE.a));
    expect(sent).toHaveLength(2);
    expect(sent[1]!.text).toContain('BACK275');
    expect(sent[1]!.text).toContain(`/api/bag/back/${a.restoreCode}`);
    const offer = await db().recoveryMessage.findFirstOrThrow({ where: { storeId: f.S, checkoutDraftId: a.id, attempt: 2 } });
    expect(offer.offerCouponId).not.toBeNull();
    at(T + 10 * 24 * 60 * MIN);
    await runMessages(deps(), f.S);
    expect(outbox.filter((m) => m.to === e164(PHONE.a))).toHaveLength(2);
    expect(await logs(a.id)).toHaveLength(2);
  });

  it('his order (from any browser) finishes the checkout and counts the follow-ups as bringing it back', async () => {
    const a = await db().checkoutDraft.findFirstOrThrow({ where: { storeId: f.S, phone: e164(PHONE.a) } });
    const placed = await f.place('fu-a-order', { phone: PHONE.a });
    expect((await draft(a.id)).convertedOrderId).toBe(placed.orderId);
    const rms = await db().recoveryMessage.findMany({ where: { storeId: f.S, checkoutDraftId: a.id } });
    expect(rms.map((r) => r.recoveredOrderId)).toEqual([placed.orderId, placed.orderId]);
  });

  it('never: one who ordered since, one the team marked handled, a number followed up in the gap days', async () => {
    f.overrides.set('orders.followUp', ON);
    const t0 = T + 20 * 24 * 60 * MIN;
    at(t0);
    const b = await leave('fu-b', PHONE.b, { sms: true, whatsapp: true });
    const c = await leave('fu-c', PHONE.c, { sms: true, whatsapp: true });
    await f.place('fu-b-order', { phone: PHONE.b });
    await db().checkoutDraft.update({ where: { id: c.id }, data: { handledAt: new Date(t0) } });
    const again = await leave('fu-a-again', PHONE.a, { sms: true, whatsapp: true });
    at(t0 + 70 * MIN);
    await runMessages(deps(), f.S);
    expect((await draft(b.id)).followUpCount).toBe(0);
    expect((await draft(c.id)).followUpCount).toBe(0);
    // the number had its ladder 20 days ago (outside the 7 gap days): this one goes, by WhatsApp first
    expect((await draft(again.id)).followUpCount).toBe(1);
    const last = outbox.at(-1)!;
    expect(last).toMatchObject({ channel: 'WHATSAPP', to: e164(PHONE.a) });
    // a new visit the same day: inside the gap days, no new ladder
    at(t0 + 2 * 60 * MIN);
    const third = await leave('fu-a-third', PHONE.a, { sms: true, whatsapp: true });
    at(t0 + 4 * 60 * MIN);
    await runMessages(deps(), f.S);
    expect((await draft(third.id)).followUpCount).toBe(0);
  });
});
