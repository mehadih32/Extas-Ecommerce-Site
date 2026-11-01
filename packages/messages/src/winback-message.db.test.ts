// S14 · PR 300 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): a win-back campaign's message (queued by @extas/customers' winback.ts, step `crmCampaign`)
// goes through the engine as an offer — never without the customer's yes for offers on the channel; a paused campaign
// waits, a cancelled one or win-back switched off skips it; at most the weekly cap of offers by phone (journey and
// campaign messages together), never a second win-back within the gap; the campaign's own stop line; the campaign's
// sent count follows. The sender is a stand-in: nothing is ever sent to a real number. Every value is a made-up value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { CRM_CAMPAIGN_STEP, CRM_MESSAGE_STEP, type MessageChannel } from '@extas/settings';
import { runMessages, type MessagesDeps, type OutgoingMessage } from './index';

// hardcode-ok: made-up test numbers
const A = '+8801700003001';
const B = '+8801700003002';
const ON = { enabled: true, perCustomerPerWeek: 2, gapDays: 30, batchSize: 200, resultDays: 14, defaultLapsedDays: 90, stopLine: { bn: 'বন্ধ করতে STOP', en: 'Reply STOP for no offers' } };

describe.skipIf(!HAS_TEST_DB)('PR 300 · a win-back campaign message through the engine (PostgreSQL)', () => {
  let f: OrdersFixture;
  let tpl = '';
  let a = '';
  let b = '';
  let camp = '';
  let n = 0;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel })[] = [];
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({ provider: 'test', mode: 'MOCK', send: async (m) => (outbox.push({ channel, ...m }), { ok: true, messageId: randomUUID() }) });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const run = async () => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000);
    return runMessages(deps(), f.S);
  };
  const queue = (customerId: string, to: string, broadcastId = camp, step = CRM_CAMPAIGN_STEP) =>
    db().notificationLog.create({ data: { storeId: f.S, customerId, broadcastId: step === CRM_CAMPAIGN_STEP ? broadcastId : null, channel: 'SMS', recipient: to, status: 'QUEUED', dedupeKey: `wb300:${++n}`, step, templateId: tpl, sendAfter: new Date(Date.now() - 60_000) } });
  const row = (id: string) => db().notificationLog.findUniqueOrThrow({ where: { id } });
  const status = (s: string) => db().broadcast.update({ where: { id: camp }, data: { status: s } });

  beforeAll(async () => {
    f = await setUpOrders('winback-message');
    a = (await db().customer.create({ data: { storeId: f.S, phone: A, name: 'Karim' } })).id;
    b = (await db().customer.create({ data: { storeId: f.S, phone: B, name: 'Rahim' } })).id;
    tpl = (await db().notificationTemplate.create({ data: { storeId: f.S, key: 'crm.wb300', name: 'We miss you', channel: 'SMS', locale: 'en', body: 'Hi {customerName}, we miss you at {storeName}' } })).id;
    camp = (await db().broadcast.create({ data: { storeId: f.S, kind: 'winback', name: 'Back in autumn', channel: 'SMS', status: 'SENDING', templateId: tpl, rule: { lapsedDays: 90, maxLapsedDays: null, minDelivered: 1 } } })).id;
    for (const [id, phone] of [[a, A], [b, B]] as const) await db().consentRecord.create({ data: { storeId: f.S, customerId: id, phone, channel: 'SMS', granted: true, scope: 'MARKETING', source: 'checkout' } });
    f.overrides.set('messages.language', 'en');
    f.overrides.set('customers.journeys', { enabled: true, maxJourneys: 20, maxSteps: 10, perCustomerPerWeek: 5, catchUpDays: 7, batchSize: 500, stopLine: { bn: '', en: 'journey stop line' } });
  });
  afterAll(async () => f?.t.drop());

  it('switched off: skipped WINBACK_OFF; nothing leaves', async () => {
    const r = await queue(a, A);
    await run();
    expect(await row(r.id)).toMatchObject({ status: 'SKIPPED', reason: 'WINBACK_OFF' });
    expect(outbox).toHaveLength(0);
  });

  it('paused: waits; resumed: sent once with the campaign stop line, the campaign counts it; a second win-back in the gap is blocked', async () => {
    f.overrides.set('customers.winback', ON);
    await status('PAUSED');
    const r = await queue(a, A);
    await run();
    expect(await row(r.id)).toMatchObject({ status: 'QUEUED', reason: 'PAUSED' });
    await status('SENDING');
    await db().notificationLog.update({ where: { id: r.id }, data: { sendAfter: new Date(Date.now() - 60_000) } });
    await run();
    expect(await row(r.id)).toMatchObject({ status: 'SENT', provider: 'test', mode: 'MOCK' });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toContain('Hi Karim, we miss you');
    expect(outbox[0]!.text).toContain('Reply STOP for no offers');
    expect(outbox[0]!.text).not.toContain('journey stop line');
    expect(await db().broadcast.findUniqueOrThrow({ where: { id: camp }, select: { sentCount: true } })).toEqual({ sentCount: 1 });
    const again = await queue(a, A);
    await run();
    expect(await row(again.id)).toMatchObject({ status: 'BLOCKED_BY_GUARD', reason: 'CAP_GAP' });
    expect(outbox).toHaveLength(1);
  });

  it('the weekly cap counts journey and campaign offers together; no yes: NO_CONSENT; cancelled: skipped', async () => {
    f.overrides.set('customers.winback', { ...ON, perCustomerPerWeek: 1 });
    const j = await queue(b, B, camp, CRM_MESSAGE_STEP);
    await run();
    expect(await row(j.id)).toMatchObject({ status: 'SENT' });
    const w = await queue(b, B);
    await run();
    expect(await row(w.id)).toMatchObject({ status: 'BLOCKED_BY_GUARD', reason: 'CAP_WEEK' });
    const c = (await db().customer.create({ data: { storeId: f.S, phone: '+8801700003003', name: 'No yes' } })).id;
    const nc = await queue(c, '+8801700003003');
    await run();
    expect(await row(nc.id)).toMatchObject({ status: 'SKIPPED', reason: 'NO_CONSENT' });
    await status('CANCELLED');
    const x = await queue(c, '+8801700003003');
    await run();
    expect(await row(x.id)).toMatchObject({ status: 'SKIPPED', reason: 'CANCELLED' });
  });
});
