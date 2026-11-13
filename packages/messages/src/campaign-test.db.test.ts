// S28 · PR 697 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the campaign test send. One template, one
// typed address, one message; it goes by the channel's sender and is logged (step campaignTest, no customer); it needs
// `messages.campaigns.write`; a wrong address, another shop's template, a template that needs an order and a WhatsApp
// template the provider has not approved are refused in words; a shop gets at most TEST_SENDS_PER_DAY a day. The sender
// is a stand-in: nothing is ever sent to a real number. Every address is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import type { MessageChannel } from '@extas/settings';
import { CAMPAIGN_TEST_STEP, sendCampaignTest, TEST_SENDS_PER_DAY, type MessagesDeps, type OutgoingMessage, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 697 · campaign test send (PostgreSQL)', () => {
  let f: OrdersFixture;
  let writer: Who;
  let reader: Who;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel; mode: string })[] = [];
  let mode: 'MOCK' | 'LIVE' = 'MOCK';
  const sender: MessagesDeps['sender'] = async (_s, channel) => ({
    provider: 'test',
    mode,
    send: async (m) => {
      outbox.push({ channel, mode, ...m });
      return { ok: true, messageId: randomUUID() };
    },
  });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  const ids: Record<string, string> = {};
  const tpl = (key: string, channel: 'SMS' | 'EMAIL' | 'WHATSAPP', body: string, extra: Record<string, unknown> = {}) =>
    db().notificationTemplate.create({ data: { storeId: f.S, key, channel, locale: 'en', name: key, body, subject: channel === 'EMAIL' ? 'Hello {storeName}' : null, ...extra } }).then((t) => t.id);

  beforeAll(async () => {
    f = await setUpOrders('campaign_test');
    const p = db();
    const w = await createRole(p, SYSTEM, { key: 'test-camp-w', nameEn: 'w', nameBn: 'w', permissions: ['messages.campaigns.write'] });
    const r = await createRole(p, SYSTEM, { key: 'test-camp-r', nameEn: 'r', nameBn: 'r', permissions: ['messages.journey.read'] });
    const uw = await p.staffUser.create({ data: { email: 'camp-w@example.com', displayName: 'Writer', passwordHash: 'not-a-login' } });
    const ur = await p.staffUser.create({ data: { email: 'camp-r@example.com', displayName: 'Reader', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: uw.id, roleId: w.id, storeId: f.S } });
    await p.staffRoleAssignment.create({ data: { staffUserId: ur.id, roleId: r.id, storeId: f.S } });
    writer = { actor: { staffUserId: uw.id }, storeId: f.S };
    reader = { actor: { staffUserId: ur.id }, storeId: f.S };
    ids.sms = await tpl('campaignSample', 'SMS', 'Hi {customerName}, new drop at {storeName}.');
    ids.mail = await tpl('campaignSample', 'EMAIL', 'Hello {customerName}, see {storeName}.');
    ids.wa = await tpl('campaignSample', 'WHATSAPP', 'Hello {customerName}, new drop at {storeName}.');
    ids.needsOrder = await tpl('campaignOrder', 'SMS', 'Pay {amount} at {link}');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('needs the campaigns key; bad input is refused', async () => {
    expect(await code(sendCampaignTest(deps(), reader, { templateId: ids.sms, to: '+8801700000697' }))).toBe('FORBIDDEN');
    expect(await code(sendCampaignTest(deps(), writer, { templateId: 'nope', to: '+8801700000697' }))).toBe('INVALID_INPUT');
    expect(await code(sendCampaignTest(deps(), writer, { templateId: randomUUID(), to: '+8801700000697' }))).toBe('NOT_FOUND');
  });

  it('sends one SMS to the typed number and one e-mail to the typed address, logged, with no customer', async () => {
    const a = await sendCampaignTest(deps(), writer, { templateId: ids.sms, to: '+88 017-0000-0697' });
    expect(a).toMatchObject({ ok: true, channel: 'SMS', mode: 'MOCK' });
    expect(outbox.at(-1)).toMatchObject({ channel: 'SMS', to: '+8801700000697', text: 'Hi Test, new drop at ' + outbox.at(-1)!.text.split('at ')[1] });
    const b = await sendCampaignTest(deps(), writer, { templateId: ids.mail, to: 'me@example.com' });
    expect(b).toMatchObject({ ok: true, channel: 'EMAIL' });
    expect(outbox.at(-1)).toMatchObject({ channel: 'EMAIL', to: 'me@example.com' });
    const logs = await db().notificationLog.findMany({ where: { storeId: f.S, step: CAMPAIGN_TEST_STEP }, orderBy: { createdAt: 'asc' } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.status === 'SENT' && l.customerId === null && l.broadcastId === null)).toBe(true);
  });

  it('refuses in words: a wrong address, a template that needs an order, an unapproved WhatsApp template', async () => {
    expect(await sendCampaignTest(deps(), writer, { templateId: ids.sms, to: 'not a number' })).toEqual({ ok: false, reason: 'BAD_ADDRESS' });
    expect(await sendCampaignTest(deps(), writer, { templateId: ids.mail, to: '+8801700000697' })).toEqual({ ok: false, reason: 'BAD_ADDRESS' });
    expect(await sendCampaignTest(deps(), writer, { templateId: ids.needsOrder, to: '+8801700000697' })).toMatchObject({ ok: false });
    mode = 'LIVE';
    const before = outbox.length;
    expect(await sendCampaignTest(deps(), writer, { templateId: ids.wa, to: '+8801700000697' })).toEqual({ ok: false, reason: 'WA_TEMPLATE_NOT_APPROVED' });
    expect(outbox).toHaveLength(before);
    await db().notificationTemplate.update({ where: { id: ids.wa }, data: { providerStatus: 'APPROVED', providerTemplateId: 'wa_sample' } });
    expect(await sendCampaignTest(deps(), writer, { templateId: ids.wa, to: '+8801700000697' })).toMatchObject({ ok: true, channel: 'WHATSAPP', mode: 'LIVE' });
    expect(outbox.at(-1)?.template).toMatchObject({ name: 'wa_sample' });
    mode = 'MOCK';
  });

  it('a shop makes at most TEST_SENDS_PER_DAY test sends a day', async () => {
    const used = await db().notificationLog.count({ where: { storeId: f.S, step: CAMPAIGN_TEST_STEP } });
    for (let i = used; i < TEST_SENDS_PER_DAY; i++) expect(await sendCampaignTest(deps(), writer, { templateId: ids.sms, to: '+8801700000697' })).toMatchObject({ ok: true });
    expect(await sendCampaignTest(deps(), writer, { templateId: ids.sms, to: '+8801700000697' })).toEqual({ ok: false, reason: 'LIMIT' });
  });
});
