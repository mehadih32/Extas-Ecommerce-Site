// PR 432 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): EXTAS AI's draft answer in a chat. Off as it
// ships, nothing; on, the customer's messages since the shop's last answer are read, the chat's customer's latest order
// and its parcel fill the words, a parcel the courier check called late answers "where is my order" with the late
// text, a Bengali question gets a Bengali draft, a size question is answered by the caller's Find My Size on the
// product last sent in the chat, a complaint is marked for a person and a bulk order for the owner, the shop's answer
// ends the question; nothing is sent and a reader without support.reply is refused. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { receiveMessage, replyToConversation, supportDraft, supportThread, type SupportDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 432 · draft answers (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  const overrides = new Map<string, unknown>();
  const now = new Date('2026-11-01T06:00:00Z');
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
    async set<K extends Key>(key: K, value: Value<K>): Promise<void> {
      overrides.set(key, value);
    },
  };
  // the clock moves with the messages: a reply comes just after the message it answers
  const deps = (): SupportDeps => ({ db: t.prisma, settings, now: () => new Date(now.getTime() + n * 1000 + 500) });
  const who: Record<'agent' | 'reader', Who> = {} as never;
  let n = 0;
  let customerId = '';
  let orderId = '';
  let productId = '';
  const say = (contact: string, text: string) =>
    receiveMessage(deps(), { storeId: S, channel: { kind: 'whatsapp', externalId: 'sample-wa-432' }, contact: { externalId: contact, name: 'New' }, message: { externalId: `m432-${++n}`, text, sentAt: new Date(now.getTime() + n * 1000) } });

  beforeAll(async () => {
    t = await createTestDatabase('support_drafts');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const agent = await createRole(t.prisma, SYSTEM, { key: 't432-agent', nameEn: 'agent', nameBn: 'agent', permissions: ['support.read', 'support.reply'] });
    const reader = await createRole(t.prisma, SYSTEM, { key: 't432-reader', nameEn: 'reader', nameBn: 'reader', permissions: ['support.read'] });
    for (const [k, r] of [['agent', agent], ['reader', reader]] as const) {
      const u = await t.prisma.staffUser.create({ data: { email: `t432-${k}@example.com`, displayName: `Sample ${k}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: r.id, storeId: S } });
      who[k] = { actor: { staffUserId: u.id } satisfies Actor, storeId: S };
    }
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'whatsapp', externalId: 'sample-wa-432', name: 'WhatsApp (sample)', enabled: true } });
    customerId = (await t.prisma.customer.create({ data: { storeId: S, name: 'Rahim (sample)', phone: '+8801700004320' } })).id; // hardcode-ok: made-up number
    const o = await t.prisma.order.create({
      data: { storeId: S, number: 'EX4320', source: 'WEBSITE', currency: 'BDT', status: 'IN_TRANSIT', placedAt: new Date(now.getTime() - 6 * 86_400_000), subtotalMinor: 1000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1000, paymentMethod: 'COD', customerId, phone: '+8801700004320', idempotencyKey: 'd432-1' }, // hardcode-ok: made-up
    });
    orderId = o.id;
    const courier = await t.prisma.courierAccount.create({ data: { storeId: S, providerKey: 'sample', name: 'Sample Courier' } });
    await t.prisma.shipment.create({ data: { storeId: S, orderId, courierAccountId: courier.id, status: 'IN_TRANSIT', trackingCode: 'TRK-432', idempotencyKey: 'd432-ship' } });
    productId = '019a0000-0432-7000-8000-000000000001'; // the product last sent (the share keeps its id; the caller's finder reads it)
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('gives nothing while switched off (as it ships), and refuses a reader', async () => {
    expect(registry['support.drafts'].default.enabled).toBe(false);
    const r = await say('off', 'amar order kothay?');
    expect(await supportDraft(deps(), who.agent, r.conversationId)).toBeNull();
    overrides.set('support.drafts', { ...registry['support.drafts'].default, enabled: true });
    await expect(supportDraft(deps(), who.reader, r.conversationId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('answers where the order is from the customer\'s latest order and its parcel; a late parcel gets the late words; Bengali in Bengali', async () => {
    const r = await say('rahim', 'amar order kothay?');
    await t.prisma.conversation.update({ where: { id: r.conversationId }, data: { customerId } });
    const d = await supportDraft(deps(), who.agent, r.conversationId);
    expect(d).toMatchObject({ intent: 'status', text: 'statusShipped', lang: 'bn', handover: false, order: { id: orderId, number: 'EX4320' } });
    expect(d!.body).toContain('Rahim (sample)');
    expect(d!.body).toContain('TRK-432');
    overrides.set('support.drafts', { ...registry['support.drafts'].default, enabled: true, banglishReply: 'en' });
    expect((await supportDraft(deps(), who.agent, r.conversationId))!.body).toBe('Hi Rahim (sample), order EX4320 is on its way with Sample Courier, tracking TRK-432.');
    await t.prisma.orderEvent.create({ data: { storeId: S, orderId, type: 'shipment.late', actorType: 'SYSTEM', source: 'courier.track', data: {} } });
    const late = await supportDraft(deps(), who.agent, r.conversationId);
    expect(late).toMatchObject({ intent: 'status', text: 'late' });
    expect(late!.body).toContain('6 days');
    // the shop's answer ends the question: nothing waits, no draft; nothing was sent by the draft itself
    const outBefore = await t.prisma.message.count({ where: { conversationId: r.conversationId, direction: 'OUT' } });
    expect(outBefore).toBe(0);
    const th = await supportThread(deps(), who.agent, r.conversationId);
    await replyToConversation(deps(), who.agent, { conversationId: r.conversationId, body: late!.body, requestKey: 'press-432-abcdefgh', version: th.version });
    expect(await supportDraft(deps(), who.agent, r.conversationId)).toBeNull();
    const bn = await say('rahim', 'আমার অর্ডার কোথায়?');
    expect((await supportDraft(deps(), who.agent, bn.conversationId))).toMatchObject({ lang: 'bn', text: 'late' });
  });

  it('marks a complaint for a person and a bulk order for the owner; an unknown sender is greeted without a name', async () => {
    const c = await say('karim', 'rider 50 taka beshi chailo');
    const d = await supportDraft(deps(), who.agent, c.conversationId);
    expect(d).toMatchObject({ intent: 'complaint', complaint: 'overcharge', text: 'noOrder', handover: 'person', order: null });
    expect(d!.body.startsWith('Hi,')).toBe(true);
    expect(d!.body).not.toContain('New');
    const b = await say('karim', '40 polos lagbe, 4 ta size e');
    expect(await supportDraft(deps(), who.agent, b.conversationId)).toMatchObject({ intent: 'complaint' }); // both messages wait: the complaint comes first
    const solo = await say('bulky', '40 polos lagbe, 4 ta size e');
    expect(await supportDraft(deps(), who.agent, solo.conversationId)).toMatchObject({ intent: 'bulk', text: 'bulk', handover: 'owner' });
  });

  it('answers a size question with Find My Size on the product last sent in the chat, else asks the measures', async () => {
    const s = await say('sizer', 'উচ্চতা ৫ ফুট ৬, ওজন ৬৫');
    const asked: unknown[] = [];
    const sizeFor = async (pid: string, body: { heightIn: number; weightKg: number }) => (asked.push([pid, body]), 'L');
    expect(await supportDraft(deps(), who.agent, s.conversationId, { sizeFor })).toMatchObject({ intent: 'size', text: 'sizeAsk', size: null });
    await t.prisma.supportProductShare.create({ data: { storeId: S, conversationId: s.conversationId, productId, refCode: 'r432size', sentById: who.agent.actor.staffUserId } });
    const d = await supportDraft(deps(), who.agent, s.conversationId, { sizeFor });
    expect(d).toMatchObject({ intent: 'size', text: 'size', size: 'L', lang: 'bn' });
    expect(d!.body).toContain('L সাইজ');
    expect(asked).toEqual([[productId, { heightIn: 66, weightKg: 65 }]]);
  });
});
