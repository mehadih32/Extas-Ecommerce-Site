// S14 · PR 298 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real
// checkout; skipped without TEST_DATABASE_ADMIN_URL). Consent and opt-out, checked by the engine before every send:
// the customer's stop word (WhatsApp reply) and the team's record at his request stop every message on the channel
// (the step's fallback channel asks again), a start word takes it back, an offer step goes only with his yes (the
// checkout tick, or the team at his request), and the Consent page with its version, checks and permissions. The
// senders are stand-ins: nothing is ever sent to a real number.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { DEFAULT_JOURNEY, type MessageChannel } from '@extas/settings';
import { consentScreen, handleWhatsAppInbound, recordConsentByStaff, runMessages, saveConsentSettings, type MessagesDeps, type OutgoingMessage, type Who } from './index';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

// made-up test numbers, never a real customer
const A = '01700000298';
const B = '01700000299';
const C = '01700000297';
const D = '01700000296';
const e164 = (p: string) => `+88${p}`;

describe.skipIf(!HAS_TEST_DB)('PR 298 · consent and opt-out on every channel (PostgreSQL)', () => {
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
  const wdeps = () => ({ ...deps(), settings: { ...f.deps().settings, async set(key: string, value: unknown) { f.overrides.set(key, value); } } }) as Parameters<typeof saveConsentSettings>[0];
  const run = async () => {
    f.clock.now = new Date(Math.max(f.clock.now.getTime(), Date.now()) + 1_000);
    return runMessages(deps(), f.S);
  };
  const rowOf = (orderId: string, step: string, channel: MessageChannel) => db().notificationLog.findFirstOrThrow({ where: { orderId, step, channel } });
  const reply = (phone: string, text: string) => handleWhatsAppInbound(deps(), f.S, [{ from: e164(phone), messageId: randomUUID(), text, at: f.clock.now }]);
  const journey = (over: Partial<typeof DEFAULT_JOURNEY>) =>
    f.overrides.set('messages.journey', {
      ...DEFAULT_JOURNEY,
      confirmed: { ...DEFAULT_JOURNEY.confirmed, on: false },
      packed: { ...DEFAULT_JOURNEY.packed, on: false },
      day1Care: { ...DEFAULT_JOURNEY.day1Care, on: false },
      day3Review: { ...DEFAULT_JOURNEY.day3Review, on: false },
      ...over,
    });
  const consent = (over: Record<string, unknown>) => f.overrides.set('messages.consent', { stopWords: ['STOP', 'UNSUBSCRIBE', 'বন্ধ'], startWords: ['START', 'চালু'], stopCovers: 'everything', stopChannels: 'thisChannel', offerSteps: [], confirmReply: false, ...over });

  beforeAll(async () => {
    f = await setUpOrders('consent');
    const p = db();
    const role = await createRole(p, SYSTEM, { key: 'test-consent', nameEn: 'consent', nameBn: 'consent', permissions: ['messages.consent.view', 'messages.consent.write'] });
    const readRole = await createRole(p, SYSTEM, { key: 'test-consent-read', nameEn: 'reader', nameBn: 'reader', permissions: ['messages.consent.view'] });
    const u = await p.staffUser.create({ data: { email: 'consent@example.com', displayName: 'Consent Staff', passwordHash: 'not-a-login' } });
    const r = await p.staffUser.create({ data: { email: 'consent-reader@example.com', displayName: 'Reader', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    await p.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: readRole.id, storeId: f.S } });
    staff = { actor: { staffUserId: u.id }, storeId: f.S };
    reader = { actor: { staffUserId: r.id }, storeId: f.S };
    f.overrides.set('system.stagingHost', 'shop.example');
    f.overrides.set('messages.language', 'en');
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  beforeEach(async () => {
    f.clock.now = new Date();
    journey({});
    f.overrides.delete('messages.consent');
    f.overrides.delete('checkout.consent.sms.default');
    await run();
    outbox.length = 0;
  });

  it('his WhatsApp STOP stops WhatsApp only (the self-confirm falls back to SMS); START takes it back; the answer goes when switched on', async () => {
    journey({ selfConfirm: { ...DEFAULT_JOURNEY.selfConfirm, on: true } });
    expect(await reply(A, ' stop. ')).toMatchObject({ stops: 1, starts: 0, answers: 0 });
    expect(await db().consentRecord.findFirstOrThrow({ where: { phone: e164(A), source: 'reply' } })).toMatchObject({ channel: 'WHATSAPP', scope: 'ALL', granted: false });
    // confirmReply is off: nothing went back
    expect(outbox).toHaveLength(0);

    const o = await f.place('consent-stop', { phone: A });
    await run();
    expect(await rowOf(o.orderId, 'selfConfirm', 'WHATSAPP')).toMatchObject({ status: 'SKIPPED', reason: 'OPTED_OUT' });
    await run();
    expect(await rowOf(o.orderId, 'selfConfirm', 'SMS')).toMatchObject({ status: 'SENT' });
    expect(await rowOf(o.orderId, 'placed', 'SMS')).toMatchObject({ status: 'SENT' });

    // the start word (Bengali), answered this time
    consent({ confirmReply: true });
    expect(await reply(A, 'চালু')).toMatchObject({ starts: 1 });
    expect(outbox.find((m) => m.channel === 'WHATSAPP' && m.purpose === 'consent.started')).toBeDefined();
    expect(await db().notificationLog.findFirstOrThrow({ where: { step: 'consentReply', recipient: e164(A) } })).toMatchObject({ status: 'SENT', orderId: null, channel: 'WHATSAPP' });
    const p = await f.place('consent-start', { phone: A });
    await run();
    expect(await rowOf(p.orderId, 'selfConfirm', 'WHATSAPP')).toMatchObject({ status: 'SENT' });
    // a word that is neither is left alone
    expect(await reply(A, 'please stop calling me')).toMatchObject({ stops: 0, starts: 0 });
  });

  it('a stop on every channel (setting) blocks SMS too; the team records a stop at his request; offers need his yes', async () => {
    consent({ stopChannels: 'allChannels' });
    await reply(B, 'UNSUBSCRIBE');
    const o = await f.place('consent-all', { phone: B });
    await run();
    expect(await rowOf(o.orderId, 'placed', 'SMS')).toMatchObject({ status: 'SKIPPED', reason: 'OPTED_OUT' });

    // offers: "order received" counted as an offer; without his yes it does not go
    consent({ offerSteps: ['placed'] });
    f.overrides.set('checkout.consent.sms.default', false);
    const n = await f.place('consent-no-offers', { phone: C });
    await run();
    expect(await rowOf(n.orderId, 'placed', 'SMS')).toMatchObject({ status: 'SKIPPED', reason: 'NO_CONSENT' });
    // he asks the team to send him offers: recorded, audited, and the next one goes
    expect(await code(recordConsentByStaff(deps(), reader, { phone: C, channels: ['SMS'], action: 'allowOffers' }))).toBe('FORBIDDEN');
    expect(await code(recordConsentByStaff(deps(), staff, { phone: 'not a number', channels: ['SMS'], action: 'allowOffers' }))).toBe('INVALID_INPUT');
    expect(await code(recordConsentByStaff(deps(), staff, { phone: C, channels: [], action: 'allowOffers' }))).toBe('INVALID_INPUT');
    const r = await recordConsentByStaff(deps(), staff, { phone: C, channels: ['SMS'], action: 'allowOffers' });
    expect(r.recorded).toBe(1);
    expect(r.screen.lookup?.states.find((s) => s.channel === 'SMS')).toMatchObject({ offers: true, all: null });
    expect(r.screen.lookup?.history[0]).toMatchObject({ source: 'staff', recordedBy: 'Consent Staff', scope: 'MARKETING', granted: true });
    expect(await db().auditLog.count({ where: { action: 'messages.consent.record' } })).toBe(1);
    const y = await f.place('consent-offers', { phone: C });
    await run();
    expect(await rowOf(y.orderId, 'placed', 'SMS')).toMatchObject({ status: 'SENT' });
    // the checkout's own yes counts too
    f.overrides.delete('checkout.consent.sms.default');
    const t = await f.place('consent-tick', { phone: A });
    await run();
    expect(await rowOf(t.orderId, 'placed', 'SMS')).toMatchObject({ status: 'SENT' });

    // the team records a stop of every message on SMS: the next order's SMS does not go
    consent({});
    await recordConsentByStaff(deps(), staff, { phone: C, channels: ['SMS'], action: 'stopAll' });
    const z = await f.place('consent-staff-stop', { phone: C });
    await run();
    expect(await rowOf(z.orderId, 'placed', 'SMS')).toMatchObject({ status: 'SKIPPED', reason: 'OPTED_OUT' });
  });

  it('the Consent page: counts, the newest answers, one number`s answers; the stop words saved with their version', async () => {
    await reply(D, 'STOP');
    const s = await consentScreen(deps(), staff, { phone: D });
    expect(s.perms.write).toBe(true);
    expect(s.counts.stops).toBeGreaterThanOrEqual(1);
    expect(s.recent.length).toBeGreaterThanOrEqual(1);
    expect(s.lookup).toMatchObject({ phone: e164(D) });
    expect(s.lookup!.states.find((x) => x.channel === 'WHATSAPP')!.all).toBe(false);
    expect((await consentScreen(deps(), reader)).perms.write).toBe(false);
    expect(await code(consentScreen(deps(), staff, { phone: '12' }))).toBe('INVALID_INPUT');

    const next = { ...s.config, stopWords: [...s.config.stopWords, 'NO MORE'] };
    expect(await code(saveConsentSettings(wdeps(), reader, { consent: next }, s.version))).toBe('FORBIDDEN');
    const saved = await saveConsentSettings(wdeps(), staff, { consent: next }, s.version);
    expect(saved.config.stopWords).toContain('NO MORE');
    expect(await code(saveConsentSettings(wdeps(), staff, { consent: s.config }, s.version))).toBe('STALE');
    expect(await code(saveConsentSettings(wdeps(), staff, { consent: { ...next, startWords: ['stop'] } }, saved.version))).toBe('INVALID_INPUT');
    expect(await reply(B, 'no more')).toMatchObject({ stops: 1 });
  });
});
