// PR 75 follow-up (go-live gate customer 360°, 1 Nov) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the
// contact page's form puts a tagged message in the Support inbox — off as shipped, the same send twice is one message, a
// day's limit per number, the longest message the shop takes, his own order linked and another person's never. Every id,
// name and number is made up; the clock is a fixed clock.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { CONTACT_FORM_CHANNEL, CONTACT_FORM_TAG, contactFormText, sendContactForm, supportChannels, supportInbox, type SupportDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 75 follow-up · the contact page form into the inbox (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  const overrides = new Map<string, unknown>();
  const clock = { now: new Date('2026-11-01T06:10:00Z') };
  const tick = (min: number) => (clock.now = new Date(clock.now.getTime() + min * 60_000));
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now });
  let lead: Who;
  let n = 0;
  const on = (extra: Record<string, unknown> = {}) => overrides.set('pages.contactForm', { ...registry['pages.contactForm'].default, enabled: true, ...extra });
  const send = (extra: Record<string, unknown> = {}) =>
    sendContactForm(deps(), { storeId: S, phone: '+8801700000011', name: 'Sample Customer', text: 'আমার পার্সেল কবে আসবে?', requestKey: `form-sample-${String(++n).padStart(4, '0')}`, lang: 'bn', ...extra });

  beforeAll(async () => {
    t = await createTestDatabase('support_contact_form');
    [S, S2] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 'cf-lead', nameEn: 'cf-lead', nameBn: 'cf-lead', permissions: ['support.read', 'support.reply', 'support.settings'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'cf-lead@example.com', displayName: 'Sample lead', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    lead = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    for (const [number, phone] of [
      ['EX-9001', '+8801700000011'],
      ['EX-9002', '+8801700000099'],
    ] as const) {
      await t.prisma.order.create({ data: { storeId: S, number, phone, source: 'WEBSITE', currency: 'BDT', subtotalMinor: 100_000, totalMinor: 100_000, idempotencyKey: `cf-${number}` } });
    }
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped: nothing is written', async () => {
    expect(registry['pages.contactForm'].default.enabled).toBe(false);
    expect(await code(send())).toBe('CONTACT_FORM_OFF');
    expect(await t.prisma.supportChannel.count({ where: { storeId: S, kind: CONTACT_FORM_CHANNEL.kind } })).toBe(0);
  });

  it('switched on: one tagged message in the inbox, linked to his own order; the same send twice is one message', async () => {
    on();
    const key = 'form-sample-same';
    const first = await send({ requestKey: key, orderNumber: 'EX-9001' });
    expect(first).toMatchObject({ duplicate: false, orderLinked: true });
    expect(await send({ requestKey: key, orderNumber: 'EX-9001' })).toEqual({ conversationId: first.conversationId, duplicate: true, orderLinked: true });
    const conv = await t.prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId }, include: { messages: true, contact: true, channel: true } });
    expect(conv.tags).toContain(CONTACT_FORM_TAG);
    expect(conv.messages).toHaveLength(1);
    expect(conv.messages[0]!.body).toBe(contactFormText('bn', 'আমার পার্সেল কবে আসবে?', 'EX-9001'));
    expect(conv.messages[0]!.body).toMatch(/^অর্ডার EX-9001\n/);
    expect(conv.contact.phone).toBe('+8801700000011');
    expect(conv.channel.enabled).toBe(false);
    const order = await t.prisma.order.findFirstOrThrow({ where: { storeId: S, number: 'EX-9001' } });
    expect(conv.orderId).toBe(order.id);
    // the team sees it in the inbox; it is never listed with the channels that send replies
    expect((await supportInbox(deps(), lead, { view: 'all', channel: 'contactform' })).rows.map((r) => r.id)).toEqual([first.conversationId]);
    expect((await supportChannels(deps(), lead)).rows.some((c) => c.kind === 'contactform')).toBe(false);
  });

  it('another person\'s order number stays words only; past the day limit and past the length it is refused', async () => {
    on({ perPhonePerDay: 3, maxChars: 100 });
    tick(5);
    const r = await sendContactForm(deps(), { storeId: S, phone: '+8801700000022', text: 'Where is my order?', orderNumber: 'EX-9002', requestKey: 'form-sample-other', lang: 'en' });
    expect(r.orderLinked).toBe(false);
    const conv = await t.prisma.conversation.findUniqueOrThrow({ where: { id: r.conversationId }, include: { messages: true } });
    expect(conv.orderId).toBeNull();
    expect(conv.messages[0]!.body).toBe('Order EX-9002\nWhere is my order?');
    expect(await code(send({ text: 'x'.repeat(101) }))).toBe('TOO_LONG');
    await send();
    await send();
    expect(await code(send())).toBe('TOO_MANY');
    tick(24 * 60 + 1);
    expect((await send()).duplicate).toBe(false);
    expect(await t.prisma.supportChannel.count({ where: { storeId: S, kind: CONTACT_FORM_CHANNEL.kind } })).toBe(1);
  });

  it('checks what it is given and keeps each store apart', async () => {
    on();
    expect(await code(send({ phone: '01700000011' }))).toBe('INVALID_INPUT');
    expect(await code(send({ text: '   ' }))).toBe('INVALID_INPUT');
    expect(await code(send({ requestKey: 'bad key!' }))).toBe('INVALID_INPUT');
    // store 2 has no EX-9001: nothing is linked there
    const other = await sendContactForm(deps(), { storeId: S2, phone: '+8801700000011', text: 'Hello', orderNumber: 'EX-9001', requestKey: 'form-sample-s2', lang: 'en' });
    const conv = await t.prisma.conversation.findUniqueOrThrow({ where: { id: other.conversationId } });
    expect(conv.storeId).toBe(S2);
    expect(conv.orderId).toBeNull();
  });
});
