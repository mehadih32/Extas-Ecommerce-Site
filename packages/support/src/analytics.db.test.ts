// PR 436 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): support analytics. Three chats on two channels
// in the period and one before it: the first answer and the solution in minutes (middle and average), late tickets
// (answered late, never answered), chat → order conversion with an order made in the chat (credited to its maker) and
// one from a product link (credited to the person who sent it), a draft order never counted, sales only the delivered
// order; a person who gives chats out sees the team, the others only their own row; the period in shop days, refused
// when too long or the wrong way round. Every name and number is made up; the clock is a fixed clock.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { receiveMessage, replyToConversation, setConversationStatus, supportAnalytics, supportThread, type SupportDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 436 · support analytics (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  const overrides = new Map<string, unknown>([['support.tickets', { enabled: true, firstResponseMinutes: 10, resolutionHours: 2, notify: false }]]);
  const clock = { now: new Date('2026-10-31T04:00:00Z') };
  const tick = (min: number) => (clock.now = new Date(clock.now.getTime() + min * 60_000));
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now });
  const who: Record<'lead' | 'a' | 'b', Who> = {} as never;
  const id = (k: 'lead' | 'a' | 'b') => who[k].actor.staffUserId!;
  let n = 0;
  const say = (channel: string, contact: string, text: string) =>
    receiveMessage(deps(), { storeId: S, channel: { kind: channel, externalId: `sample-${channel}-436` }, contact: { externalId: contact, name: `Sample ${contact}` }, message: { externalId: `m436-${++n}`, text, sentAt: clock.now } });
  const ver = async (c: string) => (await supportThread(deps(), who.lead, c)).version;
  const reply = async (k: 'lead' | 'a' | 'b', c: string, body: string) => replyToConversation(deps(), who[k], { conversationId: c, body, requestKey: `r436-${++n}-abcdefgh`, version: await ver(c) });
  const order = async (number: string, status: 'DRAFT' | 'PLACED' | 'DELIVERED', totalMinor: number) =>
    t.prisma.order.create({
      data: { storeId: S, number, source: 'WHATSAPP', currency: 'BDT', status, placedAt: clock.now, subtotalMinor: totalMinor, discountMinor: 0, deliveryChargeMinor: 0, totalMinor, paymentMethod: 'COD', phone: '+8801700004360', idempotencyKey: `a436-${number}` }, // hardcode-ok: made-up
    });
  const chats: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase('support_analytics');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const agent = await role('t436-agent', ['support.read', 'support.reply']);
    const lead = await role('t436-lead', ['support.read', 'support.reply', 'support.assign']);
    for (const [k, r] of [['lead', lead], ['a', agent], ['b', agent]] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `t436-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: r.id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    for (const kind of ['whatsapp', 'messenger']) await t.prisma.supportChannel.create({ data: { storeId: S, kind, externalId: `sample-${kind}-436`, name: `${kind} (sample)`, enabled: true } });

    // before the period (40 days ago): a chat answered — never counted
    clock.now = new Date('2026-09-20T04:00:00Z');
    chats.old = (await say('whatsapp', 'old', 'Old question')).conversationId;
    tick(3);
    await reply('a', chats.old, 'Old answer');

    // chat 1 (WhatsApp): A answers in 4 minutes and solves it in 24; an order made in the chat by A, delivered
    clock.now = new Date('2026-10-31T04:00:00Z');
    chats.c1 = (await say('whatsapp', 'c1', 'Is the polo in M?')).conversationId;
    tick(4);
    await reply('a', chats.c1, 'Yes, M is in stock.');
    tick(20);
    await setConversationStatus(deps(), who.a, { conversationId: chats.c1, status: 'SOLVED', version: await ver(chats.c1) });
    const o1 = await order('EX4361', 'DELIVERED', 150_000);
    await t.prisma.conversationEvent.create({ data: { storeId: S, conversationId: chats.c1, kind: 'ORDER_CREATED', actorType: 'STAFF', actorStaffId: id('a'), data: { orderId: o1.id, number: o1.number }, createdAt: clock.now } });

    // chat 2 (WhatsApp): B answers after 16 minutes (late); the customer orders from a product link B sent (placed)
    chats.c2 = (await say('whatsapp', 'c2', 'Price of the blue shirt?')).conversationId;
    tick(16);
    await reply('b', chats.c2, 'It is on the site.');
    await reply('b', chats.c2, 'Here is the link.');
    const o2 = await order('EX4362', 'PLACED', 90_000);
    await t.prisma.supportProductShare.create({ data: { storeId: S, conversationId: chats.c2, productId: '00000000-0000-4000-8000-000000000436', refCode: 'ref436sample', sentById: id('b'), clickedAt: clock.now, orderId: o2.id } });
    await t.prisma.conversationEvent.create({ data: { storeId: S, conversationId: chats.c2, kind: 'PRODUCT_ORDERED', actorType: 'CUSTOMER', data: { ref: 'ref436sample', orderId: o2.id, number: o2.number }, createdAt: clock.now } });

    // chat 3 (Messenger): nobody answers (late); a draft order made in it is never counted
    chats.c3 = (await say('messenger', 'c3', 'Hello?')).conversationId;
    const o3 = await order('EX4363', 'DRAFT', 50_000);
    await t.prisma.conversationEvent.create({ data: { storeId: S, conversationId: chats.c3, kind: 'ORDER_CREATED', actorType: 'STAFF', actorStaffId: id('lead'), data: { orderId: o3.id, number: o3.number }, createdAt: clock.now } });
    tick(60);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('the team: totals, every channel and every person; medians, late tickets, conversion and sales (delivered only)', async () => {
    const r = await supportAnalytics(deps(), who.lead, {});
    expect(r).toMatchObject({ scope: 'team', days: 30, from: '2026-10-02', to: '2026-10-31' });
    expect(r.total).toMatchObject({ chats: 3, replies: 3, tickets: 3, answered: 2, firstMedian: 10, firstAverage: 10, solved: 1, resolveMedian: 24, late: 2, orderChats: 2, orders: 2, orderedMinor: 240_000, delivered: 1, salesMinor: 150_000 });
    expect(r.total.conversion).toBeCloseTo(2 / 3);
    expect(r.total.lateRate).toBeCloseTo(2 / 3);
    const wa = r.byChannel.find((c) => c.channelKind === 'whatsapp')!;
    const fb = r.byChannel.find((c) => c.channelKind === 'messenger')!;
    expect(r.byChannel[0]).toBe(wa);
    expect(wa).toMatchObject({ kind: 'channel', label: 'whatsapp (sample)', chats: 2, replies: 3, tickets: 2, late: 1, orderChats: 2, conversion: 1, orders: 2, delivered: 1 });
    expect(fb).toMatchObject({ chats: 1, replies: 0, tickets: 1, late: 1, orders: 0, conversion: 0, firstMedian: null });
    const a = r.byPerson.find((x) => x.key === id('a'))!;
    const b = r.byPerson.find((x) => x.key === id('b'))!;
    expect(a).toMatchObject({ kind: 'person', label: 'Sample a', chats: 1, replies: 1, tickets: 1, firstMedian: 4, resolveMedian: 24, late: 0, orders: 1, conversion: 1, salesMinor: 150_000 });
    expect(b).toMatchObject({ label: 'Sample b', chats: 1, replies: 2, tickets: 1, firstMedian: 16, late: 1, orders: 1, orderedMinor: 90_000, delivered: 0, salesMinor: 0, conversion: 1 });
    // most answers first; the lead made only a draft: no row
    expect(r.byPerson.map((x) => x.key)).toEqual([id('b'), id('a')]);
  });

  it('an employee without "give chats out" sees only their own row: no channels, the total is theirs', async () => {
    const r = await supportAnalytics(deps(), who.a, { days: 7 });
    expect(r).toMatchObject({ scope: 'own', days: 7, byChannel: [] });
    expect(r.byPerson).toHaveLength(1);
    expect(r.byPerson[0]).toMatchObject({ key: id('a'), label: 'Sample a', chats: 1, orders: 1 });
    expect(r.total).toMatchObject({ chats: 1, replies: 1, orders: 1, salesMinor: 150_000 });
  });

  it('a from–to in shop days: the old chat only when the period reaches it; refused when too long or the wrong way round', async () => {
    const old = await supportAnalytics(deps(), who.lead, { from: '2026-09-01', to: '2026-09-30' });
    expect(old).toMatchObject({ days: null, total: { chats: 1, replies: 1, tickets: 1, orders: 0 } });
    // the shop's day starts at local midnight (Asia/Dhaka, UTC+6)
    expect(old.period.from.toISOString()).toBe('2026-08-31T18:00:00.000Z');
    expect((await supportAnalytics(deps(), who.lead, { from: '2026-09-01', to: '2026-10-31' })).total.chats).toBe(4);
    await expect(supportAnalytics(deps(), who.lead, { from: '2025-01-01', to: '2026-10-31' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(supportAnalytics(deps(), who.lead, { from: '2026-10-31', to: '2026-10-01' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(supportAnalytics(deps(), who.lead, { from: '2026-02-30', to: '2026-03-05' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(supportAnalytics(deps(), who.lead, { from: '2026-02-01', to: '2026-02-31' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(supportAnalytics(deps(), who.lead, { from: '2026-13-01', to: '2026-13-05' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(supportAnalytics(deps(), who.lead, { from: '2026-10-01' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(supportAnalytics(deps(), who.lead, { days: 12 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('needs support.read', async () => {
    const u = await t.prisma.staffUser.create({ data: { email: 't436-none@example.com', displayName: 'Sample none', passwordHash: 'not-a-login' } });
    await expect(supportAnalytics(deps(), { actor: { staffUserId: u.id }, storeId: S }, {})).rejects.toBeTruthy();
  });
});
