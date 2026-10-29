// S14 · PR 505 on a real PostgreSQL (a throwaway database with the real migrations and the general default pack; skipped
// without TEST_DATABASE_ADMIN_URL). Messages › Templates: every template the journey uses is there in Bengali and
// English and the Bengali is Bengali (SIM-F-025); the preview on the sample order never asks a paid customer for money
// (SIM-F-001) and never promises a link it cannot make (SIM-F-031); a save keeps only known tokens, over its own
// version, sends an edited WhatsApp template back for approval and is audited; a default is put back; a missing
// language is added; and the auto-reply (off as it ships) answers a customer who wrote once per window, never one who
// stopped messages. The sender is a stand-in: nothing is ever sent to a real number.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_JOURNEY, JOURNEY_STEPS, type MessageChannel } from '@extas/settings';
import { createTemplate, handleWhatsAppInbound, resetTemplate, saveAutoReply, saveTemplate, templatesScreen, zoned, type MessagesDeps, type OutgoingMessage, type TemplatesScreen, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

// made-up test numbers, never a real customer
const A = '01700000505';
const B = '01700000506';
const e164 = (p: string) => `+88${p}`;
const BENGALI = /[ঀ-৿]/;

const rowOf = (s: TemplatesScreen, key: string, channel: MessageChannel, locale: string) => {
  const r = s.groups.find((g) => g.key === key)?.rows.find((x) => x.channel === channel && x.locale === locale);
  if (!r) throw new Error(`no ${key} ${channel} ${locale}`);
  return r;
};

describe.skipIf(!HAS_TEST_DB)('PR 505 · the template editor and the auto-reply (PostgreSQL)', () => {
  let f: OrdersFixture;
  let staff: Who;
  let reader: Who;
  const db = () => f.t.prisma;
  const outbox: (OutgoingMessage & { channel: MessageChannel })[] = [];
  const sender: MessagesDeps['sender'] = async (_storeId, channel) => ({
    provider: 'test',
    mode: 'MOCK',
    send: async (m) => {
      outbox.push({ channel, ...m });
      return { ok: true, messageId: randomUUID() };
    },
  });
  const deps = (): MessagesDeps => ({ db: db(), settings: f.deps().settings, sender, now: () => f.clock.now });
  // the settings' write side: the fixture's overrides
  const wdeps = () => ({ ...deps(), settings: { ...f.deps().settings, async set(key: string, value: unknown) { f.overrides.set(key, value); } } }) as Parameters<typeof saveAutoReply>[0];
  const write = (phone: string, text: string) => handleWhatsAppInbound(deps(), f.S, [{ from: e164(phone), messageId: randomUUID(), text, at: f.clock.now }]);

  beforeAll(async () => {
    f = await setUpOrders('templates');
    const p = db();
    const role = await createRole(p, SYSTEM, { key: 'test-templates', nameEn: 'templates', nameBn: 'templates', permissions: ['messages.templates.read', 'messages.templates.write'] });
    const readRole = await createRole(p, SYSTEM, { key: 'test-templates-read', nameEn: 'reader', nameBn: 'reader', permissions: ['messages.templates.read'] });
    const u = await p.staffUser.create({ data: { email: 'templates@example.com', displayName: 'Templates Staff', passwordHash: 'not-a-login' } });
    const r = await p.staffUser.create({ data: { email: 'templates-reader@example.com', displayName: 'Reader', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    await p.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: readRole.id, storeId: f.S } });
    staff = { actor: { staffUserId: u.id }, storeId: f.S };
    reader = { actor: { staffUserId: r.id }, storeId: f.S };
    f.overrides.set('system.stagingHost', 'shop.example');
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(() => {
    f.clock.now = new Date();
    f.overrides.delete('messages.autoReply');
    outbox.length = 0;
  });

  it('SIM-F-025: every template a journey step sends is there in Bengali and English, and the Bengali is Bengali', async () => {
    const s = await templatesScreen(deps(), staff);
    expect(s.perms.write).toBe(true);
    expect(s.hasHost).toBe(true);
    expect((await templatesScreen(deps(), reader)).perms.write).toBe(false);
    for (const step of JOURNEY_STEPS) {
      const g = s.groups.find((x) => x.key === DEFAULT_JOURNEY[step].template);
      expect(g, step).toBeDefined();
      expect(g!.uses.some((u) => u.use === step)).toBe(true);
      expect(g!.missing, step).toEqual([]);
    }
    for (const g of s.groups)
      for (const r of g.rows) {
        expect(r.problems, `${r.key} ${r.channel} ${r.locale}`).not.toContain('UNKNOWN_TOKEN');
        if (r.locale !== 'bn') continue;
        expect(r.problems, `${r.key} ${r.channel}`).not.toContain('NOT_BENGALI');
        for (const p of r.previews) if (p.ok) expect(BENGALI.test(p.text), `${r.key} ${r.channel} ${p.sample}`).toBe(true);
      }
    // the auto-reply's own template ships too, in both languages
    expect(s.groups.find((g) => g.key === 'reply.received')).toMatchObject({ missing: [], uses: [{ use: 'autoReply', on: false }] });
  });

  it('SIM-F-001 and SIM-F-031: the preview never asks a paid customer for money, nor promises a link it cannot make', async () => {
    let s = await templatesScreen(deps(), staff);
    const t = rowOf(s, 'order.packed', 'SMS', 'en');
    s = await saveTemplate(deps(), staff, t.id, { body: '{storeName}: order {orderNumber} is packed. {amountLine} Track it: {trackingLink}', version: t.version });
    const p = rowOf(s, 'order.packed', 'SMS', 'en');
    const [cod, prepaid, part] = p.previews;
    expect(cod).toMatchObject({ sample: 'cod', ok: true });
    expect(cod!.ok && cod!.text).toContain('2,490');
    expect(prepaid).toMatchObject({ sample: 'prepaid', ok: true });
    expect(prepaid!.ok && prepaid!.text).not.toMatch(/2,490|1,490|৳/);
    expect(prepaid!.ok && prepaid!.text).toContain('https://shop.example/account/orders/');
    expect(part!.ok && part!.text).toContain('1,490');
    expect(p.problems).toEqual([]);
    expect(p.edited).toBe(true);
    // {amountDue}: the prepaid order would skip the whole message, and the editor says so
    s = await saveTemplate(deps(), staff, p.id, { body: '{storeName}: please pay {amountDue} for order {orderNumber}.', version: p.version });
    const due = rowOf(s, 'order.packed', 'SMS', 'en');
    expect(due.problems).toContain('AMOUNT_ON_PAID');
    expect(due.previews[1]).toMatchObject({ sample: 'prepaid', ok: false, reason: 'AMOUNT_RULE' });
    // without the shop's address a link cannot be made: the editor warns and the preview is skipped, never an empty link
    f.overrides.set('system.stagingHost', null);
    try {
      const none = await templatesScreen(deps(), staff);
      if (!none.hasHost) {
        const b = rowOf(none, 'order.booked', 'SMS', 'en');
        expect(b.problems).toContain('LINK_PROMISE');
        expect(b.previews.every((x) => !x.ok && x.reason === 'NO_LINK')).toBe(true);
      }
    } finally {
      f.overrides.set('system.stagingHost', 'shop.example');
    }
    await resetTemplate(deps(), staff, due.id, { version: due.version });
  });

  it('a save keeps only known tokens over its own version, sends an edited WhatsApp template back for approval, and is audited; a default comes back', async () => {
    const s = await templatesScreen(deps(), staff);
    const sms = rowOf(s, 'order.confirmed', 'SMS', 'bn');
    expect(await code(saveTemplate(deps(), reader, sms.id, { body: 'নতুন লেখা {orderNumber}', version: sms.version }))).toBe('FORBIDDEN');
    expect(await code(saveTemplate(deps(), staff, sms.id, { body: 'অর্ডার {orderNo} কনফার্ম', version: sms.version }))).toBe('INVALID_INPUT');
    expect(await code(saveTemplate(deps(), staff, sms.id, { body: '   ', version: sms.version }))).toBe('INVALID_INPUT');
    expect(await code(saveTemplate(deps(), staff, randomUUID(), { body: 'x', version: sms.version }))).toBe('NOT_FOUND');
    const after = await saveTemplate(deps(), staff, sms.id, { body: '{storeName}: অর্ডার {orderNumber} কনফার্ম হয়েছে।', version: sms.version });
    expect(rowOf(after, 'order.confirmed', 'SMS', 'bn')).toMatchObject({ body: '{storeName}: অর্ডার {orderNumber} কনফার্ম হয়েছে।', edited: true });
    // the old version is someone else's screen now
    expect(await code(saveTemplate(deps(), staff, sms.id, { body: 'আবার {orderNumber}', version: sms.version }))).toBe('STALE');
    expect(await db().auditLog.count({ where: { action: 'messages.template.save', entityId: sms.id } })).toBe(1);

    // an approved WhatsApp template that is edited goes back for approval (a live send skips it until then)
    const wa = rowOf(after, 'order.packed', 'WHATSAPP', 'en');
    await db().notificationTemplate.update({ where: { id: wa.id }, data: { providerStatus: 'APPROVED', providerTemplateId: 'order_packed', providerCheckedAt: new Date() } });
    const fresh = rowOf(await templatesScreen(deps(), staff), 'order.packed', 'WHATSAPP', 'en');
    expect(fresh.providerStatus).toBe('APPROVED');
    await saveTemplate(deps(), staff, wa.id, { body: `${fresh.body} Thank you!`, version: fresh.version });
    expect(await db().notificationTemplate.findUniqueOrThrow({ where: { id: wa.id } })).toMatchObject({ providerStatus: null, providerCheckedAt: null, providerTemplateId: 'order_packed' });

    // an e-mail needs its subject
    const mail = rowOf(after, 'order.placed', 'EMAIL', 'en');
    expect(await code(saveTemplate(deps(), staff, mail.id, { body: mail.body, subject: '', version: mail.version }))).toBe('INVALID_INPUT');

    // the default comes back
    const edited = rowOf(await templatesScreen(deps(), staff), 'order.confirmed', 'SMS', 'bn');
    const back = await resetTemplate(deps(), staff, edited.id, { version: edited.version });
    expect(rowOf(back, 'order.confirmed', 'SMS', 'bn').edited).toBe(false);
    expect(await db().auditLog.count({ where: { action: 'messages.template.reset', entityId: sms.id } })).toBe(1);
  });

  it('a missing language is listed with its default words and added back; one that is there is not made twice', async () => {
    const s = await templatesScreen(deps(), staff);
    const bn = rowOf(s, 'order.delivered', 'WHATSAPP', 'bn');
    await db().notificationTemplate.update({ where: { id: bn.id }, data: { archivedAt: new Date() } });
    const gone = (await templatesScreen(deps(), staff)).groups.find((g) => g.key === 'order.delivered')!;
    const miss = gone.missing.find((m) => m.channel === 'WHATSAPP' && m.locale === 'bn');
    expect(miss?.draft.body).toBe(bn.body);
    expect(await code(createTemplate(deps(), reader, { key: 'order.delivered', channel: 'WHATSAPP', locale: 'bn', body: miss!.draft.body }))).toBe('FORBIDDEN');
    expect(await code(createTemplate(deps(), staff, { key: 'order.delivered', channel: 'WHATSAPP', locale: 'bn', body: 'ডেলিভারি {unknownThing}' }))).toBe('INVALID_INPUT');
    const made = await createTemplate(deps(), staff, { key: 'order.delivered', channel: 'WHATSAPP', locale: 'bn', body: miss!.draft.body });
    expect(made.groups.find((g) => g.key === 'order.delivered')!.missing).toEqual([]);
    expect(rowOf(made, 'order.delivered', 'WHATSAPP', 'bn').id).toBe(bn.id);
    expect(await code(createTemplate(deps(), staff, { key: 'order.delivered', channel: 'WHATSAPP', locale: 'bn', body: miss!.draft.body }))).toBe('STALE');
    // a key of the shop's own (a journey step may name it)
    const own = await createTemplate(deps(), staff, { key: 'order.packedSpecial', channel: 'SMS', locale: 'en', body: '{storeName}: {orderNumber} is packed with care.' });
    expect(own.groups.find((g) => g.key === 'order.packedSpecial')).toMatchObject({ uses: [], missing: [{ channel: 'SMS', locale: 'bn' }] });
    expect(await db().auditLog.count({ where: { action: 'messages.template.create' } })).toBe(2);
  });

  it('the auto-reply: off as it ships; on, once per number in its window, only outside the hours when asked, never to a number that stopped', async () => {
    expect(await write(A, 'hello, is the blue shirt in stock?')).toMatchObject({ other: 1, autoReplies: 0 });
    expect(outbox).toEqual([]);

    const s = await templatesScreen(deps(), staff);
    expect(s.autoReply.config.autoReply).toMatchObject({ enabled: false, template: 'reply.received', onceEveryHours: 24, when: 'always' });
    const on = { ...s.autoReply.config.autoReply, enabled: true };
    expect(await code(saveAutoReply(wdeps(), reader, { autoReply: on }, s.autoReply.version))).toBe('FORBIDDEN');
    expect(await code(saveAutoReply(wdeps(), staff, { autoReply: { ...on, openHour: 9, closeHour: 9 } }, s.autoReply.version))).toBe('INVALID_INPUT');
    const saved = await saveAutoReply(wdeps(), staff, { autoReply: on }, s.autoReply.version);
    expect(saved.groups.find((g) => g.key === 'reply.received')!.uses[0]).toMatchObject({ on: true });
    expect(await code(saveAutoReply(wdeps(), staff, { autoReply: { ...on, onceEveryHours: 12 } }, s.autoReply.version))).toBe('STALE');

    expect(await write(A, 'hello?')).toMatchObject({ autoReplies: 1 });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ channel: 'WHATSAPP', to: e164(A), purpose: 'reply.received' });
    // once in the window
    expect(await write(A, 'anyone there?')).toMatchObject({ autoReplies: 0 });
    expect(outbox).toHaveLength(1);
    // the next window answers again
    f.clock.now = new Date(f.clock.now.getTime() + 25 * 3_600_000);
    expect(await write(A, 'hello again')).toMatchObject({ autoReplies: 1 });
    expect(outbox).toHaveLength(2);

    // a number that stopped messages gets no auto-reply
    expect(await write(B, 'STOP')).toMatchObject({ stops: 1 });
    expect(await write(B, 'where is my order')).toMatchObject({ other: 1, autoReplies: 0 });
    expect(outbox).toHaveLength(2);

    // only outside the shop's hours: inside them nothing goes
    const h = zoned(f.clock.now, await f.deps().settings.value('store.timeZone', { storeId: f.S })).h;
    f.overrides.set('messages.autoReply', { ...on, when: 'outsideHours', openHour: h, closeHour: (h + 1) % 24 });
    f.clock.now = new Date(f.clock.now.getTime() + 60_000);
    const inside = zoned(f.clock.now, await f.deps().settings.value('store.timeZone', { storeId: f.S })).h === h;
    if (inside) expect(await write(A, 'open?')).toMatchObject({ autoReplies: 0 });
    f.overrides.set('messages.autoReply', { ...on, when: 'outsideHours', openHour: (h + 2) % 24, closeHour: (h + 3) % 24 });
    f.clock.now = new Date(f.clock.now.getTime() + 25 * 3_600_000);
    expect(await write(A, 'closed?')).toMatchObject({ autoReplies: 1 });
    const log = await db().notificationLog.findMany({ where: { storeId: f.S, step: 'autoReply' } });
    expect(log.every((r) => r.status === 'SENT')).toBe(true);
  });
});
