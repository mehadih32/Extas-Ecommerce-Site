// PR 434 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the support block list, own chats only and
// numbers masked in messages. Off as it ships, nothing changes and blocking is refused; on, only a person with
// support.block puts a chat's person (every channel joined to them) on the list with a reason — logged and audited,
// nothing deleted: their new message is kept but opens no ticket, their chats leave every working view for "Blocked",
// the shop's reply is refused (a note is still kept); taken off, all is back. Own chats only: an employee without
// support.assign sees and answers only their own and nobody's chats. Numbers in messages are masked for a reader without
// customers.phone. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { assignConversation, blockChatPerson, receiveMessage, replyToConversation, setConversationStatus, skipFollowUp, supportDraft, supportInbox, supportThread, unblockChatPerson, type SupportDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 434 · block list and privacy (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  const overrides = new Map<string, unknown>();
  let clock = new Date('2026-11-01T06:00:00Z').getTime();
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => new Date((clock += 1000)) });
  const who: Record<'owner' | 'agent' | 'other', Who> = {} as never;
  let n = 0;
  const say = (contact: string, text: string, kind: 'whatsapp' | 'messenger' = 'whatsapp') =>
    receiveMessage(deps(), { storeId: S, channel: { kind, externalId: `sample-${kind}-434` }, contact: { externalId: contact, name: `Sample ${contact}` }, message: { externalId: `m434-${++n}`, text, sentAt: new Date((clock += 1000)) } });
  const version = async (id: string, w: Who = who.owner) => (await supportThread(deps(), w, id)).version;
  const ids = async (w: Who, view: string) => (await supportInbox(deps(), w, { view })).rows.map((r) => r.id);

  beforeAll(async () => {
    t = await createTestDatabase('support_privacy');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const roles = {
      owner: await createRole(t.prisma, SYSTEM, { key: 't434-owner', nameEn: 'owner', nameBn: 'owner', permissions: ['support.read', 'support.reply', 'support.assign', 'support.block', 'customers.phone'] }),
      agent: await createRole(t.prisma, SYSTEM, { key: 't434-agent', nameEn: 'agent', nameBn: 'agent', permissions: ['support.read', 'support.reply'] }),
    };
    for (const [k, r] of [['owner', roles.owner], ['agent', roles.agent], ['other', roles.agent]] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `t434-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: r.id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    for (const kind of ['whatsapp', 'messenger'] as const) await t.prisma.supportChannel.create({ data: { storeId: S, kind, externalId: `sample-${kind}-434`, name: `${kind} (sample)`, enabled: true } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('blocking is refused while the list is off (as it ships), and nobody counts as blocked', async () => {
    expect(registry['support.blockList'].default.enabled).toBe(false);
    const r = await say('spam', 'buy followers now');
    await expect(blockChatPerson(deps(), who.owner, { conversationId: r.conversationId, reason: 'Sample spam' })).rejects.toMatchObject({ code: 'BLOCK_OFF' });
    const box = await supportInbox(deps(), who.owner, { view: 'blocked' });
    expect([box.blockList, box.rows.length]).toEqual([false, 0]);
  });

  it('on: only support.block blocks the whole person, logged and audited; their chats move to Blocked; no ticket, no reply; nothing deleted; taken off again', async () => {
    overrides.set('support.blockList', { enabled: true });
    overrides.set('support.tickets', { ...registry['support.tickets'].default, enabled: true });
    const wa = await say('rude', 'first message');
    const fb = await say('rude-fb', 'same person on messenger', 'messenger');
    const waContact = (await t.prisma.conversation.findUniqueOrThrow({ where: { id: wa.conversationId } })).contactId;
    await t.prisma.supportContact.updateMany({ where: { storeId: S, externalId: 'rude-fb' }, data: { mergedIntoId: waContact } });

    await expect(blockChatPerson(deps(), who.agent, { conversationId: wa.conversationId, reason: 'Sample' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(blockChatPerson(deps(), who.owner, { conversationId: wa.conversationId, reason: '  ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(blockChatPerson(deps(), who.owner, { conversationId: wa.conversationId, reason: 'Sample abuse', version: 'stale' })).rejects.toMatchObject({ code: 'STALE' });
    expect(await blockChatPerson(deps(), who.owner, { conversationId: wa.conversationId, reason: 'Sample abuse', version: await version(wa.conversationId) })).toEqual({ blocked: true, contacts: 2 });
    expect(await t.prisma.conversationEvent.findFirst({ where: { conversationId: wa.conversationId, kind: 'BLOCKED' } })).toMatchObject({ actorStaffId: who.owner.actor.staffUserId, data: { contacts: 2, reason: 'Sample abuse' } });
    expect(await t.prisma.auditLog.count({ where: { action: 'support.block', entityId: waContact } })).toBe(1);

    for (const id of [wa.conversationId, fb.conversationId]) {
      expect(await ids(who.owner, 'open')).not.toContain(id);
      expect(await ids(who.owner, 'all')).not.toContain(id);
      expect(await ids(who.owner, 'blocked')).toContain(id);
    }
    const th = await supportThread(deps(), who.owner, wa.conversationId);
    expect(th.blocked).toMatchObject({ reason: 'Sample abuse' });
    expect(th.you).toMatchObject({ block: true, reply: false });
    expect((await supportThread(deps(), who.agent, wa.conversationId)).you.block).toBe(false);

    // their next message is kept, opens no ticket, stays in Blocked
    const tickets = await t.prisma.ticket.count({ where: { conversationId: wa.conversationId } });
    await say('rude', 'again');
    expect(await t.prisma.message.count({ where: { conversationId: wa.conversationId, direction: 'IN' } })).toBe(2);
    expect(await t.prisma.ticket.count({ where: { conversationId: wa.conversationId } })).toBe(tickets);
    expect(await ids(who.owner, 'blocked')).toContain(wa.conversationId);
    await expect(replyToConversation(deps(), who.owner, { conversationId: wa.conversationId, body: 'Sample reply', requestKey: 'k434-reply-abcdefgh' })).rejects.toMatchObject({ code: 'BLOCKED' });
    expect((await replyToConversation(deps(), who.owner, { conversationId: wa.conversationId, body: 'Sample note', note: true, requestKey: 'k434-note-abcdefgh' })).delivery).toBeNull();

    // the list switched off: nobody counts as blocked, the list is kept
    overrides.set('support.blockList', { enabled: false });
    expect(await ids(who.owner, 'open')).toContain(wa.conversationId);
    expect((await supportThread(deps(), who.owner, wa.conversationId)).blocked).toBeNull();
    overrides.set('support.blockList', { enabled: true });
    expect(await ids(who.owner, 'blocked')).toContain(wa.conversationId);

    expect(await unblockChatPerson(deps(), who.owner, { conversationId: fb.conversationId })).toEqual({ blocked: false, contacts: 2 });
    expect(await ids(who.owner, 'open')).toEqual(expect.arrayContaining([wa.conversationId, fb.conversationId]));
    expect(await t.prisma.supportContact.count({ where: { storeId: S, blockedAt: { not: null } } })).toBe(0);
    expect((await replyToConversation(deps(), who.owner, { conversationId: wa.conversationId, body: 'Sample reply', requestKey: 'k434-reply2-abcdefgh' })).replay).toBe(false);
    expect(await t.prisma.conversationEvent.count({ where: { conversationId: fb.conversationId, kind: 'UNBLOCKED' } })).toBe(1);
  });

  it('own chats only: an employee without support.assign sees and answers only their own and nobody\'s chats', async () => {
    const mine = await say('own-1', 'for the agent');
    const theirs = await say('own-2', 'for the other');
    const nobody = await say('own-3', 'for nobody');
    await assignConversation(deps(), who.owner, { conversationId: mine.conversationId, staffId: who.agent.actor.staffUserId });
    await assignConversation(deps(), who.owner, { conversationId: theirs.conversationId, staffId: who.other.actor.staffUserId });
    expect(await ids(who.agent, 'all')).toEqual(expect.arrayContaining([mine.conversationId, theirs.conversationId, nobody.conversationId]));
    overrides.set('support.privacy', { ownChatsOnly: true, maskNumbersInText: false });
    const seen = await ids(who.agent, 'all');
    expect(seen).toEqual(expect.arrayContaining([mine.conversationId, nobody.conversationId]));
    expect(seen).not.toContain(theirs.conversationId);
    await expect(supportThread(deps(), who.agent, theirs.conversationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(replyToConversation(deps(), who.agent, { conversationId: theirs.conversationId, body: 'Sample', requestKey: 'k434-own-abcdefgh' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // a person who gives chats out still sees every chat
    expect(await ids(who.owner, 'all')).toContain(theirs.conversationId);
    overrides.delete('support.privacy');
  });

  it('own chats only holds on the actions too: assign, status, AI draft and follow-ups refuse another employee\'s chat as not there', async () => {
    const mine = await say('own-act-1', 'mine to act on');
    const theirs = await say('own-act-2', 'the other one\'s');
    const nobody = await say('own-act-3', 'nobody\'s yet');
    await assignConversation(deps(), who.owner, { conversationId: mine.conversationId, staffId: who.agent.actor.staffUserId });
    await assignConversation(deps(), who.owner, { conversationId: theirs.conversationId, staffId: who.other.actor.staffUserId });
    overrides.set('support.privacy', { ownChatsOnly: true, maskNumbersInText: false });
    overrides.set('support.drafts', { ...registry['support.drafts'].default, enabled: true });
    const agent = who.agent.actor.staffUserId;
    // another employee's chat: not there (not FORBIDDEN, and not even "no change")
    await expect(assignConversation(deps(), who.agent, { conversationId: theirs.conversationId, staffId: agent })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(assignConversation(deps(), who.agent, { conversationId: theirs.conversationId, staffId: who.other.actor.staffUserId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(assignConversation(deps(), who.agent, { conversationId: theirs.conversationId, staffId: null })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(setConversationStatus(deps(), who.agent, { conversationId: theirs.conversationId, status: 'SOLVED' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(supportDraft(deps(), who.agent, theirs.conversationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(skipFollowUp(deps(), who.agent, { conversationId: theirs.conversationId, followUpId: '00000000-0000-4000-8000-000000000434' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // nothing changed on it
    const still = await t.prisma.conversation.findUniqueOrThrow({ where: { id: theirs.conversationId }, select: { status: true, assignedToId: true } });
    expect(still).toEqual({ status: 'OPEN', assignedToId: who.other.actor.staffUserId });
    // their own and nobody's chats still work
    expect(await setConversationStatus(deps(), who.agent, { conversationId: mine.conversationId, status: 'SOLVED' })).toEqual({ changed: true, status: 'SOLVED' });
    expect(await supportDraft(deps(), who.agent, mine.conversationId)).not.toBeNull();
    expect(await assignConversation(deps(), who.agent, { conversationId: nobody.conversationId, staffId: agent })).toEqual({ changed: true });
    expect(await assignConversation(deps(), who.agent, { conversationId: nobody.conversationId, staffId: null })).toEqual({ changed: true });
    // a person who gives chats out may still act on any chat
    expect(await setConversationStatus(deps(), who.owner, { conversationId: theirs.conversationId, status: 'SOLVED' })).toEqual({ changed: true, status: 'SOLVED' });
    // switched off (as it ships), the other one's chat is reachable again
    overrides.delete('support.privacy');
    expect(await setConversationStatus(deps(), who.agent, { conversationId: theirs.conversationId, status: 'OPEN' })).toEqual({ changed: true, status: 'OPEN' });
    overrides.delete('support.drafts');
  });

  it('numbers typed in messages are masked for a reader without customers.phone (switched on)', async () => {
    const r = await say('typed', 'amar number 01712345678 e call din');
    expect((await supportThread(deps(), who.agent, r.conversationId)).messages[0]!.body).toContain('01712345678');
    overrides.set('support.privacy', { ownChatsOnly: false, maskNumbersInText: true });
    const masked = await supportThread(deps(), who.agent, r.conversationId);
    expect(masked.messages[0]!.body).toBe('amar number 017•••••678 e call din');
    expect(masked.subject).not.toContain('01712345678');
    expect((await supportInbox(deps(), who.agent, { view: 'open' })).rows.find((x) => x.id === r.conversationId)!.lastPreview).not.toContain('01712345678');
    expect((await supportThread(deps(), who.owner, r.conversationId)).messages[0]!.body).toContain('01712345678');
    // the kept message itself is never changed
    expect(await t.prisma.message.count({ where: { conversationId: r.conversationId, body: { contains: '01712345678' } } })).toBe(1);
  });
});
