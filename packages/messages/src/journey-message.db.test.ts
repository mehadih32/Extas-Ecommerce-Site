// S14 · PR 289 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): a customer journey's message (queued by @extas/customers' automations, step `crmJourney`)
// goes through the engine as an offer — never without the customer's yes for offers on the channel, never after his
// stop, held by the quiet hours, at most the weekly cap per person, with the stop line, logged with its try. The sender
// is a stand-in: nothing is ever sent to a real number. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { CRM_MESSAGE_STEP, type MessageChannel } from '@extas/settings';
import { runMessages, type MessagesDeps, type OutgoingMessage } from './index';

// hardcode-ok: made-up test numbers
const A = '+8801700002891';
const B = '+8801700002892';

describe.skipIf(!HAS_TEST_DB)('PR 289 · a customer journey message through the engine (PostgreSQL)', () => {
  let f: OrdersFixture;
  let tpl = '';
  let a = '';
  let b = '';
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel })[] = [];
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({ provider: 'test', mode: 'MOCK', send: async (m) => (outbox.push({ channel, ...m }), { ok: true, messageId: randomUUID() }) });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const run = async () => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000);
    return runMessages(deps(), f.S);
  };
  const queue = (customerId: string, to: string, key: string) => db().notificationLog.create({ data: { storeId: f.S, customerId, channel: 'SMS', recipient: to, status: 'QUEUED', dedupeKey: key, step: CRM_MESSAGE_STEP, templateId: tpl, sendAfter: new Date(Date.now() - 60_000) } });
  const yes = (customerId: string, phone: string, granted: boolean) => db().consentRecord.create({ data: { storeId: f.S, customerId, phone, channel: 'SMS', granted, scope: 'MARKETING', source: 'checkout' } });

  beforeAll(async () => {
    f = await setUpOrders('journey-message');
    a = (await db().customer.create({ data: { storeId: f.S, phone: A, name: 'Karim' } })).id;
    b = (await db().customer.create({ data: { storeId: f.S, phone: B, name: 'Rahim' } })).id;
    tpl = (await db().notificationTemplate.create({ data: { storeId: f.S, key: 'crm.t289', name: 'Test reminder', channel: 'SMS', locale: 'en', body: 'Hi {customerName}, time for a new polo? {storeName}' } })).id;
    f.overrides.set('messages.language', 'en');
    f.overrides.set('customers.journeys', { enabled: true, maxJourneys: 20, maxSteps: 10, perCustomerPerWeek: 1, catchUpDays: 7, batchSize: 500, stopLine: { bn: 'বন্ধ করতে STOP', en: 'Reply STOP to stop offers' } });
  });
  afterAll(async () => f?.t.drop());

  it('no yes for offers: skipped NO_CONSENT; a stop: skipped; with his yes: sent once with the stop line, then the weekly cap', async () => {
    const r1 = await queue(a, A, 'crm:t289:a1');
    await run();
    expect(await db().notificationLog.findUniqueOrThrow({ where: { id: r1.id } })).toMatchObject({ status: 'SKIPPED', reason: 'NO_CONSENT' });
    expect(outbox).toHaveLength(0);

    await yes(a, A, true);
    const r2 = await queue(a, A, 'crm:t289:a2');
    await run();
    expect(await db().notificationLog.findUniqueOrThrow({ where: { id: r2.id } })).toMatchObject({ status: 'SENT', provider: 'test', mode: 'MOCK', attempts: 1 });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toContain('Hi Karim');
    expect(outbox[0]!.text).toContain('Reply STOP to stop offers');
    expect(await db().notificationAttempt.count({ where: { notificationLogId: r2.id, ok: true } })).toBe(1);

    const r3 = await queue(a, A, 'crm:t289:a3');
    await run();
    expect(await db().notificationLog.findUniqueOrThrow({ where: { id: r3.id } })).toMatchObject({ status: 'BLOCKED_BY_GUARD', reason: 'CAP_WEEK' });
    expect(outbox).toHaveLength(1);
  });

  it('a stop of every message wins over a yes for offers; an erased person gets nothing', async () => {
    await yes(b, B, true);
    await db().consentRecord.create({ data: { storeId: f.S, customerId: b, phone: B, channel: 'SMS', granted: false, scope: 'ALL', source: 'reply' } });
    const r = await queue(b, B, 'crm:t289:b1');
    await run();
    expect(await db().notificationLog.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: 'SKIPPED', reason: 'OPTED_OUT' });
    await db().customer.update({ where: { id: a }, data: { erasedAt: new Date() } });
    f.overrides.set('customers.journeys', { enabled: true, maxJourneys: 20, maxSteps: 10, perCustomerPerWeek: 5, catchUpDays: 7, batchSize: 500, stopLine: { bn: '', en: '' } });
    const r2 = await queue(a, A, 'crm:t289:a4');
    await run();
    expect(await db().notificationLog.findUniqueOrThrow({ where: { id: r2.id } })).toMatchObject({ status: 'SKIPPED', reason: 'NO_RECIPIENT' });
    expect(outbox).toHaveLength(1);
  });

  it('the quiet hours hold it', async () => {
    const c = (await db().customer.create({ data: { storeId: f.S, phone: '+8801700002893', name: 'Quiet' } })).id;
    await yes(c, '+8801700002893', true);
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: 'numeric', hourCycle: 'h23' }).format(new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000));
    f.overrides.set('messages.quietHours', { on: true, fromHour: Number(h), toHour: (Number(h) + 2) % 24 });
    const r = await queue(c, '+8801700002893', 'crm:t289:c1');
    await run();
    expect(await db().notificationLog.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: 'QUEUED', reason: 'QUIET_HOURS' });
    f.overrides.delete('messages.quietHours');
  });
});
