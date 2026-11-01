// PR 431 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): ticketing. With `support.tickets` off a chat
// opens no ticket; on, a customer's message opens one with both timers, the first answer stops the first timer, waiting
// for the customer stops the clock, "solved" logs how long it took, opening it again re-opens the same ticket and a new
// message after "solved" starts a new one; the owner follows the assignment; a late chat is in the "Late" view and in its
// owner's notifications (and, with no owner, in the notifications of the people who give chats out). Every name and number
// is made up; the clock is a fixed clock.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { assignConversation, clockOf, lateChats, receiveMessage, replyToConversation, setConversationStatus, supportInbox, supportThread, type SupportDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 431 · ticketing (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  const overrides = new Map<string, unknown>();
  const clock = { now: new Date('2026-11-01T04:00:00Z') };
  const tick = (min: number) => (clock.now = new Date(clock.now.getTime() + min * 60_000));
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
    async set<K extends Key>(key: K, value: Value<K>): Promise<void> {
      overrides.set(key, value);
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now });
  const who: Record<'agent' | 'lead' | 'other', Who> = {} as never;
  let n = 0;
  const key = () => `press-${++n}-abcdefgh`;
  const inMsg = (contact: string, text: string) =>
    receiveMessage(deps(), { storeId: S, channel: { kind: 'whatsapp', externalId: 'sample-wa-431' }, contact: { externalId: contact, name: `Sample ${contact}` }, message: { externalId: `m431-${++n}`, text, sentAt: clock.now } });
  const ver = async (id: string) => (await supportThread(deps(), who.lead, id)).version;
  const on = () => overrides.set('support.tickets', { enabled: true, firstResponseMinutes: 10, resolutionHours: 2, notify: true });

  beforeAll(async () => {
    t = await createTestDatabase('support_tickets');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const agent = await role('t431-agent', ['support.read', 'support.reply']);
    const lead = await role('t431-lead', ['support.read', 'support.reply', 'support.assign']);
    for (const [k, r] of [['agent', agent], ['lead', lead], ['other', agent]] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `t431-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: r.id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'whatsapp', externalId: 'sample-wa-431', name: 'WhatsApp (sample)', enabled: true } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('opens no ticket while the switch is off (as it ships)', async () => {
    expect(registry['support.tickets'].default.enabled).toBe(false);
    const r = await inMsg('off', 'Hello');
    expect(await t.prisma.ticket.count({ where: { conversationId: r.conversationId } })).toBe(0);
    const th = await supportThread(deps(), who.lead, r.conversationId);
    expect(th.ticket).toBeNull();
    expect((await t.prisma.conversation.findUniqueOrThrow({ where: { id: r.conversationId } })).slaDueAt).toBeNull();
    expect(await lateChats(deps(), who.lead)).toEqual([]);
  });

  it('runs one ticket: both timers, the first answer, waiting, late, solved with its time, opened again, a new ticket', async () => {
    on();
    const start = clock.now;
    const r = await inMsg('one', 'Is the blue shirt in M?');
    let tk = await t.prisma.ticket.findFirstOrThrow({ where: { conversationId: r.conversationId } });
    expect(tk).toMatchObject({ status: 'OPEN', ownerId: null, firstResponseAt: null, resolvedAt: null });
    expect(tk.firstResponseDueAt).toEqual(new Date(start.getTime() + 10 * 60_000));
    expect(tk.resolutionDueAt).toEqual(new Date(start.getTime() + 2 * 3_600_000));
    expect((await t.prisma.conversation.findUniqueOrThrow({ where: { id: r.conversationId } })).slaDueAt).toEqual(tk.firstResponseDueAt);
    // a second message keeps the one ticket
    tick(1);
    await inMsg('one', 'Size M please');
    expect(await t.prisma.ticket.count({ where: { conversationId: r.conversationId } })).toBe(1);

    // 12 minutes on: the first answer is late — in the Late view, and in the notifications of the people who give chats out
    tick(11);
    let th = await supportThread(deps(), who.lead, r.conversationId);
    expect(th.ticket?.clock).toMatchObject({ stage: 'first', late: true });
    expect((await supportInbox(deps(), who.lead, { view: 'late' })).rows.map((x) => x.id)).toContain(r.conversationId);
    expect((await supportInbox(deps(), who.lead, { view: 'late' })).rows.find((x) => x.id === r.conversationId)?.clock).toMatchObject({ stage: 'first', late: true });
    expect((await lateChats(deps(), who.lead)).map((x) => [x.conversationId, x.stage, x.unowned])).toContainEqual([r.conversationId, 'first', true]);
    expect(await lateChats(deps(), who.agent)).toEqual([]);

    // given to the agent: the ticket's owner follows; the late chat is now the agent's, not the lead's
    await assignConversation(deps(), who.lead, { conversationId: r.conversationId, staffId: who.agent.actor.staffUserId, version: await ver(r.conversationId) });
    expect((await t.prisma.ticket.findUniqueOrThrow({ where: { id: tk.id } })).ownerId).toBe(who.agent.actor.staffUserId);
    expect((await lateChats(deps(), who.agent)).map((x) => x.conversationId)).toEqual([r.conversationId]);
    expect((await lateChats(deps(), who.lead)).map((x) => x.conversationId)).not.toContain(r.conversationId);
    expect(await lateChats(deps(), who.other)).toEqual([]);

    // the agent answers: the first timer stops (late), the solution timer counts — and the chat waits for the customer
    tick(1);
    await replyToConversation(deps(), who.agent, { conversationId: r.conversationId, body: 'Yes, M is in stock.', requestKey: key(), version: await ver(r.conversationId) });
    tk = await t.prisma.ticket.findUniqueOrThrow({ where: { id: tk.id } });
    expect(tk.firstResponseAt).toEqual(clock.now);
    expect(tk.status).toBe('WAITING');
    th = await supportThread(deps(), who.agent, r.conversationId);
    expect(th.ticket).toMatchObject({ firstMinutes: 13, firstLate: true, clock: null, status: 'WAITING' });
    expect((await t.prisma.conversation.findUniqueOrThrow({ where: { id: r.conversationId } })).slaDueAt).toBeNull();
    expect(await lateChats(deps(), who.agent)).toEqual([]);

    // the customer answers: the solution timer counts again
    tick(5);
    await inMsg('one', 'Great, I will order');
    tk = await t.prisma.ticket.findUniqueOrThrow({ where: { id: tk.id } });
    expect(tk.status).toBe('OPEN');
    expect((await t.prisma.conversation.findUniqueOrThrow({ where: { id: r.conversationId } })).slaDueAt).toEqual(tk.resolutionDueAt);
    expect(clockOf(tk, clock.now)).toMatchObject({ stage: 'resolve', late: false });

    // solved after 30 minutes: how long it took is logged
    tick(12);
    await setConversationStatus(deps(), who.agent, { conversationId: r.conversationId, status: 'SOLVED', version: await ver(r.conversationId) });
    th = await supportThread(deps(), who.agent, r.conversationId);
    expect(th.ticket).toMatchObject({ status: 'SOLVED', resolutionMinutes: 30, resolutionLate: false, clock: null, earlier: 0 });
    expect(th.events.find((e) => e.kind === 'TICKET_SOLVED')?.data).toMatchObject({ minutes: 30, late: false });
    expect(th.events.some((e) => e.kind === 'TICKET_OPENED')).toBe(true);

    // opened again by the employee: the same ticket opens again
    await setConversationStatus(deps(), who.agent, { conversationId: r.conversationId, status: 'OPEN', version: await ver(r.conversationId) });
    expect(await t.prisma.ticket.count({ where: { conversationId: r.conversationId } })).toBe(1);
    expect((await t.prisma.ticket.findUniqueOrThrow({ where: { id: tk.id } })).resolvedAt).toBeNull();
    await setConversationStatus(deps(), who.agent, { conversationId: r.conversationId, status: 'SOLVED', version: await ver(r.conversationId) });

    // the customer writes after "solved": a new question, a new ticket with its owner kept from the chat
    tick(60);
    await inMsg('one', 'Where is my parcel?');
    const all = await t.prisma.ticket.findMany({ where: { conversationId: r.conversationId }, orderBy: { createdAt: 'asc' } });
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ status: 'OPEN', ownerId: who.agent.actor.staffUserId, firstResponseAt: null });
    th = await supportThread(deps(), who.agent, r.conversationId);
    expect(th.ticket).toMatchObject({ id: all[1]!.id, earlier: 1, clock: { stage: 'first', late: false } });
  });

  it('keeps an open ticket up to date after the switch goes off, and says nothing while notify is off', async () => {
    on();
    const r = await inMsg('two', 'Hello again');
    overrides.set('support.tickets', { enabled: false, firstResponseMinutes: 10, resolutionHours: 2, notify: true });
    tick(1);
    await replyToConversation(deps(), who.lead, { conversationId: r.conversationId, body: 'Hi!', requestKey: key(), version: await ver(r.conversationId) });
    expect((await t.prisma.ticket.findFirstOrThrow({ where: { conversationId: r.conversationId } })).firstResponseAt).toEqual(clock.now);
    // no new ticket while off
    const r2 = await inMsg('three', 'New chat');
    expect(await t.prisma.ticket.count({ where: { conversationId: r2.conversationId } })).toBe(0);
    // late but notify off: nothing in the bell
    overrides.set('support.tickets', { enabled: true, firstResponseMinutes: 10, resolutionHours: 2, notify: false });
    const r3 = await inMsg('four', 'Anyone?');
    tick(30);
    expect((await supportInbox(deps(), who.lead, { view: 'late' })).rows.map((x) => x.id)).toContain(r3.conversationId);
    expect(await lateChats(deps(), who.lead)).toEqual([]);
  });
});
