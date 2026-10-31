// CN-020 (3) · SIM-F-046 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): "Call me" from the checkout
// lands as a tagged call-back in the Support inbox — off as shipped, one message for the same tap within the hour, a
// day's limit per number, the channel made once and never listed with the sending channels. Every id, name and number
// is made up; the clock is a fixed clock.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { CALLBACK_CHANNEL, CALLBACK_TAG, callBackText, requestCallBack, supportChannels, supportInbox, type SupportDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('SIM-F-046 · "Call me" from the checkout (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  const overrides = new Map<string, unknown>();
  const clock = { now: new Date('2026-10-31T06:10:00Z') };
  const tick = (min: number) => (clock.now = new Date(clock.now.getTime() + min * 60_000));
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now });
  let lead: Who;
  const on = (extra: Record<string, unknown> = {}) => overrides.set('checkout.callMe', { ...registry['checkout.callMe'].default, enabled: true, ...extra });
  const tap = (extra: Record<string, unknown> = {}) =>
    requestCallBack(deps(), { storeId: S, phone: '+8801700000001', name: 'Sample Customer', reason: 'tries', field: 'address', visitorId: 'visitor-sample-0001', lang: 'bn', ...extra });

  beforeAll(async () => {
    t = await createTestDatabase('support_callback');
    [S, S2] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 'cb-lead', nameEn: 'cb-lead', nameBn: 'cb-lead', permissions: ['support.read', 'support.reply', 'support.settings'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'cb-lead@example.com', displayName: 'Sample lead', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    lead = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped: nothing is written', async () => {
    expect(registry['checkout.callMe'].default.enabled).toBe(false);
    expect(await code(tap())).toBe('CALLBACK_OFF');
    expect(await t.prisma.supportChannel.count({ where: { storeId: S, kind: CALLBACK_CHANNEL.kind } })).toBe(0);
  });

  it('switched on: one tagged call-back in the inbox with a line in his language; the same tap within the hour is the same one', async () => {
    on();
    const first = await tap();
    expect(first.duplicate).toBe(false);
    const again = await tap();
    expect(again).toEqual({ conversationId: first.conversationId, duplicate: true });
    const conv = await t.prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId }, include: { messages: true, contact: true, channel: true } });
    expect(conv.tags).toContain(CALLBACK_TAG);
    expect(conv.messages).toHaveLength(1);
    expect(conv.messages[0]!.body).toBe(callBackText('bn', 'tries', 'address'));
    expect(conv.messages[0]!.body).not.toMatch(/\{field\}/);
    expect(conv.contact.phone).toBe('+8801700000001');
    expect(conv.channel.kind).toBe('callback');
    expect(conv.channel.enabled).toBe(false);
    // the team sees it in the inbox, filtered by the call-back channel too
    const inbox = await supportInbox(deps(), lead, { view: 'all', channel: 'callback' });
    expect(inbox.rows.map((r) => r.id)).toEqual([first.conversationId]);
    // never listed with the channels that send replies
    expect((await supportChannels(deps(), lead)).rows.some((c) => c.kind === 'callback')).toBe(false);
  });

  it('an hour later a new tap adds a line to the same conversation; past the day limit it is refused', async () => {
    on({ perPhonePerDay: 2 });
    tick(61);
    const second = await tap({ reason: 'idle', field: undefined, lang: 'en' });
    expect(second.duplicate).toBe(false);
    const msgs = await t.prisma.message.findMany({ where: { conversationId: second.conversationId }, orderBy: { createdAt: 'asc' } });
    expect(msgs).toHaveLength(2);
    expect(msgs[1]!.body).toBe(callBackText('en', 'idle'));
    tick(61);
    expect(await code(tap())).toBe('TOO_MANY');
    // the channel is made once per store
    expect(await t.prisma.supportChannel.count({ where: { storeId: S, kind: 'callback' } })).toBe(1);
  });

  it('checks what it is given and keeps each store apart', async () => {
    on();
    expect(await code(tap({ phone: '01700000001' }))).toBe('INVALID_INPUT');
    expect(await code(tap({ reason: 'bored' }))).toBe('INVALID_INPUT');
    const other = await requestCallBack(deps(), { storeId: S2, phone: '+8801700000001', reason: 'idle', visitorId: 'visitor-sample-0001', lang: 'en' });
    const conv = await t.prisma.conversation.findUniqueOrThrow({ where: { id: other.conversationId } });
    expect(conv.storeId).toBe(S2);
  });
});
