// S14 · PR 292 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real
// checkout; skipped without TEST_DATABASE_ADMIN_URL). The WhatsApp Business Platform's side of the engine, SIM-F-011:
// in LIVE a message the shop starts goes only as a template Meta approved (else skipped, and the step's fallback goes);
// the templates are sent for approval and read back; the webhook takes only signed posts, its receipts mark a message
// delivered (never back again) or failed (with the fallback), and the customer's "১" answers the self-confirm by itself.
// The sender and the vault are stand-ins: nothing is ever sent to a real number and no real key is used.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdapterMode } from '@extas/db/client';
import { whatsappSignature, type WhatsAppTemplateDraft } from '@extas/adapters';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_JOURNEY, type MessageChannel } from '@extas/settings';
import { receiveWhatsAppWebhook, runMessages, submitWaTemplate, syncWaTemplates, verifyWhatsAppWebhook, waTemplatesScreen, type MessagesDeps, type OutgoingMessage, type WhatsAppWebhookDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

// made-up test values: never a real key
const APP_SECRET = 'test-app-secret-for-signing';
const VERIFY = 'test-verify-word';

describe.skipIf(!HAS_TEST_DB)('PR 292 · WhatsApp Business: approved templates, the webhook, receipts and replies (PostgreSQL)', () => {
  let f: OrdersFixture;
  let staff: Who;
  let reader: Who;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel; messageId: string })[] = [];
  const submitted: WhatsAppTemplateDraft[] = [];
  let waMode: AdapterMode = 'LIVE';
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({
    provider: channel === 'WHATSAPP' ? 'whatsappCloud' : 'test',
    mode: channel === 'WHATSAPP' ? waMode : 'MOCK',
    send: async (m) => {
      const messageId = randomUUID();
      outbox.push({ channel, messageId, ...m });
      return { ok: true, messageId };
    },
    ...(channel === 'WHATSAPP'
      ? {
          templates: async () => submitted.map((d) => ({ name: d.name, language: d.language, status: 'APPROVED' as const, reason: null })),
          submitTemplate: async (d: WhatsAppTemplateDraft) => {
            submitted.push(d);
            return { id: randomUUID(), status: 'PENDING' as const };
          },
        }
      : {}),
  });
  let connected = true;
  const deps = (): WhatsAppWebhookDeps => ({
    db: db(),
    settings: f.deps().settings,
    sender,
    now: () => f.clock.now,
    connections: {
      secretOf: async (_kind, field) =>
        connected && (field === 'appSecret' || field === 'verifyToken') ? { value: field === 'appSecret' ? APP_SECRET : VERIFY, storeId: f.S, provider: 'whatsappCloud', mode: 'LIVE', integrationId: randomUUID() } : null,
    },
  });
  const run = async () => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000);
    return runMessages(deps(), f.S);
  };
  const mine = (o: { number: string }) => outbox.filter((m) => new RegExp(`${o.number}(?!\\d)`).test(m.text) || m.template?.params.includes(o.number));
  const rowOf = (orderId: string, step: string, channel: MessageChannel) => db().notificationLog.findFirstOrThrow({ where: { orderId, step, channel } });
  const post = (body: unknown, secret = APP_SECRET) => {
    const rawBody = JSON.stringify(body);
    return receiveWhatsAppWebhook(deps(), { rawBody, signature: whatsappSignature(rawBody, secret) });
  };
  const hook = (value: Record<string, unknown>) => ({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value }] }] });
  const at = () => String(Math.floor(f.clock.now.getTime() / 1000));

  beforeAll(async () => {
    f = await setUpOrders('whatsapp');
    const p = db();
    const role = await createRole(p, SYSTEM, { key: 'test-wa', nameEn: 'wa', nameBn: 'wa', permissions: ['messages.channels.read', 'messages.channels.write'] });
    const readRole = await createRole(p, SYSTEM, { key: 'test-wa-read', nameEn: 'reader', nameBn: 'reader', permissions: ['messages.channels.read'] });
    const u = await p.staffUser.create({ data: { email: 'wa@example.com', displayName: 'WhatsApp Staff', passwordHash: 'not-a-login' } });
    const r = await p.staffUser.create({ data: { email: 'wa-reader@example.com', displayName: 'Reader', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    await p.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: readRole.id, storeId: f.S } });
    staff = { actor: { staffUserId: u.id }, storeId: f.S };
    reader = { actor: { staffUserId: r.id }, storeId: f.S };
    f.overrides.set('system.stagingHost', 'shop.example');
    f.overrides.set('messages.language', 'en');
    // the "order received" SMS and the self-confirm WhatsApp only
    f.overrides.set('messages.journey', {
      ...DEFAULT_JOURNEY,
      selfConfirm: { ...DEFAULT_JOURNEY.selfConfirm, on: true },
      confirmed: { ...DEFAULT_JOURNEY.confirmed, on: false },
      packed: { ...DEFAULT_JOURNEY.packed, on: false },
      day1Care: { ...DEFAULT_JOURNEY.day1Care, on: false },
      day3Review: { ...DEFAULT_JOURNEY.day3Review, on: false },
    });
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(async () => {
    f.clock.now = new Date();
    waMode = 'LIVE';
    connected = true;
    await run();
    outbox.length = 0;
  });

  it('SIM-F-011 live: no approved template, no WhatsApp (the SMS fallback goes); sent for approval and read back, it goes as the template', async () => {
    const a = await f.place('wa-unapproved');
    await run();
    expect(await rowOf(a.orderId, 'selfConfirm', 'WHATSAPP')).toMatchObject({ status: 'SKIPPED', reason: 'WA_TEMPLATE_NOT_APPROVED' });
    await run();
    expect(mine(a).map((m) => `${m.channel} ${m.purpose}`)).toEqual(['SMS order.placed', 'SMS order.selfConfirm']);

    const screen = await waTemplatesScreen(deps(), staff);
    expect(screen).toMatchObject({ provider: 'whatsappCloud', mode: 'LIVE', canSync: true, perms: { write: true } });
    const en = screen.templates.find((t) => t.key === 'order.selfConfirm' && t.locale === 'en')!;
    const bn = screen.templates.find((t) => t.key === 'order.selfConfirm' && t.locale === 'bn')!;
    expect(en).toMatchObject({ name: 'order_self_confirm', language: 'en', providerStatus: null, problems: [] });
    // the Bengali words begin with a value: WhatsApp would refuse them, so they are not sent
    expect(bn.problems).toContain('STARTS_WITH_VALUE');
    expect(await code(submitWaTemplate(deps(), staff, bn.id))).toBe('INVALID_INPUT');

    expect(await code(submitWaTemplate(deps(), reader, en.id))).toBe('FORBIDDEN');
    expect((await waTemplatesScreen(deps(), reader)).perms.write).toBe(false);
    const s = await submitWaTemplate(deps(), staff, en.id);
    expect(s.status).toBe('PENDING');
    expect(submitted.at(-1)).toMatchObject({ name: 'order_self_confirm', language: 'en', category: 'UTILITY' });
    expect(submitted.at(-1)!.body).toMatch(/\{\{1\}\}/);
    expect(submitted.at(-1)!.body).not.toMatch(/\{customerName\}/);
    expect(submitted.at(-1)!.examples).toHaveLength(en.values);
    expect(await code(submitWaTemplate(deps(), staff, en.id))).toBe('INVALID_INPUT');
    // still waiting: a live send is still skipped
    const b = await f.place('wa-pending');
    await run();
    expect(await rowOf(b.orderId, 'selfConfirm', 'WHATSAPP')).toMatchObject({ status: 'SKIPPED', reason: 'WA_TEMPLATE_NOT_APPROVED' });

    const synced = await syncWaTemplates(deps(), staff);
    expect(synced.matched).toBeGreaterThanOrEqual(1);
    expect(synced.screen.templates.find((t) => t.id === en.id)).toMatchObject({ providerStatus: 'APPROVED', providerTemplateId: 'order_self_confirm' });
    expect(await db().auditLog.count({ where: { action: { in: ['messages.whatsapp.submit', 'messages.whatsapp.sync'] } } })).toBeGreaterThanOrEqual(2);

    const c = await f.place('wa-approved');
    await run();
    const wa = outbox.filter((m) => m.channel === 'WHATSAPP' && m.template?.params.includes(c.number));
    expect(wa).toHaveLength(1);
    expect(wa[0]!.template).toMatchObject({ name: 'order_self_confirm', language: 'en' });
    expect(wa[0]!.template!.params.every((p) => p.length > 0)).toBe(true);
    expect(await rowOf(c.orderId, 'selfConfirm', 'WHATSAPP')).toMatchObject({ status: 'SENT', provider: 'whatsappCloud', mode: 'LIVE' });

    // the practice sender takes the plain words, approved or not
    waMode = 'MOCK';
    const d = await f.place('wa-mock');
    await run();
    expect(mine(d).find((m) => m.channel === 'WHATSAPP')).toMatchObject({ purpose: 'order.selfConfirm' });
    expect(mine(d).find((m) => m.channel === 'WHATSAPP')!.template ?? null).toBeNull();
  });

  it('the webhook: the handshake, only signed posts; receipts mark delivered (never back) or failed with the fallback; "১" answers by itself', async () => {
    // nothing connected (no switched-on WhatsApp connection): every post and handshake is refused
    expect((await post(hook({}))).code).toBe('NOT_CONNECTED');
    expect((await verifyWhatsAppWebhook(deps(), { mode: 'subscribe', token: VERIFY, challenge: '12345' })).status).toBe(403);
    await db().integration.create({ data: { storeId: f.S, kind: 'WHATSAPP', provider: 'whatsappCloud', name: 'test', mode: 'LIVE', enabled: true, secretNames: [] } });
    connected = false;
    expect((await post(hook({}))).code).toBe('NOT_CONNECTED');
    connected = true;

    // Meta's handshake: the challenge back only for the verify token in the vault
    expect(await verifyWhatsAppWebhook(deps(), { mode: 'subscribe', token: VERIFY, challenge: '12345' })).toEqual({ status: 200, body: '12345' });
    expect((await verifyWhatsAppWebhook(deps(), { mode: 'subscribe', token: 'wrong', challenge: '12345' })).status).toBe(403);
    expect((await verifyWhatsAppWebhook(deps(), { mode: 'unsubscribe', token: VERIFY, challenge: '12345' })).status).toBe(403);

    // its own made-up number, so the newest question to that number is this order's
    const o = await f.place('wa-hook', { phone: '01700000292' });
    await run();
    const asked = await rowOf(o.orderId, 'selfConfirm', 'WHATSAPP');
    expect(asked.status).toBe('SENT');
    const delivered = hook({ statuses: [{ id: asked.providerMessageId, status: 'delivered', timestamp: at(), recipient_id: asked.recipient.slice(1) }] });

    // unsigned, wrongly signed or not JSON
    expect(await receiveWhatsAppWebhook(deps(), { rawBody: JSON.stringify(delivered), signature: null })).toMatchObject({ status: 401, code: 'BAD_SIGNATURE' });
    expect(await post(delivered, 'another-secret')).toMatchObject({ status: 401, code: 'BAD_SIGNATURE' });
    expect(await receiveWhatsAppWebhook(deps(), { rawBody: '{', signature: whatsappSignature('{', APP_SECRET) })).toMatchObject({ status: 400, code: 'BAD_JSON' });
    expect((await rowOf(o.orderId, 'selfConfirm', 'WHATSAPP')).status).toBe('SENT');

    expect(await post(delivered)).toMatchObject({ status: 200, code: 'OK', receipts: { delivered: 1, failed: 0, unknown: 0 } });
    const d1 = await rowOf(o.orderId, 'selfConfirm', 'WHATSAPP');
    expect(d1).toMatchObject({ status: 'DELIVERED', providerStatus: 'delivered' });
    expect(d1.deliveredAt).not.toBeNull();
    // a late "sent" or "failed" never takes it back
    await post(hook({ statuses: [{ id: asked.providerMessageId, status: 'sent', timestamp: at() }, { id: asked.providerMessageId, status: 'failed', timestamp: at(), errors: [{ code: 131047 }] }] }));
    expect(await rowOf(o.orderId, 'selfConfirm', 'WHATSAPP')).toMatchObject({ status: 'DELIVERED', providerStatus: 'delivered' });
    await post(hook({ statuses: [{ id: asked.providerMessageId, status: 'read', timestamp: at() }, { id: 'wamid.unknown', status: 'read', timestamp: at() }] }));
    expect(await rowOf(o.orderId, 'selfConfirm', 'WHATSAPP')).toMatchObject({ status: 'DELIVERED', providerStatus: 'read' });

    // his "১" (a Bengali 1) is his yes, recorded by itself; anything else is left for the team
    const reply = await post(hook({ messages: [{ from: asked.recipient.slice(1), id: 'wamid.in1', timestamp: at(), type: 'text', text: { body: ' ১ ' } }, { from: asked.recipient.slice(1), id: 'wamid.in2', timestamp: at(), type: 'text', text: { body: 'hello' } }] }));
    expect(reply.replies).toEqual({ answers: 1, stops: 0, starts: 0, other: 1, autoReplies: 0 });
    expect(await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'message.selfConfirm.reply' } })).toMatchObject({ reasonCode: 'YES' });
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('CONFIRMED');
    // the "thank you" answers him inside his own 24 hours: free text, no template needed
    await run();
    const thanks = outbox.find((m) => m.channel === 'WHATSAPP' && m.purpose === 'order.selfConfirmed' && m.text.includes(o.number));
    expect(thanks).toBeDefined();
    expect(thanks!.template ?? null).toBeNull();

    // a number not on WhatsApp: FAILED as unreachable, and the step's fallback SMS goes
    const n = await f.place('wa-not-on', { phone: '01700000293' });
    await run();
    const q = await rowOf(n.orderId, 'selfConfirm', 'WHATSAPP');
    expect((await post(hook({ statuses: [{ id: q.providerMessageId, status: 'failed', timestamp: at(), errors: [{ code: 131026, title: 'Message undeliverable' }] }] }))).receipts).toMatchObject({ failed: 1 });
    expect(await rowOf(n.orderId, 'selfConfirm', 'WHATSAPP')).toMatchObject({ status: 'FAILED', reason: 'UNREACHABLE', providerStatus: 'failed' });
    await run();
    expect(mine(n).map((m) => `${m.channel} ${m.purpose}`)).toContain('SMS order.selfConfirm');
    // an answer long after the question is not read as one
    f.clock.now = new Date(f.clock.now.getTime() + 8 * 24 * 3_600_000);
    expect((await post(hook({ messages: [{ from: q.recipient.slice(1), id: 'wamid.in3', timestamp: at(), type: 'text', text: { body: '3' } }] }))).replies).toEqual({ answers: 0, stops: 0, starts: 0, other: 1, autoReplies: 0 });
  });
});
