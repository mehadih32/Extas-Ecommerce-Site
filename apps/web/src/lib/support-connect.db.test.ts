// S22 · PR 426 on a real PostgreSQL (a throwaway database; skipped without TEST_DATABASE_ADMIN_URL): Facebook Messenger's
// webhook (the handshake, only signed posts, only a Page added and switched on), WhatsApp's customer messages handed to
// the inbox, the reply senders on the practice mocks, and the shop's live chat API (off as it ships; the cookie). Every
// id, secret, name and number is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConnections, mockMessengerOutbox, parseWhatsAppWebhook, supportAdapters, whatsappSignature } from '@extas/adapters';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings, storeTarget } from '@extas/settings';
import * as sp from '@extas/support';
import type { AdminDeps } from './admin-auth';
import { CHAT_COOKIE, supportChatHandler } from './shop/support-chat';
import { receiveMessengerWebhook, supportSenders, verifyMessengerWebhook, whatsappToSupport, type MessengerWebhookDeps } from './support-connect';

const HOST = 'shop.example.test';
const APP_SECRET = 'sample-app-secret-426';
const VERIFY = 'sample-verify-token-426';

describe.skipIf(!HAS_TEST_DB)('PR 426 · Support channels in the app (PostgreSQL)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let S = 0;
  let connected = true;
  const hookDeps = (): MessengerWebhookDeps => ({
    db: t.prisma,
    settings: resolver,
    connections: {
      secretOf: async (_kind, field) =>
        connected && (field === 'appSecret' || field === 'verifyToken') ? { value: field === 'appSecret' ? APP_SECRET : VERIFY, storeId: S, provider: 'messengerPage', mode: 'LIVE', integrationId: '0192f0e0-0000-7000-8000-000000000426' } : null,
    },
  });
  const post = (body: unknown, secret = APP_SECRET) => {
    const rawBody = JSON.stringify(body);
    return receiveMessengerWebhook(hookDeps(), { rawBody, signature: whatsappSignature(rawBody, secret) });
  };
  const page = (messaging: unknown[]) => ({ object: 'page', entry: [{ id: '100200300', time: 1, messaging }] });
  const said = (mid: string, text: string, from = 'psid-426') => ({ sender: { id: from }, recipient: { id: '100200300' }, timestamp: Date.parse('2026-10-31T06:00:00Z'), message: { mid, text } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('support_connect');
    [S] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, resolver, vault: null };
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('Messenger: refused until a Page connection is on; the handshake needs the verify token; only signed posts; only a Page added and switched on', async () => {
    expect((await post(page([said('m.1', 'hi')]))).code).toBe('NOT_CONNECTED');
    await t.prisma.integration.create({ data: { storeId: S, kind: 'MESSENGER', provider: 'messengerPage', name: 'Sample Page', mode: 'LIVE', enabled: true, secretNames: [] } });
    connected = false;
    expect((await post(page([]))).code).toBe('NOT_CONNECTED');
    connected = true;
    expect(await verifyMessengerWebhook(hookDeps(), { mode: 'subscribe', token: VERIFY, challenge: '426426' })).toEqual({ status: 200, body: '426426' });
    expect((await verifyMessengerWebhook(hookDeps(), { mode: 'subscribe', token: 'wrong', challenge: '426426' })).status).toBe(403);
    expect(await receiveMessengerWebhook(hookDeps(), { rawBody: '{}', signature: null })).toMatchObject({ status: 401, code: 'BAD_SIGNATURE' });
    expect(await post(page([]), 'another-secret')).toMatchObject({ status: 401 });
    expect(await receiveMessengerWebhook(hookDeps(), { rawBody: '{', signature: whatsappSignature('{', APP_SECRET) })).toMatchObject({ status: 400, code: 'BAD_JSON' });
    // the Page is not in Support yet: nothing is taken (it stays in the Page's own inbox)
    expect(await post(page([said('m.1', 'Is the navy polo in M?')]))).toMatchObject({ status: 200, code: 'OK', result: { received: 0, skipped: 1 } });
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'messenger', externalId: '100200300', name: 'Sample Page', enabled: true } });
    expect((await post(page([said('m.1', 'Is the navy polo in M?'), { sender: { id: '100200300' }, recipient: { id: 'psid-426' }, message: { mid: 'm.echo', text: 'echo', is_echo: true } }]))).result).toEqual({ received: 1, duplicate: 0, skipped: 0 });
    expect((await post(page([said('m.1', 'Is the navy polo in M?')]))).result).toEqual({ received: 0, duplicate: 1, skipped: 0 });
    // a body over support.channels.webhookMaxBodyKb is refused before anything is read
    await resolver.set('support.channels', { replyWindowHours: 24, webhookMaxBodyKb: 16 }, storeTarget(S));
    expect((await post(page([said('m.2', 'x'.repeat(17 * 1024))]))).code).toBe('TOO_LARGE');
  });

  it('a reply on Messenger goes through the Page connection (the practice mock until its keys are in)', async () => {
    mockMessengerOutbox.clear();
    const connections = createConnections({ db: t.prisma, vault: { get: async () => null }, adapters: supportAdapters, secretCacheMs: 0, testTimeoutMs: 1000 });
    await t.prisma.integration.updateMany({ where: { kind: 'MESSENGER' }, data: { enabled: false } });
    const send = supportSenders(async () => connections);
    expect(await send.messenger!(S, 'psid-426', 'Yes, it is.')).toMatchObject({ ok: true });
    expect(mockMessengerOutbox.lastTo('psid-426')).toMatchObject({ text: 'Yes, it is.' });
    expect(await send.whatsapp!(S, '+15550100426', 'Yes, it is.')).toMatchObject({ ok: true });
  });

  it('WhatsApp: a verified post\'s customer messages, with their files, as the inbox takes them', () => {
    const { inbound } = parseWhatsAppWebhook({
      object: 'whatsapp_business_account',
      entry: [{ id: '1', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '555000111' }, contacts: [{ wa_id: '15550100426', profile: { name: 'Sample Person' } }], messages: [{ from: '15550100426', id: 'wamid.426', timestamp: '1792994400', type: 'image', image: { id: '9988776655', mime_type: 'image/jpeg', caption: 'this one' } }] } }] }],
    });
    expect(whatsappToSupport(inbound)).toEqual([
      { channelExternalId: '555000111', from: '+15550100426', phone: '+15550100426', name: 'Sample Person', messageId: 'wamid.426', text: 'this one', files: [{ kind: 'IMAGE', sourceUrl: 'https://graph.facebook.com/v21.0/9988776655', contentType: 'image/jpeg' }], at: new Date(1792994400 * 1000) },
    ]);
    expect(whatsappToSupport([{ from: '+1555', messageId: 'x', text: 'no number id', at: new Date() }])).toEqual([]);
  });

  it('the shop chat: off as it ships; switched on, the first message gives the cookie, the thread reads back, a cross-site post is refused', async () => {
    const req = (method: string, opts: { body?: unknown; cookie?: string; origin?: string } = {}) =>
      new Request(`https://${HOST}/api/shop/support-chat`, {
        method,
        headers: { host: HOST, ...(method !== 'GET' ? { origin: opts.origin ?? `https://${HOST}`, 'content-type': 'application/json' } : {}), ...(opts.cookie ? { cookie: opts.cookie } : {}) },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any>, cookie: r.headers.get('set-cookie') });
    expect((await read(await supportChatHandler(req('GET'), deps, S))).body).toMatchObject({ ok: true, on: false, lines: [] });
    expect((await read(await supportChatHandler(req('POST', { body: { text: 'hello', requestKey: 'press-426-a' } }), deps, S))).body.error).toBe('LIVE_CHAT_OFF');
    expect((await supportChatHandler(req('DELETE'), deps, S)).status).toBe(405);
    expect((await supportChatHandler(req('GET'), null, S)).status).toBe(503);

    await resolver.set('support.liveChat', { enabled: true, pollSeconds: 5, maxChars: 200, perMinute: 6, cookieDays: 30 }, storeTarget(S));
    expect((await supportChatHandler(req('POST', { body: { text: 'hello', requestKey: 'press-426-b' }, origin: 'https://evil.example' }), deps, S)).status).toBe(403);
    const first = await read(await supportChatHandler(req('POST', { body: { text: 'Do you deliver to Sylhet?', requestKey: 'press-426-c' } }), deps, S));
    expect(first.status).toBe(201);
    expect(first.cookie).toMatch(new RegExp(`^${CHAT_COOKIE}=[A-Za-z0-9_-]{32}; Path=/api/shop/support-chat; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$`));
    const cookie = first.cookie!.split(';')[0]!;
    const again = await read(await supportChatHandler(req('POST', { body: { text: 'Do you deliver to Sylhet?', requestKey: 'press-426-c' }, cookie }), deps, S));
    expect(again).toMatchObject({ status: 200, body: { duplicate: true }, cookie: null });
    expect((await read(await supportChatHandler(req('POST', { body: { text: 'x'.repeat(201), requestKey: 'press-426-d' }, cookie }), deps, S))).body.error).toBe('TOO_LONG');
    const th = await read(await supportChatHandler(req('GET', { cookie }), deps, S));
    expect(th.body).toMatchObject({ on: true, pollSeconds: 5, maxChars: 200, lines: [{ from: 'me', text: 'Do you deliver to Sylhet?' }] });
    expect((await read(await supportChatHandler(req('GET'), deps, S))).body.lines).toEqual([]);
    expect(await t.prisma.supportChannel.findUniqueOrThrow({ where: { storeId_kind_externalId: { storeId: S, kind: 'livechat', externalId: 'site' } } })).toMatchObject({ name: 'Site chat', enabled: true });
    expect(sp.isVisitorToken(cookie.split('=')[1])).toBe(true);
  });
});
