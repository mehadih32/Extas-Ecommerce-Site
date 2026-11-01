// PR 435 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the support app's push notifications. Off as it
// ships, nobody is pushed and no device can be switched on; on, a customer's message wakes the chat's owner (or, while
// nobody owns it, everyone who may answer), a chat given to someone wakes that person, a blocked person wakes nobody,
// the lock screen shows what `preview` allows (numbers masked when the privacy card masks them), a gone device is
// switched off (kept), a failing one counted, and a device moves to whoever switches it on. Every value is made up.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  assignConversation,
  blockChatPerson,
  receiveMessage,
  removeSupportDevice,
  saveSupportDevice,
  supportAppState,
  supportPushesSettled,
  testSupportPush,
  type SupportDeps,
  type SupportPushFacts,
  type SupportPushSender,
  type Who,
} from './index';

const P256 = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';

describe.skipIf(!HAS_TEST_DB)('PR 435 · support app push (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  const overrides = new Map<string, unknown>();
  let clock = new Date('2026-11-01T06:00:00Z').getTime();
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const sent: { endpoint: string; payload: { title: string; body: string; url: string; tag: string }; ttl: number }[] = [];
  const facts: SupportPushFacts[] = [];
  type Answer = Awaited<ReturnType<SupportPushSender['send']>>;
  let answer: (endpoint: string) => Answer = () => ({ ok: true });
  const sender: SupportPushSender = {
    practice: false,
    async send(target, payload, opts) {
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload), ttl: opts.ttlSeconds });
      return answer(target.endpoint);
    },
  };
  const deps = (): SupportDeps => ({
    db: t.prisma,
    settings,
    now: () => new Date((clock += 1000)),
    push: {
      sender: async () => sender,
      words: (lang, f) => (facts.push(f), { title: `${lang}:${f.kind}:${f.name ?? '-'}`, body: f.text ?? f.channelKind }),
      url: (id) => `/admin/support/c/${id}`,
    },
  });
  const who: Record<'owner' | 'agent' | 'other' | 'reader', Who> = {} as never;
  let n = 0;
  const say = async (contact: string, text: string) => {
    const r = await receiveMessage(deps(), { storeId: S, channel: { kind: 'whatsapp', externalId: 'sample-whatsapp-435' }, contact: { externalId: contact, name: `Sample ${contact}` }, message: { externalId: `m435-${++n}`, text, sentAt: new Date((clock += 1000)) } });
    await supportPushesSettled();
    return r;
  };
  const device = (k: string) => ({ endpoint: `https://push.example.com/send/${k}`, keys: { p256dh: P256, auth: AUTH }, label: `Sample ${k}` });
  const to = () => sent.map((s) => s.endpoint.split('/').pop()).sort();
  const ON = { ...registry['support.app'].default, enabled: true, push: true };

  beforeAll(async () => {
    t = await createTestDatabase('support_push');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const roles = {
      owner: await createRole(t.prisma, SYSTEM, { key: 't435-owner', nameEn: 'owner', nameBn: 'owner', permissions: ['support.read', 'support.reply', 'support.assign', 'support.block'] }),
      agent: await createRole(t.prisma, SYSTEM, { key: 't435-agent', nameEn: 'agent', nameBn: 'agent', permissions: ['support.read', 'support.reply'] }),
      reader: await createRole(t.prisma, SYSTEM, { key: 't435-reader', nameEn: 'reader', nameBn: 'reader', permissions: ['support.read'] }),
    };
    for (const [k, r] of [['owner', roles.owner], ['agent', roles.agent], ['other', roles.agent], ['reader', roles.reader]] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `t435-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login', adminLocale: k === 'other' ? 'bn' : null } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: r.id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'whatsapp', externalId: 'sample-whatsapp-435', name: 'whatsapp (sample)', enabled: true } });
  });
  afterAll(async () => {
    await t?.drop();
  });
  beforeEach(() => {
    sent.length = 0;
    facts.length = 0;
    answer = () => ({ ok: true });
  });

  it('off as it ships: no device is switched on and a message pushes nobody', async () => {
    await expect(saveSupportDevice(deps(), who.agent, device('agent'))).rejects.toMatchObject({ code: 'PUSH_OFF' });
    await say('off-1', 'hello');
    expect(sent).toEqual([]);
    expect(await supportAppState(deps(), who.agent)).toMatchObject({ enabled: false, push: false, devices: [] });
  });

  it('on: a new message wakes everyone who may answer while nobody owns the chat, then only its owner; a chat given wakes that person', async () => {
    overrides.set('support.app', ON);
    for (const k of ['agent', 'other', 'reader'] as const) await saveSupportDevice(deps(), who[k], device(k));
    expect((await supportAppState(deps(), who.agent)).devices).toEqual([expect.objectContaining({ label: 'Sample agent', failCount: 0 })]);
    const c = await say('on-1', 'Is the polo in stock?');
    // the reader may not answer: not woken
    expect(to()).toEqual(['agent', 'other']);
    expect(sent[0]).toMatchObject({ ttl: 3600, payload: { url: `/admin/support/c/${c.conversationId}`, tag: `chat-${c.conversationId}` } });
    // each in their own admin language; the name shown, not the words (preview "name")
    expect(sent.map((s) => s.payload.title).sort()).toEqual(['bn:message:Sample on-1', 'en:message:Sample on-1']);
    expect(facts.every((f) => f.text === null)).toBe(true);
    sent.length = 0;
    await assignConversation(deps(), who.owner, { conversationId: c.conversationId, staffId: who.agent.actor.staffUserId });
    await supportPushesSettled();
    expect(to()).toEqual(['agent']);
    expect(sent[0]!.payload.title).toBe('en:assigned:Sample on-1');
    sent.length = 0;
    await say('on-1', 'Size M please');
    expect(to()).toEqual(['agent']);
    // taking a chat oneself wakes nobody
    sent.length = 0;
    const c2 = await say('on-2', 'hi');
    sent.length = 0;
    await assignConversation(deps(), who.other, { conversationId: c2.conversationId, staffId: who.other.actor.staffUserId });
    await supportPushesSettled();
    expect(sent).toEqual([]);
    // the event switched off: not pushed
    overrides.set('support.app', { ...ON, events: ['assigned'] });
    await say('on-2', 'still there?');
    expect(sent).toEqual([]);
    overrides.set('support.app', ON);
  });

  it('the lock screen shows what preview allows: nothing, or the words with numbers masked', async () => {
    overrides.set('support.app', { ...ON, preview: 'none' });
    await say('pv-1', 'call me 01711000435');
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.name === null && f.text === null)).toBe(true);
    facts.length = 0;
    overrides.set('support.app', { ...ON, preview: 'text' });
    overrides.set('support.privacy', { ownChatsOnly: false, maskNumbersInText: true });
    await say('pv-1', 'call me 01711000435');
    expect(facts[0]!.name).toBe('Sample pv-1');
    expect(facts[0]!.text).toMatch(/^call me /);
    expect(facts[0]!.text).not.toContain('01711000435');
    overrides.delete('support.privacy');
    overrides.set('support.app', ON);
  });

  it('a blocked person wakes nobody; a gone device is switched off and kept; a failing one is counted', async () => {
    overrides.set('support.blockList', { enabled: true });
    const b = await say('blk-1', 'first');
    await blockChatPerson(deps(), who.owner, { conversationId: b.conversationId, reason: 'Sample reason' });
    sent.length = 0;
    await say('blk-1', 'again');
    expect(sent).toEqual([]);
    overrides.delete('support.blockList');

    const agentOnly = (r: Answer) => (endpoint: string) => (endpoint.endsWith('/agent') ? r : { ok: true as const });
    answer = agentOnly({ ok: false, gone: false, error: 'the push service refused (500)' });
    await say('gone-1', 'hello');
    expect((await t.prisma.staffPushSubscription.findUniqueOrThrow({ where: { endpoint: device('agent').endpoint } })).failCount).toBe(1);
    answer = agentOnly({ ok: false, gone: true, error: 'the device is no longer subscribed' });
    await say('gone-1', 'hello again');
    const gone = await t.prisma.staffPushSubscription.findUniqueOrThrow({ where: { endpoint: device('agent').endpoint } });
    expect(gone.revokedAt).not.toBeNull();
    expect((await supportAppState(deps(), who.agent)).devices).toEqual([]);
    answer = () => ({ ok: true });
    sent.length = 0;
    await say('gone-1', 'third');
    expect(to()).toEqual(['other']);
  });

  it('a device is switched on again, moves to whoever switches it on, is switched off by its own person only; test push', async () => {
    await saveSupportDevice(deps(), who.agent, device('agent'));
    expect((await supportAppState(deps(), who.agent)).devices).toHaveLength(1);
    // another person signs in on the same browser
    await saveSupportDevice(deps(), who.owner, device('agent'));
    expect((await supportAppState(deps(), who.agent)).devices).toHaveLength(0);
    expect((await supportAppState(deps(), who.owner)).devices).toHaveLength(1);
    // only the device's own person switches it off
    await removeSupportDevice(deps(), who.agent, { endpoint: device('agent').endpoint });
    expect((await supportAppState(deps(), who.owner)).devices).toHaveLength(1);
    expect(await testSupportPush(deps(), who.owner)).toEqual({ devices: 1, sent: 1, failed: 0, gone: 0, practice: false });
    await removeSupportDevice(deps(), who.owner, { endpoint: device('agent').endpoint });
    expect((await supportAppState(deps(), who.owner)).devices).toHaveLength(0);
    expect(await t.prisma.staffPushSubscription.count({ where: { endpoint: device('agent').endpoint } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'support.app.device.' } } })).toBeGreaterThanOrEqual(4);
    await expect(saveSupportDevice(deps(), who.agent, { ...device('x'), endpoint: 'http://push.example.com/x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
