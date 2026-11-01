// PR 538 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the owner told on Telegram when a customer
// waits and nobody answers. Off as it ships, nobody is told; on, a wait of `minutes` is told once (two sweeps at once
// never twice), an answered chat is not, a new wait after an answer is told again, the desk's closed hours do not count
// ('wait') or do ('tell'), the hourly cap holds the rest back, an old backlog and a blocked person are never told, the
// row is append-only, the chat's log says it went (or the practice copy took it); a customer's links are checked as they
// arrive and the thread cuts the words around them. Every value is made up.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { registry, type Key, type Value } from '@extas/settings';
import { receiveMessage, supportDesk, supportThread, sweepEscalations, type OwnerAlert, type SupportDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 538 · telling the owner, desk hours, link safety (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  const overrides = new Map<string, unknown>();
  // Sunday 1 Nov 2026, 12:00 in Dhaka (the sample store's time zone is set below)
  let clock = new Date('2026-11-01T06:00:00Z').getTime();
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      if (key === 'store.timeZone') return 'Asia/Dhaka' as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const lines: string[] = [];
  let mode = 'LIVE';
  const alert: OwnerAlert = async (_s, text) => (lines.push(text), { ok: true, mode });
  const deps = (): SupportDeps & { alert: OwnerAlert } => ({ db: t.prisma, settings, now: () => new Date(clock), alert });
  let n = 0;
  const say = (contact: string, text: string) =>
    receiveMessage(deps(), { storeId: S, channel: { kind: 'whatsapp', externalId: 'sample-whatsapp-538' }, contact: { externalId: contact, name: `Sample ${contact}` }, message: { externalId: `m538-${++n}`, text, sentAt: new Date(clock) } });
  const later = (min: number) => (clock += min * 60_000);
  const ON = { ...registry['support.escalation'].default, enabled: true, lang: 'en' as const };

  beforeAll(async () => {
    t = await createTestDatabase('support_escalation');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't538-owner', nameEn: 'owner', nameBn: 'owner', permissions: ['support.read', 'support.reply', 'support.assign'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't538-owner@example.com', displayName: 'Sample owner', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    who = { actor: { staffUserId: u.id }, storeId: S };
    await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'whatsapp', externalId: 'sample-whatsapp-538', name: 'WhatsApp (sample)', enabled: true } });
  });
  afterAll(async () => {
    await t?.drop();
  });
  beforeEach(() => {
    lines.length = 0;
    mode = 'LIVE';
  });

  it('off as it ships: a long wait tells nobody', async () => {
    await say('off', 'hello?');
    later(30);
    expect(await sweepEscalations(deps(), S)).toEqual({ waiting: 0, told: 0, capped: 0 });
    expect(lines).toEqual([]);
  });

  it('on: told once after the minutes, never twice (two sweeps at once), logged on the chat; append-only', async () => {
    overrides.set('support.escalation', ON);
    await t.prisma.conversation.updateMany({ where: { storeId: S }, data: { waitingSince: null, lastDirection: 'OUT' } });
    const c = await say('rahim', 'Polo ta M size e ache?');
    later(4);
    expect((await sweepEscalations(deps(), S)).told).toBe(0);
    later(2);
    const [a, b] = await Promise.all([sweepEscalations(deps(), S), sweepEscalations(deps(), S)]);
    expect(a.told + b.told).toBe(1);
    expect(lines).toEqual([expect.stringMatching(/^A customer has waited 6 min with no answer — WhatsApp \(sample\) · Sample rahim · chat C\w{9}$/)]);
    expect(await sweepEscalations(deps(), S)).toMatchObject({ told: 0 });
    const rows = await t.prisma.supportEscalation.findMany({ where: { conversationId: c.conversationId } });
    expect(rows).toEqual([expect.objectContaining({ reason: 'NO_ANSWER', notifiedVia: 'telegram', minutes: 6 })]);
    const ev = await t.prisma.conversationEvent.findFirst({ where: { conversationId: c.conversationId, kind: 'ESCALATED' } });
    expect(ev?.data).toEqual({ minutes: 6, via: 'telegram', ok: true, practice: false });
    await expect(t.prisma.supportEscalation.update({ where: { id: rows[0]!.id }, data: { minutes: 1 } })).rejects.toThrow();
    await expect(t.prisma.supportEscalation.delete({ where: { id: rows[0]!.id } })).rejects.toThrow();
  });

  it('an answered chat is not told; a new wait after the answer is; the practice copy is logged as practice', async () => {
    const c = await say('karim', 'Delivery koto din?');
    // an answer (a person's or EXTAS AI's) ends the wait (actions.ts)
    await t.prisma.conversation.update({ where: { id: c.conversationId }, data: { waitingSince: null, lastDirection: 'OUT' } });
    later(10);
    await sweepEscalations(deps(), S);
    expect(lines).toEqual([]);
    await say('karim', 'Bhai?');
    later(5);
    mode = 'MOCK';
    expect((await sweepEscalations(deps(), S)).told).toBe(1);
    const ev = await t.prisma.conversationEvent.findFirst({ where: { conversationId: c.conversationId, kind: 'ESCALATED' } });
    expect(ev?.data).toMatchObject({ practice: true });
  });

  it('desk hours: the closed night does not count (wait), or does (tell); the desk shows open or closed', async () => {
    await t.prisma.conversation.updateMany({ where: { storeId: S }, data: { waitingSince: null, lastDirection: 'OUT' } });
    overrides.set('support.deskHours', { ...registry['support.deskHours'].default, enabled: true });
    clock = new Date('2026-11-01T17:00:00Z').getTime(); // 23:00 in Dhaka
    expect(await supportDesk(deps(), S)).toEqual({ open: false, next: new Date('2026-11-02T04:00:00Z'), timeZone: 'Asia/Dhaka' });
    await say('night', 'Raat e order dile?');
    later(60);
    expect((await sweepEscalations(deps(), S)).told).toBe(0);
    overrides.set('support.escalation', { ...ON, outsideHours: 'tell' });
    expect((await sweepEscalations(deps(), S)).told).toBe(1);
    overrides.set('support.escalation', ON);
    overrides.delete('support.deskHours');
    expect(await supportDesk(deps(), S)).toBeNull();
  });

  it('the hourly cap holds the rest back; an old backlog and a blocked person are never told', async () => {
    await t.prisma.conversation.updateMany({ where: { storeId: S }, data: { waitingSince: null, lastDirection: 'OUT' } });
    overrides.set('support.escalation', { ...ON, perHour: 1 });
    later(61);
    await say('cap-1', 'one');
    await say('cap-2', 'two');
    later(6);
    expect(await sweepEscalations(deps(), S)).toMatchObject({ told: 1, capped: 1 });
    // a wait from two days ago (the switch just went on) is outside lookBackHours
    await t.prisma.conversation.updateMany({ where: { storeId: S }, data: { waitingSince: null, lastDirection: 'OUT' } });
    overrides.set('support.escalation', ON);
    const old = await say('old', 'old question');
    await t.prisma.conversation.update({ where: { id: old.conversationId }, data: { waitingSince: new Date(clock - 48 * 3_600_000) } });
    const blocked = await say('blocked', 'spam');
    await t.prisma.supportContact.updateMany({ where: { storeId: S, externalId: 'blocked' }, data: { blockedAt: new Date(clock) } });
    overrides.set('support.blockList', { enabled: true });
    later(61);
    lines.length = 0;
    const r = await sweepEscalations(deps(), S);
    // the blocked person's chat is waiting but never told; the old one is not even looked at
    expect(r).toEqual({ waiting: 1, told: 0, capped: 0 });
    expect(lines).toEqual([]);
    expect(await t.prisma.supportEscalation.count({ where: { conversationId: { in: [old.conversationId, blocked.conversationId] } } })).toBe(0);
  });

  it('link safety: a customer\'s links are checked as they arrive; the thread cuts the words around them', async () => {
    overrides.set('support.linkSafety', { ...registry['support.linkSafety'].default, enabled: true, trustedSites: 'extas.com.bd' });
    const c = await say('links', 'Ei offer ta ki apnader? bit.ly/3xYz ar extas.com.bd/p/polo');
    const m = await t.prisma.message.findFirst({ where: { conversationId: c.conversationId, direction: 'IN' }, orderBy: { sentAt: 'desc' } });
    expect((m?.linkSafety as { links: { host: string; risky: boolean; reasons: string[] }[] }).links).toEqual([
      expect.objectContaining({ host: 'bit.ly', risky: true, reasons: ['shortener'] }),
      expect.objectContaining({ host: 'extas.com.bd', risky: false }),
    ]);
    const th = await supportThread(deps(), who, c.conversationId);
    const last = th.messages.at(-1)!;
    expect(last.parts?.map((p) => [p.text, p.link?.risky ?? null])).toEqual([['Ei offer ta ki apnader? ', null], ['bit.ly/3xYz', true], [' ar ', null], ['extas.com.bd/p/polo', false]]);
    overrides.delete('support.linkSafety');
    const off = await say('links', 'abar bit.ly/zz');
    expect((await t.prisma.message.findFirst({ where: { conversationId: off.conversationId }, orderBy: { sentAt: 'desc' } }))?.linkSafety).toBeNull();
    expect((await supportThread(deps(), who, c.conversationId)).messages.every((x) => x.parts === null)).toBe(true);
  });
});
