// PR 148 on a real PostgreSQL (a throwaway database with the real migrations and the sample store with the default
// pack's templates; orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL). The order
// journey end to end: the timeline becomes messages, never twice; the caps; the amount always the amount still due
// (SIM-F-001); the self-confirm counts as the one WhatsApp (SIM-F-011), its replies go to the call queue and never
// change the order; the no-reply timer; the fallback channel; quiet hours; the master switch; the mock senders; the
// journey screen's save with its version. PR 149: every try logged (append-only), the retries on their waits, the
// log with its counts, a retry by hand. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createConnections, messageAdapters, mockWhatsAppOutbox } from '@extas/adapters';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder, holdOrder, orderStep, systemBy } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_JOURNEY, type Journey, type MessageChannel } from '@extas/settings';
import {
  journeyScreen,
  messageDetail,
  messageLog,
  planMessages,
  recipientOf,
  recordSelfConfirmReply,
  retryMessage,
  runMessages,
  saveJourney,
  selfConfirmTimers,
  sendDue,
  sendersFrom,
  zoned,
  type MessagesDeps,
  type Who,
} from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 148, 149 · the order journey and its log on PostgreSQL', () => {
  let f: OrdersFixture;
  let staff: Who;
  let reader: Who;
  const db = () => f.t.prisma;
  const outbox: { channel: MessageChannel; to: string; text: string; subject: string | null; purpose: string }[] = [];
  const unreachable = new Set<MessageChannel>();
  /** PR 149: channels whose sender fails (a provider error, worth another try). */
  const failing = new Set<MessageChannel>();
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({
    provider: 'test',
    mode: 'MOCK',
    send: async (m) => {
      if (unreachable.has(channel)) return { ok: false, error: 'not on this channel', unreachable: true };
      if (failing.has(channel)) return { ok: false, error: 'gateway timeout' };
      outbox.push({ channel, ...m });
      return { ok: true, messageId: randomUUID() };
    },
  });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  /** The clock never behind the database's own clock (the timeline rows are stamped by PostgreSQL). */
  const tick = (ms = 1_000) => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + ms);
  };
  const run = async () => {
    tick();
    return runMessages(deps(), f.S);
  };
  const logOf = (orderId: string) => db().notificationLog.findMany({ where: { orderId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const journey = (patch: Partial<Journey>) => f.overrides.set('messages.journey', { ...DEFAULT_JOURNEY, ...patch });
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  /** The messages of one order (the tests' orders share one phone number). */
  const mine = (o: { number: string }) => outbox.filter((m) => new RegExp(`${o.number}(?!\\d)`).test(m.text));

  beforeAll(async () => {
    f = await setUpOrders('messages');
    const p = db();
    const role = await createRole(p, SYSTEM, { key: 'test-messages', nameEn: 'messages', nameBn: 'messages', permissions: ['messages.journey.read', 'messages.journey.write', 'messages.selfConfirm.reply', 'messages.log.view', 'messages.log.retry'] });
    const readRole = await createRole(p, SYSTEM, { key: 'test-messages-read', nameEn: 'reader', nameBn: 'reader', permissions: ['messages.journey.read'] });
    const u = await p.staffUser.create({ data: { email: 'messages@example.com', displayName: 'Messages Staff', passwordHash: 'not-a-login' } });
    const r = await p.staffUser.create({ data: { email: 'messages-reader@example.com', displayName: 'Reader', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    await p.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: readRole.id, storeId: f.S } });
    staff = { actor: { staffUserId: u.id }, storeId: f.S };
    reader = { actor: { staffUserId: r.id }, storeId: f.S };
    f.overrides.set('system.stagingHost', 'shop.example');
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(async () => {
    f.clock.now = new Date();
    outbox.length = 0;
    unreachable.clear();
    failing.clear();
    f.overrides.delete('messages.journey');
    f.overrides.delete('messages.caps');
    f.overrides.delete('messages.quietHours');
    f.overrides.delete('messages.enabled');
    f.overrides.delete('messages.selfConfirm');
    f.overrides.delete('account.track.exactAmount');
    // earlier tests' rows are sent or closed: each test sees only its own orders' messages
    await run();
    outbox.length = 0;
  });

  it('the default journey: an SMS when placed (the amount due), an SMS when confirmed, one WhatsApp when packed — never twice', async () => {
    const o = await f.place('journey');
    await run();
    expect(mine(o)).toHaveLength(1);
    expect(mine(o)[0]).toMatchObject({ channel: 'SMS', to: '+8801700000138', purpose: 'order.placed' });
    const due = (await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).codAmountMinor;
    expect(due).toBeGreaterThan(0);
    expect(mine(o)[0]!.text).toContain(`৳${(due / 100).toLocaleString('en')}`);
    expect(mine(o)[0]!.text).toContain(o.number);

    // planned again and run again: nothing new (the no-double-send guard)
    await run();
    await run();
    expect(mine(o)).toHaveLength(1);
    expect(await db().notificationLog.count({ where: { orderId: o.orderId, step: 'placed' } })).toBe(1);

    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await run();
    expect(mine(o).map((m) => [m.channel, m.purpose])).toEqual([
      ['SMS', 'order.placed'],
      ['SMS', 'order.confirmed'],
    ]);
    expect(mine(o)[1]!.text).toContain(`https://shop.example/account/orders/${o.number}`);

    await orderStep(f.ordersDeps(), ref(o.orderId), systemBy('test'), 'startPicking');
    await run();
    await orderStep(f.ordersDeps(), ref(o.orderId), systemBy('test'), 'pack');
    await run();
    expect(mine(o).map((m) => [m.channel, m.purpose])).toEqual([
      ['SMS', 'order.placed'],
      ['SMS', 'order.confirmed'],
      ['WHATSAPP', 'order.packed'],
    ]);
    const rows = await logOf(o.orderId);
    expect(rows.map((r) => [r.step, r.channel, r.status, r.mode])).toEqual([
      ['placed', 'SMS', 'SENT', 'MOCK'],
      ['confirmed', 'SMS', 'SENT', 'MOCK'],
      ['packed', 'WHATSAPP', 'SENT', 'MOCK'],
    ]);
    // no message text is kept: the row says which template, language and sender
    expect(rows[0]).toMatchObject({ provider: 'test', locale: 'bn', attempts: 1, reason: null });
    expect(rows[0]!.templateId).not.toBeNull();
  });

  it('SIM-F-001: a fully paid order is never asked for money', async () => {
    const o = await f.place('prepaid', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await run();
    expect(mine(o)).toHaveLength(1);
    expect(mine(o)[0]!.text).not.toMatch(/৳/);
  });

  it('the caps: a journey message over the channel cap is blocked and says why; Day-1 care sits outside the caps', async () => {
    f.overrides.set('messages.caps', { SMS: 1, WHATSAPP: 1, EMAIL: null, total: null });
    const o = await f.place('caps');
    await run();
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await run();
    const rows = await logOf(o.orderId);
    expect(rows.map((r) => [r.step, r.status, r.reason])).toEqual([
      ['placed', 'SENT', null],
      ['confirmed', 'BLOCKED_BY_GUARD', 'CAP_SMS'],
    ]);

    // delivered (S08 books and delivers; here the order and its timeline row are written as the courier hook would)
    await db().order.update({ where: { id: o.orderId }, data: { status: 'DELIVERED' } });
    await db().orderEvent.create({ data: { storeId: f.S, orderId: o.orderId, type: 'order.delivered', fromStatus: 'CONFIRMED', toStatus: 'DELIVERED', actorType: 'SYSTEM', source: 'test' } });
    await run();
    const care = await db().notificationLog.findFirstOrThrow({ where: { orderId: o.orderId, step: 'day1Care' } });
    expect(care.status).toBe('QUEUED');
    const at = zoned(care.sendAfter!, 'Asia/Dhaka');
    expect([at.h, at.mi]).toEqual([11, 0]);
    f.clock.now = new Date(care.sendAfter!.getTime() + 60_000);
    await sendDue(deps(), f.S);
    expect(await db().notificationLog.findFirstOrThrow({ where: { id: care.id } })).toMatchObject({ status: 'SENT', channel: 'WHATSAPP' });
    expect(mine(o).at(-1)).toMatchObject({ channel: 'WHATSAPP', purpose: 'order.care' });
  });

  it('a step older than the look-back is never sent late', async () => {
    const o = await f.place('late');
    f.clock.now = new Date(Date.now() + 4 * 3_600_000);
    expect((await planMessages(deps(), f.S)).planned).toBe(0);
    expect(await logOf(o.orderId)).toHaveLength(0);
  });

  it('SIM-F-011 + CN-014 idea 5: the self-confirm is the one WhatsApp; 2 and 3 never change the order, they go to the call queue', async () => {
    journey({ selfConfirm: { ...DEFAULT_JOURNEY.selfConfirm, on: true } });
    const o = await f.place('self-confirm');
    await run();
    expect(mine(o).map((m) => [m.channel, m.purpose])).toEqual([
      ['SMS', 'order.placed'],
      ['WHATSAPP', 'order.selfConfirm'],
    ]);
    expect(mine(o)[1]!.text).toMatch(/1.*2.*3/);

    // the reader may not record a reply
    expect(await code(recordSelfConfirmReply(deps(), reader, { orderNumber: o.number, answer: 3 }))).toBe('FORBIDDEN');
    const r = await recordSelfConfirmReply(deps(), staff, { orderNumber: o.number, answer: 3 });
    expect(r).toMatchObject({ answer: 3, code: 'CANCEL', answerQueued: true, repeated: false });
    expect(await db().callTask.findUniqueOrThrow({ where: { id: r.callTaskId! } })).toMatchObject({ reason: 'SELF_CONFIRM_CANCEL', status: 'OPEN', orderId: o.orderId });
    expect(await recordSelfConfirmReply(deps(), staff, { orderNumber: o.number, answer: 3 })).toMatchObject({ repeated: true, answerQueued: false });
    await run();
    expect(mine(o).at(-1)).toMatchObject({ channel: 'WHATSAPP', purpose: 'order.selfConfirmCancel' });
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('PLACED');
    expect(await db().auditLog.count({ where: { action: 'messages.selfConfirm.reply', entityId: o.orderId } })).toBe(1);

    // confirmed by the shop, then packed: the packed WhatsApp is over the cap (the self-confirm was the one)
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await orderStep(f.ordersDeps(), ref(o.orderId), systemBy('test'), 'startPicking');
    await run();
    expect(await db().notificationLog.findFirstOrThrow({ where: { orderId: o.orderId, step: 'packed' } })).toMatchObject({ status: 'BLOCKED_BY_GUARD', reason: 'CAP_WHATSAPP' });
    // the timer leaves an answered or confirmed order alone
    f.clock.now = new Date(f.clock.now.getTime() + 3 * 3_600_000);
    await selfConfirmTimers(deps(), f.S);
    expect(await db().callTask.count({ where: { orderId: o.orderId, reason: 'SELF_CONFIRM_NO_REPLY' } })).toBe(0);
  });

  it('no reply in the wait: one call task, never two; an order with no self-confirm cannot be answered', async () => {
    journey({ selfConfirm: { ...DEFAULT_JOURNEY.selfConfirm, on: true } });
    const o = await f.place('no-reply');
    await run();
    const tasks = () => db().callTask.count({ where: { orderId: o.orderId, reason: 'SELF_CONFIRM_NO_REPLY' } });
    await selfConfirmTimers(deps(), f.S);
    expect(await tasks()).toBe(0);
    // the default wait is 3 hours (demo V12.2): not after 2
    f.clock.now = new Date(f.clock.now.getTime() + 2 * 3_600_000 + 60_000);
    await selfConfirmTimers(deps(), f.S);
    expect(await tasks()).toBe(0);
    f.clock.now = new Date(f.clock.now.getTime() + 3_600_000);
    expect((await selfConfirmTimers(deps(), f.S)).noReply).toBeGreaterThanOrEqual(1);
    expect(await tasks()).toBe(1);
    expect(await selfConfirmTimers(deps(), f.S)).toEqual({ noReply: 0 });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'message.selfConfirm.noReply' } })).toBe(1);

    f.overrides.delete('messages.journey');
    const plain = await f.place('no-self-confirm');
    await run();
    expect(await code(recordSelfConfirmReply(deps(), staff, { orderNumber: plain.number, answer: 1 }))).toBe('NOT_FOUND');
  });

  it('his "1" confirms the order through the order service, with its guards; switched off, it is only noted', async () => {
    journey({ selfConfirm: { ...DEFAULT_JOURNEY.selfConfirm, on: true } });
    const status = async (o: { orderId: string }) => (await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status;
    const yes = await f.place('self-yes');
    const held = await f.place('self-held');
    const noted = await f.place('self-noted');
    await run();

    const r = await recordSelfConfirmReply(deps(), staff, { orderNumber: yes.number, answer: 1 });
    expect(r).toMatchObject({ code: 'YES', callTaskId: null, answerQueued: true, confirmed: true, notConfirmed: null });
    expect(await status(yes)).toBe('CONFIRMED');
    // the confirm is the order service's own: its timeline row, by the staff member who recorded the answer
    expect(await db().orderEvent.findFirstOrThrow({ where: { orderId: yes.orderId, type: 'order.confirm' } })).toMatchObject({ actorId: staff.actor.staffUserId });
    expect(await recordSelfConfirmReply(deps(), staff, { orderNumber: yes.number, answer: 1 })).toMatchObject({ repeated: true, confirmed: false });
    await run();
    // "we have your yes" on WhatsApp and the journey's "confirmed" SMS, once each
    expect(mine(yes).map((m) => `${m.channel} ${m.purpose}`).sort()).toEqual(['SMS order.confirmed', 'SMS order.placed', 'WHATSAPP order.selfConfirm', 'WHATSAPP order.selfConfirmed']);

    // an order the team put on hold is not confirmed by a reply: the refusal is returned, the order stays as it was
    await holdOrder(f.ordersDeps(), f.staff, held.orderId, { reasonKey: 'customer-wait' });
    const h = await recordSelfConfirmReply(deps(), staff, { orderNumber: held.number, answer: 1 });
    expect(h).toMatchObject({ confirmed: false, answerQueued: true });
    expect(h.notConfirmed).toEqual(expect.any(String));
    expect(await status(held)).toBe('ON_HOLD');
    expect(await db().auditLog.findFirstOrThrow({ where: { action: 'messages.selfConfirm.reply', entityId: held.orderId } })).toMatchObject({ after: { confirmed: false, notConfirmed: h.notConfirmed } });

    // switched off: the "1" is noted and answered, the team confirms
    f.overrides.set('messages.selfConfirm', { newCustomersOnly: false, waitHours: 3, confirmOnYes: false, countsAsTheOneWhatsApp: true });
    expect(await recordSelfConfirmReply(deps(), staff, { orderNumber: noted.number, answer: 1 })).toMatchObject({ confirmed: false, notConfirmed: null, answerQueued: true });
    expect(await status(noted)).toBe('PLACED');
  });

  it('a customer not on WhatsApp gets the step by its fallback channel', async () => {
    journey({ selfConfirm: { ...DEFAULT_JOURNEY.selfConfirm, on: true } });
    unreachable.add('WHATSAPP');
    const o = await f.place('fallback');
    await run();
    await run();
    const rows = await logOf(o.orderId);
    expect(rows.map((r) => [r.step, r.channel, r.status, r.reason])).toEqual([
      ['placed', 'SMS', 'SENT', null],
      ['selfConfirm', 'WHATSAPP', 'FAILED', 'UNREACHABLE'],
      ['selfConfirm', 'SMS', 'SENT', null],
    ]);
    expect(mine(o).at(-1)).toMatchObject({ channel: 'SMS', purpose: 'order.selfConfirm' });
  });

  it('quiet hours hold a journey step until they end; the order-placed message still goes', async () => {
    const o = await f.place('quiet');
    tick();
    const h = zoned(f.clock.now, 'Asia/Dhaka').h;
    f.overrides.set('messages.quietHours', { on: true, fromHour: h, toHour: (h + 2) % 24 });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await run();
    const rows = await logOf(o.orderId);
    expect(rows.map((r) => [r.step, r.status, r.reason])).toEqual([
      ['placed', 'SENT', null],
      ['confirmed', 'QUEUED', 'QUIET_HOURS'],
    ]);
    const until = zoned(rows[1]!.sendAfter!, 'Asia/Dhaka');
    expect([until.h, until.mi]).toEqual([(h + 2) % 24, 0]);
  });

  it('the master switch: off, nothing is planned or sent; a queued row is skipped with the reason', async () => {
    f.overrides.set('messages.enabled', false);
    const o = await f.place('master-off');
    expect(await run()).toBeNull();
    expect(await logOf(o.orderId)).toHaveLength(0);
    await planMessages(deps(), f.S);
    tick();
    await sendDue(deps(), f.S);
    expect((await logOf(o.orderId)).map((r) => [r.status, r.reason])).toEqual([['SKIPPED', 'MASTER_OFF']]);
    expect(mine(o)).toHaveLength(0);
  });

  it('a gift: the sender who paid hears the updates, never the receiver', () => {
    const gift = { phone: '+8801700000148', email: null, isGift: true, giftSenderContact: '+447700900123' };
    expect(recipientOf(gift, 'placed', 'SMS')).toBe('+447700900123');
    expect(recipientOf(gift, 'placed', 'EMAIL')).toBeNull();
    expect(recipientOf(gift, 'giftReceiver', 'SMS')).toBe('+8801700000148');
    expect(recipientOf({ ...gift, giftSenderContact: 'sender@example.com' }, 'placed', 'EMAIL')).toBe('sender@example.com');
    expect(recipientOf({ ...gift, isGift: false, phone: '01700000148' }, 'placed', 'SMS')).toBe('+8801700000148');
  });

  it('the real senders are the mocks until a key is entered: nothing leaves the server', async () => {
    const connections = createConnections({ db: db(), vault: { get: async () => null }, adapters: messageAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    const real: MessagesDeps = { ...deps(), sender: sendersFrom(connections) };
    journey({ placed: { ...DEFAULT_JOURNEY.placed, channel: 'WHATSAPP' } });
    mockWhatsAppOutbox.clear();
    const o = await f.place('mock');
    tick();
    await planMessages(real, f.S);
    const r = await sendDue(real, f.S);
    expect(r).toMatchObject({ sent: 1, mock: true });
    expect(mockWhatsAppOutbox.all().filter((m) => m.text.includes(o.number))).toHaveLength(1);
    expect((await logOf(o.orderId))[0]).toMatchObject({ provider: 'mockWhatsApp', mode: 'MOCK', status: 'SENT' });
  });

  it('the journey screen: read with a version; a save checks every part first, refuses a stale version, and is audited', async () => {
    const writer = {
      ...f.deps().settings,
      async set(key: string, value: unknown) {
        f.overrides.set(key, value);
        return null;
      },
    };
    const d = { ...deps(), settings: writer } as Parameters<typeof saveJourney>[0];
    expect(await code(journeyScreen(deps(), { ...reader, actor: { staffUserId: randomUUID() } }))).toBe('FORBIDDEN');
    const s = await journeyScreen(deps(), reader);
    expect(s.perms).toEqual({ write: false, reply: false });
    expect(s.config.journey.placed).toMatchObject({ on: true, channel: 'SMS' });
    expect(s.templates['order.placed']).toMatchObject({ SMS: ['bn', 'en'], WHATSAPP: ['bn', 'en'], EMAIL: ['bn', 'en'] });
    expect(s.channels.map((c) => c.mode)).toEqual(['MOCK', 'MOCK', 'MOCK']);

    expect(await code(saveJourney(d, reader, { caps: { SMS: 3, WHATSAPP: 1, EMAIL: null, total: null } }, s.version))).toBe('FORBIDDEN');
    expect(await code(saveJourney(d, staff, { caps: { SMS: -1, WHATSAPP: 1, EMAIL: null, total: null }, quietHours: { on: true, fromHour: 22, toHour: 8 } }, s.version))).toBe('INVALID_INPUT');
    expect(f.overrides.has('messages.quietHours')).toBe(false);
    const saved = await saveJourney(d, staff, { caps: { SMS: 3, WHATSAPP: 1, EMAIL: null, total: null } }, s.version);
    expect(saved.config.caps.SMS).toBe(3);
    expect(saved.version).not.toBe(s.version);
    expect(await code(saveJourney(d, staff, { caps: { SMS: 2, WHATSAPP: 1, EMAIL: null, total: null } }, s.version))).toBe('STALE');
    expect(await db().auditLog.count({ where: { action: 'messages.journey.save' } })).toBe(1);
  });

  it('PR 149: a failed send is tried again on the waits, every try logged; after the last it is FAILED and shows in the log', async () => {
    failing.add('SMS');
    const o = await f.place('retry');
    await run();
    let row = await db().notificationLog.findFirstOrThrow({ where: { orderId: o.orderId, step: 'placed' } });
    expect(row).toMatchObject({ status: 'QUEUED', reason: 'RETRY', attempts: 1, error: 'gateway timeout' });
    expect(row.sendAfter!.getTime() - f.clock.now.getTime()).toBe(5 * 60_000);
    // not before its wait
    await run();
    expect((await db().notificationLog.findUniqueOrThrow({ where: { id: row.id } })).attempts).toBe(1);
    f.clock.now = new Date(row.sendAfter!.getTime() + 1_000);
    await sendDue(deps(), f.S);
    row = await db().notificationLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(row).toMatchObject({ status: 'QUEUED', attempts: 2 });
    expect(row.sendAfter!.getTime() - f.clock.now.getTime()).toBe(30 * 60_000);
    f.clock.now = new Date(row.sendAfter!.getTime() + 1_000);
    await sendDue(deps(), f.S);
    row = await db().notificationLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(row).toMatchObject({ status: 'FAILED', reason: 'SEND_FAILED', attempts: 3, sendAfter: null });
    const tries = await db().notificationAttempt.findMany({ where: { notificationLogId: row.id }, orderBy: { attempt: 'asc' } });
    expect(tries.map((t) => [t.attempt, t.ok, t.provider, t.mode, t.error])).toEqual([
      [1, false, 'test', 'MOCK', 'gateway timeout'],
      [2, false, 'test', 'MOCK', 'gateway timeout'],
      [3, false, 'test', 'MOCK', 'gateway timeout'],
    ]);
    // the tries are history: never changed, never removed (locked at the database)
    expect(await code(db().notificationAttempt.update({ where: { id: tries[0]!.id }, data: { ok: true } }))).not.toBe('ok');
    expect(await code(db().notificationAttempt.delete({ where: { id: tries[0]!.id } }))).not.toBe('ok');

    // the log: the failure is there for staff, with its tries; the reader of the journey may not see it
    expect(await code(messageLog(deps(), reader))).toBe('FORBIDDEN');
    const log = await messageLog(deps(), staff, { status: 'FAILED', orderNumber: o.number });
    expect(log.rows.map((x) => [x.order?.number, x.step, x.channel, x.status, x.attempts])).toEqual([[o.number, 'placed', 'SMS', 'FAILED', 3]]);
    expect(log.counts.FAILED).toBeGreaterThanOrEqual(1);
    expect((await messageLog(deps(), staff, { orderNumber: 'NO-SUCH' })).rows).toEqual([]);
    expect(await code(messageLog(deps(), staff, { status: 'LOST' }))).toBe('INVALID_INPUT');
    expect((await messageDetail(deps(), staff, row.id)).tries).toHaveLength(3);

    // retried by hand once the gateway is back: one more try, sent, with who asked; audited; not again
    failing.clear();
    expect(await code(retryMessage(deps(), reader, row.id))).toBe('FORBIDDEN');
    const r = await retryMessage(deps(), staff, row.id);
    expect(r.outcome).toBe('SENT');
    expect(r.message).toMatchObject({ status: 'SENT', attempts: 4 });
    expect(r.message.tries.at(-1)).toMatchObject({ attempt: 4, ok: true, retriedById: staff.actor.staffUserId });
    expect(mine(o).map((m) => m.purpose)).toEqual(['order.placed']);
    expect(await db().auditLog.count({ where: { action: 'messages.log.retry', entityId: row.id } })).toBe(1);
    expect(await code(retryMessage(deps(), staff, row.id))).toBe('NOT_RETRYABLE');
  });

  it('PR 149: a number the channel cannot reach is not retried; a step that went by its fallback is never retried by hand', async () => {
    journey({ selfConfirm: { ...DEFAULT_JOURNEY.selfConfirm, on: true } });
    unreachable.add('WHATSAPP');
    const o = await f.place('no-retry');
    await run();
    await run();
    const wa = await db().notificationLog.findFirstOrThrow({ where: { orderId: o.orderId, step: 'selfConfirm', channel: 'WHATSAPP' } });
    expect(wa).toMatchObject({ status: 'FAILED', reason: 'UNREACHABLE', attempts: 1 });
    expect(await db().notificationLog.findFirstOrThrow({ where: { orderId: o.orderId, step: 'selfConfirm', channel: 'SMS' } })).toMatchObject({ status: 'SENT' });
    unreachable.clear();
    expect(await code(retryMessage(deps(), staff, wa.id))).toBe('NOT_RETRYABLE');
    expect(mine(o).filter((m) => m.purpose === 'order.selfConfirm')).toHaveLength(1);
  });
});
