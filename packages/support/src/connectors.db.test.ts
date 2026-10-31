// PR 426 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the channels list of Support settings, a
// webhook's messages into the inbox only for a channel added and switched on, Meta's reply window on the way out, and
// the site's live chat (off as it ships). Every id, name and number is made up; the clock is a fixed clock.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  liveChatState,
  liveChatThread,
  newVisitorToken,
  postLiveChat,
  receiveFromChannel,
  replyToConversation,
  saveSupportChannel,
  supportChannelAdapters,
  supportChannels,
  visitorIdOf,
  type ChannelInbound,
  type MetaSend,
  type SupportDeps,
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

describe.skipIf(!HAS_TEST_DB)('PR 426 · channel connectors and the live chat (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  const overrides = new Map<string, unknown>();
  const clock = { now: new Date('2026-10-31T06:00:00Z') };
  const tick = (min: number) => (clock.now = new Date(clock.now.getTime() + min * 60_000));
  const tickS = (sec: number) => (clock.now = new Date(clock.now.getTime() + sec * 1000));
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const sent: { storeId: number; to: string; text: string }[] = [];
  let fail = false;
  const send: MetaSend = async (storeId, to, text) => {
    if (fail) return { ok: false, error: 'the provider said no' };
    sent.push({ storeId, to, text });
    return { ok: true, externalMessageId: `mid-${sent.length}` };
  };
  const base = () => ({ db: t.prisma, settings, now: () => clock.now });
  const deps = (): SupportDeps => ({ ...base(), channels: supportChannelAdapters(base(), { messenger: send, whatsapp: send }) });
  const who: Record<'agent' | 'lead' | 'reader', Who> = {} as never;
  let n = 0;
  const key = () => `press-${++n}-abcdefgh`;
  const msg = (from: string, text: string, extra: Partial<ChannelInbound> = {}): ChannelInbound => ({ channelExternalId: '100200300', from, messageId: `mid.${++n}`, text, files: [], at: clock.now, ...extra });

  beforeAll(async () => {
    t = await createTestDatabase('support_connectors');
    [S, S2] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = { agent: await role('c-agent', ['support.read', 'support.reply']), lead: await role('c-lead', ['support.read', 'support.reply', 'support.settings']), reader: await role('c-reader', ['support.read']) };
    for (const k of ['agent', 'lead', 'reader'] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `c-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('the channels list: a Page or a number is added switched off, renamed, switched on, put away (never deleted); every change audited', async () => {
    const add = (w: Who, input: Record<string, unknown>) => saveSupportChannel(base(), w, { action: 'add', kind: 'messenger', externalId: '100200300', name: 'Sample Page', ...input });
    expect(await code(add(who.agent, {}))).toBe('FORBIDDEN');
    expect(await code(add(who.lead, { externalId: 'page-one' }))).toBe('INVALID_INPUT');
    expect(await code(add(who.lead, { kind: 'livechat' }))).toBe('INVALID_INPUT');
    const { id } = await add(who.lead, {});
    expect(await code(add(who.lead, {}))).toBe('INVALID_INPUT');
    const list = await supportChannels(base(), who.reader);
    expect(list.canEdit).toBe(false);
    expect(list.rows).toEqual([expect.objectContaining({ id, kind: 'messenger', externalId: '100200300', name: 'Sample Page', enabled: false, archived: false, conversations: 0, liveChatOn: null })]);
    const v = list.rows[0]!.version;
    expect(await code(saveSupportChannel(base(), who.lead, { action: 'rename', id, name: 'EXTAS sample', version: 'old' }))).toBe('STALE');
    await saveSupportChannel(base(), who.lead, { action: 'rename', id, name: 'Sample Page 2', version: v });
    await saveSupportChannel(base(), who.lead, { action: 'archive', id, archived: true });
    expect(await t.prisma.supportChannel.findUniqueOrThrow({ where: { id } })).toMatchObject({ enabled: false, name: 'Sample Page 2' });
    expect((await supportChannels(base(), who.lead)).rows[0]).toMatchObject({ archived: true });
    await saveSupportChannel(base(), who.lead, { action: 'archive', id, archived: false });
    await saveSupportChannel(base(), who.lead, { action: 'switch', id, enabled: true });
    expect((await supportChannels(base(), who.lead)).rows[0]).toMatchObject({ archived: false, enabled: true });
    expect(await t.prisma.auditLog.count({ where: { entityType: 'SupportChannel', entityId: id } })).toBe(5);
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'whatsapp', externalId: '555000111', name: 'Sample number', enabled: false } });
  });

  it('a webhook\'s messages go in only for a channel added and switched on in that store; again is the same message; the reply window is kept', async () => {
    expect(await receiveFromChannel(base(), S2, 'messenger', [msg('psid-1', 'hello')])).toEqual({ received: 0, duplicate: 0, skipped: 1 });
    expect(await receiveFromChannel(base(), S, 'whatsapp', [msg('+15550100', 'hi', { channelExternalId: '555000111' })])).toEqual({ received: 0, duplicate: 0, skipped: 1 });
    const first = msg('psid-1', 'Is the navy polo in M?', { name: '  Sample Person  ' });
    expect(await receiveFromChannel(base(), S, 'messenger', [first, msg('psid-1', '', {})])).toEqual({ received: 1, duplicate: 0, skipped: 1 });
    expect(await receiveFromChannel(base(), S, 'messenger', [first])).toEqual({ received: 0, duplicate: 1, skipped: 0 });
    const c = await t.prisma.conversation.findFirstOrThrow({ where: { storeId: S, channel: { kind: 'messenger' } }, include: { contact: true } });
    expect(c.contact).toMatchObject({ externalId: 'psid-1', displayName: 'Sample Person' });
    expect(c.windowExpiresAt).toEqual(new Date('2026-11-01T06:00:00Z'));
  });

  it('a reply goes out on Messenger inside the window; outside it, or with files, it is kept as not sent; a provider failure is FAILED', async () => {
    const c = await t.prisma.conversation.findFirstOrThrow({ where: { storeId: S, channel: { kind: 'messenger' } } });
    const r1 = await replyToConversation(deps(), who.agent, { conversationId: c.id, body: 'Yes, it is.', requestKey: key() });
    expect(r1).toMatchObject({ delivery: 'SENT', failReason: null });
    expect(sent.at(-1)).toEqual({ storeId: S, to: 'psid-1', text: 'Yes, it is.' });
    fail = true;
    expect(await replyToConversation(deps(), who.agent, { conversationId: c.id, body: 'Again', requestKey: key() })).toMatchObject({ delivery: 'FAILED', failReason: 'the provider said no' });
    fail = false;
    tick(25 * 60);
    const r2 = await replyToConversation(deps(), who.agent, { conversationId: c.id, body: 'Are you still there?', requestKey: key() });
    expect(r2).toMatchObject({ delivery: 'NOT_SENT', failReason: 'OUTSIDE_WINDOW' });
    overrides.set('support.channels', { replyWindowHours: 48, webhookMaxBodyKb: 256 });
    expect(await replyToConversation(deps(), who.agent, { conversationId: c.id, body: 'Still here', requestKey: key() })).toMatchObject({ delivery: 'SENT' });
    overrides.delete('support.channels');
    expect(sent).toHaveLength(2);
  });

  it('the live chat ships off; switched on, a visitor writes, reads the sent answers (never a note), is held to perMinute, and his token is only kept hashed', async () => {
    const token = newVisitorToken();
    expect((await liveChatState(base(), S)).on).toBe(false);
    expect(await code(postLiveChat(base(), S, token, { text: 'hello', requestKey: key() }, 'Site chat'))).toBe('LIVE_CHAT_OFF');
    overrides.set('support.liveChat', { enabled: true, pollSeconds: 5, maxChars: 40, perMinute: 2, cookieDays: 30 });
    expect(await code(postLiveChat(base(), S, 'short', { text: 'hello', requestKey: key() }, 'Site chat'))).toBe('INVALID_INPUT');
    expect(await code(postLiveChat(base(), S, token, { text: '   ', requestKey: key() }, 'Site chat'))).toBe('EMPTY');
    expect(await code(postLiveChat(base(), S, token, { text: 'x'.repeat(41), requestKey: key() }, 'Site chat'))).toBe('TOO_LONG');
    const press = key();
    expect(await postLiveChat(base(), S, token, { text: 'Do you deliver to Sylhet?', name: 'Sample Visitor', requestKey: press }, 'Site chat')).toEqual({ duplicate: false });
    expect(await postLiveChat(base(), S, token, { text: 'Do you deliver to Sylhet?', requestKey: press }, 'Site chat')).toEqual({ duplicate: true });
    tickS(10);
    await postLiveChat(base(), S, token, { text: 'And how long?', requestKey: key() }, 'Site chat');
    tickS(10);
    expect(await code(postLiveChat(base(), S, token, { text: 'Hello?', requestKey: key() }, 'Site chat'))).toBe('RATE_LIMITED');
    expect(await postLiveChat(base(), S, token, { text: 'Do you deliver to Sylhet?', requestKey: press }, 'Site chat')).toEqual({ duplicate: true });

    const ch = await t.prisma.supportChannel.findUniqueOrThrow({ where: { storeId_kind_externalId: { storeId: S, kind: 'livechat', externalId: 'site' } } });
    expect(ch).toMatchObject({ name: 'Site chat', enabled: true });
    const contact = await t.prisma.supportContact.findFirstOrThrow({ where: { storeId: S, channelKind: 'livechat' } });
    expect(contact.externalId).toBe(visitorIdOf(token));
    expect(contact.externalId).not.toContain(token);
    const conv = await t.prisma.conversation.findFirstOrThrow({ where: { contactId: contact.id } });
    await replyToConversation(deps(), who.agent, { conversationId: conv.id, body: 'Inside the team only', note: true, requestKey: key() });
    tickS(5);
    expect(await replyToConversation(deps(), who.agent, { conversationId: conv.id, body: 'Yes, in 2 to 3 days.', requestKey: key() })).toMatchObject({ delivery: 'SENT' });
    const th = await liveChatThread(base(), S, token);
    expect(th.lines.map((l) => [l.from, l.text])).toEqual([
      ['me', 'Do you deliver to Sylhet?'],
      ['me', 'And how long?'],
      ['shop', 'Yes, in 2 to 3 days.'],
    ]);
    expect((await liveChatThread(base(), S, newVisitorToken())).lines).toEqual([]);
    expect((await liveChatThread(base(), S2, token)).lines).toEqual([]);
    tick(2);
    await postLiveChat(base(), S, token, { text: 'Thanks', requestKey: key() }, 'Site chat');

    // the team switches the chat's channel off: the chat is off on the shop, replies are kept
    await saveSupportChannel(base(), who.lead, { action: 'switch', id: ch.id, enabled: false });
    expect((await liveChatState(base(), S)).on).toBe(false);
    expect(await code(postLiveChat(base(), S, token, { text: 'Hello?', requestKey: key() }, 'Site chat'))).toBe('LIVE_CHAT_OFF');
    expect(await replyToConversation(deps(), who.agent, { conversationId: conv.id, body: 'Later', requestKey: key() })).toMatchObject({ delivery: 'NOT_SENT', failReason: 'CHANNEL_OFF' });
    await saveSupportChannel(base(), who.lead, { action: 'switch', id: ch.id, enabled: true });
    overrides.set('support.liveChat', { enabled: false, pollSeconds: 5, maxChars: 40, perMinute: 2, cookieDays: 30 });
    expect(await replyToConversation(deps(), who.agent, { conversationId: conv.id, body: 'Later again', requestKey: key() })).toMatchObject({ delivery: 'NOT_SENT', failReason: 'LIVE_CHAT_OFF' });
    expect((await supportChannels(base(), who.reader)).rows.find((r) => r.kind === 'livechat')).toMatchObject({ liveChatOn: false, conversations: 1 });
    overrides.delete('support.liveChat');
  });
});
