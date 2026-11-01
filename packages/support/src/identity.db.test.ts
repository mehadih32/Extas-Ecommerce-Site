// PR 427 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): who is writing. Off as it ships, nothing
// changes; on, a WhatsApp chat is linked to the customer with its number, a Messenger customer who types his number in
// Bengali digits is linked too and joined with his WhatsApp chat as one person; two customers are never joined; the
// team sets a number by hand, unlinks a customer and says "not the same person", each in the log and the audit, and a
// chat set by hand is never changed automatically again. Every name and number is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { receiveMessage, setContactPhone, splitContact, supportThread, unlinkContactCustomer, type SupportDeps, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

// hardcode-ok: made-up test numbers
const RAHIM = '+8801712345678';
const KARIM = '+8801812345678';
const LATER = '+8801912345678';

describe.skipIf(!HAS_TEST_DB)('PR 427 · who is writing (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  const overrides = new Map<string, unknown>();
  const clock = { now: new Date('2026-11-01T06:00:00Z') };
  const tick = () => (clock.now = new Date(clock.now.getTime() + 60_000));
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => clock.now });
  const who: Record<'fixer' | 'agent', Who> = {} as never;
  const cust: Record<string, string> = {};
  let n = 0;
  const msg = (kind: 'whatsapp' | 'messenger' | 'livechat', contact: string, text: string, phone?: string) => {
    tick();
    return receiveMessage(deps(), { storeId: S, channel: { kind, externalId: `sample-${kind}` }, contact: { externalId: contact, name: `Sample ${contact}`, ...(phone ? { phone } : {}) }, message: { externalId: `m-${++n}`, text, sentAt: clock.now } });
  };
  const contactOf = async (conversationId: string) => (await t.prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } })).contact;
  const kinds = async (conversationId: string) => (await t.prisma.conversationEvent.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })).map((e) => e.kind);
  const on = (v: Partial<Value<'support.identity'>> = {}) => overrides.set('support.identity', { enabled: true, fromText: true, autoLink: true, ...v });

  beforeAll(async () => {
    t = await createTestDatabase('support_identity');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = (k: string, permissions: string[]) => createRole(t.prisma, SYSTEM, { key: k, nameEn: k, nameBn: k, permissions });
    const roles = { fixer: await role('t-fixer', ['support.read', 'support.reply', 'support.identity']), agent: await role('t-agent', ['support.read', 'support.reply']) };
    for (const k of ['fixer', 'agent'] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    for (const kind of ['whatsapp', 'messenger', 'livechat']) await t.prisma.supportChannel.create({ data: { storeId: S!, kind, externalId: `sample-${kind}`, name: kind, enabled: true } });
    cust.rahim = (await t.prisma.customer.create({ data: { storeId: S!, phone: RAHIM, name: 'Rahim' } })).id;
    cust.karim = (await t.prisma.customer.create({ data: { storeId: S!, phone: KARIM, name: 'Karim' } })).id;
    cust.later = (await t.prisma.customer.create({ data: { storeId: S!, phone: LATER, name: 'Later' } })).id;
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('off as it ships: a number in the words is not taken and nobody is linked', async () => {
    const r = await msg('messenger', 'psid-off', 'amar number 01712345678');
    const c = await contactOf(r.conversationId);
    expect(c).toMatchObject({ phone: null, customerId: null, mergedIntoId: null });
    expect(await kinds(r.conversationId)).toEqual(['RECEIVED']);
  });

  it("WhatsApp: the chat's own id is the number; its customer is linked, the log says so without the number", async () => {
    on();
    const r = await msg('whatsapp', '8801712345678', 'Polo ta ache?');
    const c = await contactOf(r.conversationId);
    expect(c).toMatchObject({ phone: RAHIM, customerId: cust.rahim });
    expect((await t.prisma.conversation.findUniqueOrThrow({ where: { id: r.conversationId } })).customerId).toBe(cust.rahim);
    expect(await kinds(r.conversationId)).toEqual(['RECEIVED', 'IDENTITY_PHONE', 'IDENTITY_CUSTOMER']);
    const ev = await t.prisma.conversationEvent.findFirstOrThrow({ where: { conversationId: r.conversationId, kind: 'IDENTITY_PHONE' } });
    expect(ev).toMatchObject({ actorType: 'SYSTEM', data: { via: 'channel' } });
    expect(JSON.stringify(ev.data)).not.toContain('171234');
  });

  it('Messenger: a number typed in Bengali digits links the customer and joins the WhatsApp chat as one person', async () => {
    const first = await msg('messenger', 'psid-rahim', 'bhai order korte chai');
    expect((await contactOf(first.conversationId)).phone).toBeNull();
    const r = await msg('messenger', 'psid-rahim', 'amar number ০১৭১২-৩৪৫৬৭৮');
    const c = await contactOf(r.conversationId);
    const wa = await t.prisma.supportContact.findFirstOrThrow({ where: { externalId: '8801712345678' } });
    expect(c).toMatchObject({ phone: RAHIM, customerId: cust.rahim, mergedIntoId: wa.id });
    expect(wa.mergedIntoId).toBeNull();
    expect(await kinds(r.conversationId)).toEqual(['RECEIVED', 'RECEIVED', 'IDENTITY_PHONE', 'IDENTITY_CUSTOMER', 'IDENTITY_MERGED']);
    const th = await supportThread(deps(), who.agent, r.conversationId);
    expect(th.person.contacts).toBe(2);
    expect(th.person.chats.map((x) => x.channel.kind)).toEqual(['whatsapp']);
    expect(th.you.identity).toBe(false);
    // the site's chat with the same number written later is the same person too
    const live = await msg('livechat', 'visitor-r', 'ami 01712 345 678 theke');
    expect(await contactOf(live.conversationId)).toMatchObject({ customerId: cust.rahim, mergedIntoId: wa.id });
    expect((await supportThread(deps(), who.fixer, live.conversationId)).person.chats).toHaveLength(2);
  });

  it('two different customers are never one person; fromText off reads no words', async () => {
    const k = await msg('whatsapp', '8801812345678', 'hello');
    expect(await contactOf(k.conversationId)).toMatchObject({ customerId: cust.karim, mergedIntoId: null });
    // a site visitor known as Karim's chat who then types Rahim's number: linked by number, never joined with Rahim
    const v = await msg('livechat', 'visitor-k', 'size?');
    await t.prisma.supportContact.update({ where: { id: (await contactOf(v.conversationId)).id }, data: { customerId: cust.karim } });
    const v2 = await msg('livechat', 'visitor-k', 'bhai er number 01712345678');
    const vc = await contactOf(v2.conversationId);
    expect(vc.customerId).toBe(cust.karim);
    expect(vc.mergedIntoId).toBe((await t.prisma.supportContact.findFirstOrThrow({ where: { externalId: '8801812345678' } })).id);
    on({ fromText: false });
    const q = await msg('messenger', 'psid-quiet', '01912345678');
    expect(await contactOf(q.conversationId)).toMatchObject({ phone: null, customerId: null });
    on();
  });

  it('by hand: set the number (needs support.identity), unlink the customer, "not the same person"; all audited and in the log', async () => {
    const r = await msg('messenger', 'psid-hand', 'kemon achen');
    const th = await supportThread(deps(), who.fixer, r.conversationId);
    expect(th.you.identity).toBe(true);
    expect(await code(setContactPhone(deps(), who.agent, { conversationId: r.conversationId, phone: '01912345678' }))).toBe('FORBIDDEN');
    expect(await code(setContactPhone(deps(), who.fixer, { conversationId: r.conversationId, phone: '12345' }))).toBe('INVALID_INPUT');
    expect(await code(setContactPhone(deps(), who.fixer, { conversationId: r.conversationId, phone: '01912345678', version: 'old' }))).toBe('STALE');
    const set = await setContactPhone(deps(), who.fixer, { conversationId: r.conversationId, phone: '০১৯১২ ৩৪৫৬৭৮', version: th.version });
    expect(set.customerId).toBe(cust.later);
    expect(await contactOf(r.conversationId)).toMatchObject({ phone: LATER, customerId: cust.later, identityFixedAt: expect.any(Date) });
    expect(await t.prisma.auditLog.count({ where: { action: 'support.identity.phone' } })).toBe(1);
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'support.identity.phone' } });
    expect(JSON.stringify(audit)).not.toContain('1912345678');

    // set by hand: automatic matching leaves it alone (a later message with another number changes nothing)
    await msg('messenger', 'psid-hand', 'ar 01812345678');
    expect(await contactOf(r.conversationId)).toMatchObject({ phone: LATER, customerId: cust.later, mergedIntoId: null });

    const un = await unlinkContactCustomer(deps(), who.fixer, { conversationId: r.conversationId });
    expect(un.customerId).toBeNull();
    expect(await contactOf(r.conversationId)).toMatchObject({ customerId: null });
    expect(await code(unlinkContactCustomer(deps(), who.fixer, { conversationId: r.conversationId }))).toBe('NOT_LINKED');
    expect(await code(splitContact(deps(), who.fixer, { conversationId: r.conversationId }))).toBe('NOT_LINKED');

    // "not the same person" on Rahim's first contact: the next one in time leads the others
    const wa = await t.prisma.supportContact.findFirstOrThrow({ where: { externalId: '8801712345678' }, include: { conversations: true } });
    await splitContact(deps(), who.fixer, { conversationId: wa.conversations[0]!.id });
    const psid = await t.prisma.supportContact.findFirstOrThrow({ where: { externalId: 'psid-rahim' } });
    const visitor = await t.prisma.supportContact.findFirstOrThrow({ where: { externalId: 'visitor-r' } });
    expect(psid.mergedIntoId).toBeNull();
    expect(visitor.mergedIntoId).toBe(psid.id);
    expect(await t.prisma.supportContact.findUniqueOrThrow({ where: { id: wa.id } })).toMatchObject({ mergedIntoId: null, identityFixedAt: expect.any(Date), customerId: cust.rahim });
    expect(await kinds(wa.conversations[0]!.id)).toContain('IDENTITY_SPLIT');
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['support.identity.unlink', 'support.identity.split'] } } })).toBe(2);
    // and it is never joined back automatically
    await msg('whatsapp', '8801712345678', 'abar');
    expect((await t.prisma.supportContact.findUniqueOrThrow({ where: { id: wa.id } })).mergedIntoId).toBeNull();
    const ev = await t.prisma.conversationEvent.findFirstOrThrow({ where: { kind: 'IDENTITY_SPLIT' } });
    expect(ev).toMatchObject({ actorType: 'STAFF', actorName: 'Sample fixer' });
  });
});
