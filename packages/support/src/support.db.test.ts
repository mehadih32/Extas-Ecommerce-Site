// PR 425 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a channel's messages become one conversation
// per person, the team replies and writes notes, takes and gives conversations, marks them solved; every step is in the
// append-only who-did-what log with the person's name; without a connected channel a reply is kept and marked not
// sent. Every name, number and address is made up; the clock is the fixtures' fixed clock.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  assignConversation,
  receiveMessage,
  replyToConversation,
  saveSupportSetting,
  setConversationStatus,
  supportFile,
  supportInbox,
  supportSettingsView,
  supportStaff,
  supportThread,
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

describe.skipIf(!HAS_TEST_DB)('PR 425 · the support core (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  const overrides = new Map<string, unknown>();
  const clock = { now: new Date('2026-10-23T06:00:00Z') };
  const tick = (min: number) => (clock.now = new Date(clock.now.getTime() + min * 60_000));
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
    async set<K extends Key>(key: K, value: Value<K>): Promise<void> {
      overrides.set(key, value);
    },
  };
  let channels: SupportDeps['channels'] = undefined;
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now, channels });
  const who: Record<'agent' | 'lead' | 'reader' | 'other' | 'elsewhere', Who> = {} as never;
  const ids: Record<string, string> = {};
  let n = 0;
  const key = () => `press-${++n}-abcdefgh`;
  const inMsg = (contact: string, text: string, extra: Record<string, unknown> = {}) =>
    receiveMessage(deps(), { storeId: S, channel: { kind: 'whatsapp', externalId: 'sample-wa' }, contact: { externalId: contact, name: 'Sample Customer', phone: '+1 555 0100 789' }, message: { externalId: `m-${++n}`, text, sentAt: clock.now, ...extra } });

  beforeAll(async () => {
    t = await createTestDatabase('support');
    [S, S2] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = {
      agent: await role('t-agent', ['support.read', 'support.reply']),
      lead: await role('t-lead', ['support.read', 'support.reply', 'support.assign', 'support.settings', 'customers.phone']),
      reader: await role('t-reader', ['support.read']),
    };
    const person = async (k: keyof typeof who, r: { id: string }, storeId: number) => {
      const u = await t.prisma.staffUser.create({ data: { email: `${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: r.id, storeId } });
      ids[k] = u.id;
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    };
    await person('agent', roles.agent, S);
    await person('lead', roles.lead, S);
    await person('reader', roles.reader, S);
    await person('other', roles.agent, S);
    await person('elsewhere', roles.agent, S2);
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'whatsapp', externalId: 'sample-wa', name: 'WhatsApp (sample)', enabled: true } });
    await t.prisma.customer.create({ data: { storeId: S, phone: '+1 555 0100 789', name: 'Sample Customer' } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('a first message starts an open conversation; the same channel message twice is one message; the next one joins', async () => {
    const a = await inMsg('wa-1', 'Hello, is the polo in size M?');
    expect(a).toMatchObject({ started: true, duplicate: false, reopened: false });
    const again = await receiveMessage(deps(), { storeId: S, channel: { kind: 'whatsapp', externalId: 'sample-wa' }, contact: { externalId: 'wa-1' }, message: { externalId: `m-${n}`, text: 'Hello, is the polo in size M?' } });
    expect(again).toMatchObject({ duplicate: true, conversationId: a.conversationId, messageId: a.messageId });
    tick(1);
    const b = await inMsg('wa-1', 'And in navy?', { files: [{ kind: 'IMAGE', sourceUrl: 'https://files.example.com/x.jpg', fileName: 'x.jpg' }] });
    expect(b).toMatchObject({ started: false, conversationId: a.conversationId });
    ids.conv = a.conversationId;
    const c = await t.prisma.conversation.findUniqueOrThrow({ where: { id: a.conversationId }, include: { contact: true } });
    expect(c).toMatchObject({ status: 'OPEN', lastDirection: 'IN', lastPreview: 'And in navy?', subject: 'Hello, is the polo in size M?', waitingSince: new Date('2026-10-23T06:00:00Z') });
    expect(c.customerId).toBe(c.contact.customerId);
    expect(c.customerId).not.toBeNull();
    expect(await t.prisma.message.count({ where: { conversationId: a.conversationId } })).toBe(2);
    expect(await t.prisma.messageAttachment.findFirst({ where: { storeId: S } })).toMatchObject({ status: 'PENDING', sourceUrl: 'https://files.example.com/x.jpg', assetId: null });
    expect(await code(receiveMessage(deps(), { storeId: S, channel: { kind: 'messenger', externalId: 'nope' }, contact: { externalId: 'x' }, message: { externalId: 'y', text: 'hi' } }))).toBe('NOT_FOUND');
  });

  it('the inbox: views with counts; another store sees nothing; a number is masked by customers.phoneMask unless the person may see it whole', async () => {
    const box = await supportInbox(deps(), who.agent, { view: 'open' });
    expect(box.rows.map((r) => r.id)).toEqual([ids.conv]);
    expect(box.counts).toMatchObject({ open: 1, unassigned: 1, mine: 0, waiting: 0, solved: 0, all: 1 });
    expect(box.rows[0]!.contact.phone).toBe('155•••••789');
    expect((await supportInbox(deps(), { ...who.elsewhere, storeId: S2 }, {})).counts.all).toBe(0);
    expect(await code(supportInbox(deps(), { ...who.elsewhere, storeId: S }, {}))).toBe('FORBIDDEN');
    expect((await supportInbox(deps(), who.agent, { q: '0100' })).counts.all).toBe(1);
    // PR 425 follow-up (go-live gate customer 360°): the same number typed in Bengali digits
    expect((await supportInbox(deps(), who.agent, { q: '০১০০' })).counts.all).toBe(1);
    expect((await supportInbox(deps(), who.agent, { q: '৯৯৯৯' })).counts.all).toBe(0);
    overrides.set('customers.phoneMask', { first: 0, last: 4 });
    expect((await supportInbox(deps(), who.agent, {})).rows[0]!.contact.phone).toBe('•••••••0789');
    expect((await supportThread(deps(), who.agent, ids.conv!)).contact.phone).toBe('•••••••0789');
    expect((await supportInbox(deps(), who.lead, {})).rows[0]!.contact.phone).toBe('+1 555 0100 789');
    overrides.delete('customers.phoneMask');
  });

  it('a reply with no connected channel is kept and marked not sent; it answers the customer and the log names who replied', async () => {
    tick(4);
    const r = await replyToConversation(deps(), who.agent, { conversationId: ids.conv, body: 'Yes, M is in stock.', requestKey: 'reply-one-key' });
    expect(r).toMatchObject({ delivery: 'NOT_SENT', failReason: 'CHANNEL_NOT_CONNECTED', replay: false });
    expect(await replyToConversation(deps(), who.agent, { conversationId: ids.conv, body: 'Yes, M is in stock.', requestKey: 'reply-one-key' })).toMatchObject({ messageId: r.messageId, replay: true });
    expect(await code(replyToConversation(deps(), who.agent, { conversationId: ids.conv, body: 'Something else', requestKey: 'reply-one-key' }))).toBe('IDEMPOTENCY_MISMATCH');
    expect(await code(replyToConversation(deps(), who.reader, { conversationId: ids.conv, body: 'x', requestKey: key() }))).toBe('FORBIDDEN');
    expect(await code(replyToConversation(deps(), who.agent, { conversationId: ids.conv, body: '   ', requestKey: key() }))).toBe('EMPTY');
    expect(await code(replyToConversation(deps(), who.agent, { conversationId: ids.conv, body: 'x'.repeat(2001), requestKey: key() }))).toBe('TOO_LONG');
    const c = await t.prisma.conversation.findUniqueOrThrow({ where: { id: ids.conv } });
    expect(c).toMatchObject({ status: 'WAITING', lastDirection: 'OUT', waitingSince: null, firstResponseAt: clock.now, assignedToId: null });
    const th = await supportThread(deps(), who.reader, ids.conv!);
    expect(th.messages.at(-1)).toMatchObject({ direction: 'OUT', sender: { type: 'STAFF', name: 'Sample agent' }, status: 'NOT_SENT' });
    expect(th.events.map((e) => e.kind)).toEqual(['RECEIVED', 'RECEIVED', 'REPLIED', 'STATUS']);
    expect(th.events[2]).toMatchObject({ actor: { type: 'STAFF', name: 'Sample agent' } });
    expect(th.you).toMatchObject({ reply: false, assign: false });
  });

  it('an internal note stays inside: no delivery, no change to what the list shows or the state', async () => {
    const before = await t.prisma.conversation.findUniqueOrThrow({ where: { id: ids.conv } });
    const r = await replyToConversation(deps(), who.other, { conversationId: ids.conv, body: 'Customer prefers navy.', note: true, requestKey: key() });
    expect(r.delivery).toBeNull();
    const after = await t.prisma.conversation.findUniqueOrThrow({ where: { id: ids.conv } });
    expect(after).toMatchObject({ status: before.status, lastPreview: before.lastPreview, lastDirection: 'OUT' });
    const m = await t.prisma.message.findUniqueOrThrow({ where: { id: r.messageId } });
    expect(m).toMatchObject({ isInternalNote: true, direction: 'NOTE', status: null, senderName: 'Sample other' });
  });

  it('a connected channel sends the reply; a failing one marks it failed with the reason', async () => {
    channels = { whatsapp: { kind: 'whatsapp', send: async (m) => ({ ok: true, externalMessageId: `wa-out-${m.messageId.slice(0, 8)}` }) } };
    expect(await replyToConversation(deps(), who.agent, { conversationId: ids.conv, body: 'Sent through the channel', requestKey: key() })).toMatchObject({ delivery: 'SENT', failReason: null });
    channels = { whatsapp: { kind: 'whatsapp', send: async () => ({ ok: false, error: 'outside the reply window' }) } };
    expect(await replyToConversation(deps(), who.agent, { conversationId: ids.conv, body: 'Not this time', requestKey: key() })).toMatchObject({ delivery: 'FAILED', failReason: 'outside the reply window' });
    channels = undefined;
  });

  it('files: a stored file is attached and opened; the settings switch, count, size and kind are kept', async () => {
    const asset = (kind: 'IMAGE' | 'AUDIO', bytes = 1000) =>
      t.prisma.mediaAsset.create({ data: { storeId: S, kind, storage: 'LOCAL_DISK', storageKey: `support/${++n}.bin`, mimeType: kind === 'IMAGE' ? 'image/jpeg' : 'audio/ogg', bytes: BigInt(bytes), checksumSha256: `sum-${n}`, originalFileName: `file-${n}`, tags: [], folder: 'support' } });
    const img = await asset('IMAGE');
    const r = await replyToConversation(deps(), who.agent, { conversationId: ids.conv, body: '', assetIds: [img.id], requestKey: key() });
    const th = await supportThread(deps(), who.agent, ids.conv!);
    const f = th.messages.find((m) => m.id === r.messageId)!.files[0]!;
    expect(f).toMatchObject({ kind: 'IMAGE', ready: true, status: 'STORED', contentType: 'image/jpeg' });
    expect(await supportFile(deps(), who.reader, f.id)).toMatchObject({ assetId: img.id, storageKey: img.storageKey, contentType: 'image/jpeg' });
    const pending = th.messages.flatMap((m) => m.files).find((x) => x.status === 'PENDING')!;
    expect(await code(supportFile(deps(), who.agent, pending.id))).toBe('FILE_PENDING');
    expect(await code(replyToConversation(deps(), who.agent, { conversationId: ids.conv, assetIds: [(await asset('AUDIO')).id], requestKey: key() }))).toBe('FILE_NOT_ALLOWED');
    expect(await code(replyToConversation(deps(), who.agent, { conversationId: ids.conv, assetIds: [(await asset('IMAGE', 11 * 1024 * 1024)).id], requestKey: key() }))).toBe('FILE_NOT_ALLOWED');
    const many = await Promise.all([1, 2, 3, 4, 5].map(() => asset('IMAGE')));
    expect(await code(replyToConversation(deps(), who.agent, { conversationId: ids.conv, assetIds: many.map((a) => a.id), requestKey: key() }))).toBe('TOO_MANY_FILES');
    overrides.set('support.attachments', { ...registry['support.attachments'].default, enabled: false });
    expect(await code(replyToConversation(deps(), who.agent, { conversationId: ids.conv, assetIds: [img.id], requestKey: key() }))).toBe('FILES_OFF');
    overrides.delete('support.attachments');
  });

  it('taking and giving: yourself with reply, someone else only with assign, never someone who cannot reply', async () => {
    expect(await assignConversation(deps(), who.agent, { conversationId: ids.conv, staffId: ids.agent })).toEqual({ changed: true });
    expect((await supportInbox(deps(), who.agent, { view: 'mine' })).counts.mine).toBe(1);
    expect(await code(assignConversation(deps(), who.other, { conversationId: ids.conv, staffId: ids.other }))).toBe('FORBIDDEN');
    expect(await code(assignConversation(deps(), who.lead, { conversationId: ids.conv, staffId: ids.reader }))).toBe('NOT_ASSIGNABLE');
    expect(await code(assignConversation(deps(), who.lead, { conversationId: ids.conv, staffId: ids.elsewhere }))).toBe('NOT_ASSIGNABLE');
    expect(await assignConversation(deps(), who.lead, { conversationId: ids.conv, staffId: ids.other })).toEqual({ changed: true });
    expect(await assignConversation(deps(), who.other, { conversationId: ids.conv, staffId: null })).toEqual({ changed: true });
    expect((await supportStaff(deps(), who.reader)).map((s) => s.name)).toEqual(['Sample agent', 'Sample lead', 'Sample other']);
    const log = (await supportThread(deps(), who.agent, ids.conv!)).events.filter((e) => e.kind === 'ASSIGNED' || e.kind === 'UNASSIGNED');
    expect(log.map((e) => [e.kind, e.actor.name, e.data?.toName ?? null])).toEqual([
      ['ASSIGNED', 'Sample agent', 'Sample agent'],
      ['ASSIGNED', 'Sample lead', 'Sample other'],
      ['UNASSIGNED', 'Sample other', null],
    ]);
  });

  it('"take it on reply" (off by default) makes the person who replied its owner', async () => {
    overrides.set('support.inbox', { ...registry['support.inbox'].default, assignOnReply: true });
    tick(1);
    const x = await inMsg('wa-2', 'Where is my parcel?');
    await replyToConversation(deps(), who.other, { conversationId: x.conversationId, body: 'Checking now.', requestKey: key() });
    expect(await t.prisma.conversation.findUniqueOrThrow({ where: { id: x.conversationId } })).toMatchObject({ assignedToId: ids.other, status: 'WAITING' });
    overrides.delete('support.inbox');
  });

  it('solved, then the customer writes again: it opens again; a stale screen is refused', async () => {
    const th = await supportThread(deps(), who.agent, ids.conv!);
    tick(2);
    expect(await setConversationStatus(deps(), who.agent, { conversationId: ids.conv, status: 'SOLVED', version: th.version })).toEqual({ changed: true, status: 'SOLVED' });
    expect((await t.prisma.conversation.findUniqueOrThrow({ where: { id: ids.conv } })).resolvedAt).toEqual(clock.now);
    expect(await code(setConversationStatus(deps(), who.agent, { conversationId: ids.conv, status: 'OPEN', version: th.version }))).toBe('STALE');
    tick(5);
    const again = await inMsg('wa-1', 'One more question');
    expect(again).toMatchObject({ conversationId: ids.conv, reopened: true, started: false });
    const c = await t.prisma.conversation.findUniqueOrThrow({ where: { id: ids.conv } });
    expect(c).toMatchObject({ status: 'OPEN', resolvedAt: null, waitingSince: clock.now });
    expect((await supportThread(deps(), who.agent, ids.conv!)).events.slice(-2).map((e) => e.kind)).toEqual(['REOPENED', 'RECEIVED']);
  });

  it('the who-did-what log can never be changed or removed', async () => {
    const e = await t.prisma.conversationEvent.findFirstOrThrow({ where: { conversationId: ids.conv } });
    expect(await code(t.prisma.conversationEvent.update({ where: { id: e.id }, data: { actorName: 'someone else' } }))).not.toBe('ok');
    expect(await code(t.prisma.conversationEvent.delete({ where: { id: e.id } }))).not.toBe('ok');
    expect((await t.prisma.conversationEvent.findUniqueOrThrow({ where: { id: e.id } })).actorName).toBe(e.actorName);
  });

  it('Support settings: read with support.read, saved with support.settings, a stale card refused, the save audited', async () => {
    const v = await supportSettingsView(deps(), who.reader);
    const inbox = { pageSize: 50, replyMaxChars: 2000, assignOnReply: false, waitingOnReply: true };
    expect(v['support.inbox'].value).toEqual(inbox);
    const save = (w: Who, value: unknown, version?: string) => saveSupportSetting({ db: t.prisma, settings }, w, { key: 'support.inbox', value, version });
    expect(await code(save(who.agent, { ...inbox, assignOnReply: true }))).toBe('FORBIDDEN');
    expect(await code(save(who.lead, { ...inbox, pageSize: 9 }))).toBe('INVALID_INPUT');
    const after = await save(who.lead, { ...inbox, assignOnReply: true }, v['support.inbox'].version);
    expect(after['support.inbox'].value).toEqual({ ...inbox, assignOnReply: true });
    expect(await code(save(who.lead, inbox, v['support.inbox'].version))).toBe('STALE');
    expect(await t.prisma.auditLog.count({ where: { action: 'support.settings.save', entityId: 'support.inbox' } })).toBe(1);
    overrides.delete('support.inbox');
    // CN-020 (3): the "Call me" card ships off and saves the same way
    expect(v['checkout.callMe'].value).toEqual({ enabled: false, failedTries: 3, idleSeconds: 90, perPhonePerDay: 3 });
    const cm = (value: unknown) => saveSupportSetting({ db: t.prisma, settings }, who.lead, { key: 'checkout.callMe', value, version: v['checkout.callMe'].version });
    expect(await code(cm({ ...v['checkout.callMe'].value, failedTries: 0 }))).toBe('INVALID_INPUT');
    expect((await cm({ ...v['checkout.callMe'].value, enabled: true }))['checkout.callMe'].value.enabled).toBe(true);
    overrides.delete('checkout.callMe');
  });
});
