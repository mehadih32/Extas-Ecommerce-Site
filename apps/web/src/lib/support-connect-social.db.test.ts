// S23 · PR 443 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): Facebook Page comments and Instagram's
// webhooks in the app — the handshake, only signed posts, only a channel added and switched on, a comment marked
// public. Every id, secret and number is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { whatsappSignature } from '@extas/adapters';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { receiveFacebookCommentsWebhook, receiveInstagramWebhook, verifyFacebookCommentsWebhook, verifyInstagramWebhook, type MessengerWebhookDeps } from './support-connect';

const APP_SECRET = 'sample-app-secret-443';
const VERIFY = 'sample-verify-token-443';

describe.skipIf(!HAS_TEST_DB)('PR 443 · Facebook comments and Instagram webhooks in the app (PostgreSQL)', () => {
  let t: TestDatabase;
  let resolver: SettingsResolver<typeof registry>;
  let S = 0;
  let connected = true;
  let provider = 'facebookPageComments';
  const hookDeps = (): MessengerWebhookDeps => ({
    db: t.prisma,
    settings: resolver,
    connections: {
      secretOf: async (_kind, field) =>
        connected && (field === 'appSecret' || field === 'verifyToken') ? { value: field === 'appSecret' ? APP_SECRET : VERIFY, storeId: S, provider, mode: 'LIVE', integrationId: '0192f0e0-0000-7000-8000-000000000443' } : null,
    },
  });
  const postFb = (body: unknown, secret = APP_SECRET) => {
    const rawBody = JSON.stringify(body);
    return receiveFacebookCommentsWebhook(hookDeps(), { rawBody, signature: whatsappSignature(rawBody, secret) });
  };
  const postIg = (body: unknown, secret = APP_SECRET) => {
    const rawBody = JSON.stringify(body);
    return receiveInstagramWebhook(hookDeps(), { rawBody, signature: whatsappSignature(rawBody, secret) });
  };
  const fbComment = (commentId: string, text: string, from = 'fb-user-443') => ({ object: 'page', entry: [{ id: '100200301', changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: commentId, post_id: '100200301_1', from: { id: from }, message: text } }] }] });
  const igBody = (changes: unknown[], messaging: unknown[] = []) => ({ object: 'instagram', entry: [{ id: '17800000443', changes, messaging }] });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('support_connect_social');
    [S] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('Facebook comments: refused until the connection is on; the handshake needs its own verify token; only signed posts; only a Page added for comments', async () => {
    provider = 'facebookPageComments';
    expect((await postFb(fbComment('c.1', 'hi'))).code).toBe('NOT_CONNECTED');
    await t.prisma.integration.create({ data: { storeId: S, kind: 'META', provider: 'facebookPageComments', name: 'Sample Page comments', mode: 'LIVE', enabled: true, secretNames: [] } });
    connected = false;
    expect((await postFb(fbComment('c.1', 'hi'))).code).toBe('NOT_CONNECTED');
    connected = true;
    expect(await verifyFacebookCommentsWebhook(hookDeps(), { mode: 'subscribe', token: VERIFY, challenge: '443443' })).toEqual({ status: 200, body: '443443' });
    expect((await verifyFacebookCommentsWebhook(hookDeps(), { mode: 'subscribe', token: 'wrong', challenge: '443443' })).status).toBe(403);
    expect(await receiveFacebookCommentsWebhook(hookDeps(), { rawBody: '{}', signature: null })).toMatchObject({ status: 401, code: 'BAD_SIGNATURE' });
    expect(await postFb(fbComment('c.1', 'hi'), 'another-secret')).toMatchObject({ status: 401 });
    // the Page is not added for Support yet: the comment stays on the Page's own feed, nothing is taken
    expect(await postFb(fbComment('c.1', 'Is the navy polo in L?'))).toMatchObject({ status: 200, code: 'OK', result: { received: 0, skipped: 1 } });
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'messenger', externalId: '100200301', name: 'Sample Page', enabled: true } });
    const r = await postFb(fbComment('c.1', 'Is the navy polo in L?'));
    expect(r).toMatchObject({ status: 200, code: 'OK', result: { received: 1, duplicate: 0, skipped: 0 } });
    expect(await t.prisma.message.findFirstOrThrow({ where: { conversation: { storeId: S, channel: { kind: 'messenger' } } } })).toMatchObject({ body: '(public comment) Is the navy polo in L?' });
    expect((await postFb(fbComment('c.1', 'Is the navy polo in L?'))).result).toEqual({ received: 0, duplicate: 1, skipped: 0 });
  });

  it('Instagram: its own connection and channel kind; a comment carries the public mark, a Direct message does not', async () => {
    provider = 'instagramEngagement';
    expect((await postIg(igBody([]))).code).toBe('NOT_CONNECTED');
    await t.prisma.integration.create({ data: { storeId: S, kind: 'META', provider: 'instagramEngagement', name: 'Sample IG', mode: 'LIVE', enabled: true, secretNames: [] } });
    expect(await verifyInstagramWebhook(hookDeps(), { mode: 'subscribe', token: VERIFY, challenge: '443444' })).toEqual({ status: 200, body: '443444' });
    expect(await postIg(igBody([]))).toMatchObject({ status: 200, code: 'OK', result: { received: 0, skipped: 0 } });
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'instagram', externalId: '17800000443', name: 'Sample IG', enabled: true } });
    const body = igBody([{ field: 'comments', value: { id: 'ig.c.1', text: 'Price?', from: { id: 'ig-user-443' } } }], [{ sender: { id: 'ig-user-443' }, recipient: { id: '17800000443' }, timestamp: Date.parse('2026-11-12T06:00:00Z'), message: { mid: 'ig.m.1', text: 'Do you ship to Khulna?' } }]);
    const r = await postIg(body);
    expect(r).toMatchObject({ status: 200, code: 'OK', result: { received: 2, duplicate: 0, skipped: 0 } });
    expect(await t.prisma.message.findFirstOrThrow({ where: { conversation: { channel: { kind: 'instagram' } }, body: { startsWith: '(public comment)' } } })).toMatchObject({ body: '(public comment) Price?' });
    expect(await t.prisma.message.findFirstOrThrow({ where: { conversation: { channel: { kind: 'instagram' } }, body: 'Do you ship to Khulna?' } })).toBeTruthy();
  });
});
