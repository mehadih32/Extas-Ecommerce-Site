// S14 · PR 290 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): an e-mail send's e-mail (queued by @extas/customers, step `crmEmail`) through the engine —
// never without the customer's yes for offer e-mails, held while its send is paused, left out when it is cancelled, at
// most the weekly cap; its words are the send's own with the unsubscribe line and the one-click header; the open, a
// click (only to the template's own link) and the unsubscribe (his "no" as a consent record, then nothing more). The
// sender is a stand-in: nothing is ever sent. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { CRM_EMAIL_STEP } from '@extas/settings';
import { consentBlock, emailClicked, emailOpened, emailUnsubscribe, emailUnsubscribeState, runMessages, type MessagesDeps, type OutgoingMessage } from './index';

// hardcode-ok: made-up test numbers, addresses and hosts
const A = '+8801700002901';
const HOST = 'shop.example.com';
const ON = { enabled: true, perCustomerPerWeek: 1, batchSize: 500, trackOpens: true, trackClicks: true, resultDays: 7, maxTemplates: 50, unsubscribeLine: { bn: 'বন্ধ করুন', en: 'Unsubscribe' } };

describe.skipIf(!HAS_TEST_DB)('PR 290 · an e-mail send through the engine (PostgreSQL)', () => {
  let f: OrdersFixture;
  let a = '';
  let send = '';
  const db = () => f.t.prisma;
  const outbox: OutgoingMessage[] = [];
  const sender: MessagesDeps['sender'] = async () => ({ provider: 'test', mode: 'MOCK', send: async (m) => (outbox.push(m), { ok: true, messageId: randomUUID() }) });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const run = async () => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000);
    return runMessages(deps(), f.S);
  };
  let n = 0;
  const queue = () => db().notificationLog.create({ data: { storeId: f.S, customerId: a, broadcastId: send, channel: 'EMAIL', recipient: 'karim@example.com', status: 'QUEUED', dedupeKey: `email:t290:${++n}`, step: CRM_EMAIL_STEP, locale: 'en', sendAfter: new Date(Date.now() - 60_000) } });
  const row = (id: string) => db().notificationLog.findUniqueOrThrow({ where: { id } });
  const status = (s: string) => db().broadcast.update({ where: { id: send }, data: { status: s } });

  beforeAll(async () => {
    f = await setUpOrders('email-send');
    a = (await db().customer.create({ data: { storeId: f.S, phone: A, name: 'Karim', email: 'karim@example.com' } })).id;
    send = (await db().broadcast.create({ data: { storeId: f.S, name: 'Winter', channel: 'EMAIL', status: 'SENDING', subject: 'Hi {customerName}', body: 'New polos at {link}\n\nSize guide: https://example.com/size', locale: 'en' } })).id;
    f.overrides.set('system.stagingHost', HOST);
    f.overrides.set('customers.email', ON);
  });
  afterAll(async () => f?.t.drop());

  it('no yes: NO_CONSENT; paused: waits; with his yes: sent with the unsubscribe line, HTML and headers; then the cap', async () => {
    const r1 = await queue();
    await run();
    expect(await row(r1.id)).toMatchObject({ status: 'SKIPPED', reason: 'NO_CONSENT' });
    await db().consentRecord.create({ data: { storeId: f.S, customerId: a, phone: A, channel: 'EMAIL', granted: true, scope: 'MARKETING', source: 'staff' } });
    await status('PAUSED');
    const r2 = await queue();
    await run();
    expect(await row(r2.id)).toMatchObject({ status: 'QUEUED', reason: 'PAUSED' });
    await status('SENDING');
    await db().notificationLog.update({ where: { id: r2.id }, data: { sendAfter: new Date(Date.now() - 60_000) } });
    await run();
    expect(await row(r2.id)).toMatchObject({ reason: null, status: 'SENT', provider: 'test', attempts: 1 });
    expect(outbox).toHaveLength(1);
    const m = outbox[0]!;
    expect(m.subject).toBe('Hi Karim');
    expect(m.text).toContain(`New polos at https://${HOST}/`);
    expect(m.text).toContain(`Unsubscribe: https://${HOST}/email/unsubscribe/${r2.id}`);
    expect(m.html).toContain(`href="https://${HOST}/api/email/click/${r2.id}/0"`);
    expect(m.html).toContain(`href="https://${HOST}/api/email/click/${r2.id}/1"`);
    expect(m.html).toContain(`src="https://${HOST}/api/email/open/${r2.id}"`);
    expect(m.headers).toMatchObject({ 'List-Unsubscribe': `<https://${HOST}/api/email/unsubscribe/${r2.id}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect((await db().broadcast.findUniqueOrThrow({ where: { id: send } })).sentCount).toBe(1);
    const r3 = await queue();
    await run();
    expect(await row(r3.id)).toMatchObject({ status: 'BLOCKED_BY_GUARD', reason: 'CAP_WEEK' });
    expect(outbox).toHaveLength(1);

    // the reader: an open, a click on the template's second link (only its own links), then the unsubscribe
    await emailOpened(db(), r2.id, f.clock.now);
    expect((await row(r2.id)).openedAt).not.toBeNull();
    expect(await emailClicked(deps(), r2.id, 1, f.clock.now)).toBe('https://example.com/size');
    expect(await emailClicked(deps(), r2.id, 7, f.clock.now)).toBeNull();
    expect(await emailClicked(deps(), r1.id, 0, f.clock.now)).toBeNull();
    // with no shop address now, the numbers stay: link 1 is still the size guide, link 0 (the home) goes nowhere
    f.overrides.set('system.stagingHost', null);
    expect(await emailClicked(deps(), r2.id, 1, f.clock.now)).toBe('https://example.com/size');
    expect(await emailClicked(deps(), r2.id, 0, f.clock.now)).toBeNull();
    f.overrides.set('system.stagingHost', HOST);
    expect(await row(r2.id)).toMatchObject({ clicks: 2 });
    expect(await emailUnsubscribeState(db(), r2.id)).toEqual({ known: true, done: false });
    expect(await emailUnsubscribe(db(), r2.id, f.clock.now)).toBe(true);
    expect(await emailUnsubscribe(db(), r2.id, f.clock.now)).toBe(true);
    expect(await db().consentRecord.count({ where: { customerId: a, channel: 'EMAIL', granted: false, source: 'email.unsubscribe' } })).toBe(1);
    expect(await consentBlock(db(), f.S, { offerSteps: [CRM_EMAIL_STEP] as never }, { channel: 'EMAIL', phone: A, customerId: a, step: CRM_EMAIL_STEP })).toBe('NO_CONSENT');
    expect(await emailUnsubscribe(db(), randomUUID(), f.clock.now)).toBe(false);
  });

  it('a cancelled send, or e-mail marketing off, leaves it out', async () => {
    await status('CANCELLED');
    const r = await queue();
    await run();
    expect(await row(r.id)).toMatchObject({ status: 'SKIPPED', reason: 'CANCELLED' });
    await status('SENDING');
    f.overrides.set('customers.email', { ...ON, enabled: false });
    const r2 = await queue();
    await run();
    expect(await row(r2.id)).toMatchObject({ status: 'SKIPPED', reason: 'SWITCHED_OFF' });
  });
});
