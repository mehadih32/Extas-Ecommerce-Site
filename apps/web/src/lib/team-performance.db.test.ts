// S16 · PR 352 — team performance on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): each person's orders
// confirmed, packed, handed to the courier (each order once) and support replies (internal notes and other periods left
// out) counted from the records; the most in each gets a badge (ties share it, none for 0) and a minimum reached gets one;
// off as shipped, nothing counted; the setting saved with its version and audited; a reader may not change it.
// The weeks run Saturday to Friday. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { badgesFor, teamPeriod, teamRoute, teamView } from './team-performance';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const at = (d: number, h = 10) => new Date(`2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00+06:00`);
const req = (method: string, body?: unknown, cookie?: string) =>
  new Request(`https://${HOST}/api/admin/reports/team?storeId=1`, { method, headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.78', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe('team periods and badges (PR 352)', () => {
  it('weeks run Saturday to Friday; months by the calendar; the one before', () => {
    expect(teamPeriod('2026-11-07', 'week', 0)).toEqual({ from: '2026-11-07', to: '2026-11-07' }); // a Saturday
    expect(teamPeriod('2026-11-12', 'week', 0)).toEqual({ from: '2026-11-07', to: '2026-11-12' });
    expect(teamPeriod('2026-11-12', 'week', 1)).toEqual({ from: '2026-10-31', to: '2026-11-06' });
    expect(teamPeriod('2026-11-12', 'month', 0)).toEqual({ from: '2026-11-01', to: '2026-11-12' });
    expect(teamPeriod('2026-03-05', 'month', 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('the most in each measure (ties share, none for 0) and each minimum reached', () => {
    const z = { confirmed: 0, packed: 0, handedOver: 0, replies: 0 };
    const rows = badgesFor(
      [
        { staffId: 'a', name: 'A', counts: { ...z, confirmed: 5, replies: 2 } },
        { staffId: 'b', name: 'B', counts: { ...z, confirmed: 5, packed: 1 } },
      ],
      { top: true, mins: { confirmed: null, packed: null, handedOver: null, replies: 2 } },
    );
    expect(rows[0]!.badges).toEqual([{ measure: 'confirmed', kind: 'top' }, { measure: 'replies', kind: 'top' }, { measure: 'replies', kind: 'min' }]);
    expect(rows[1]!.badges).toEqual([{ measure: 'confirmed', kind: 'top' }, { measure: 'packed', kind: 'top' }]);
    expect(badgesFor(rows, { top: false, mins: { confirmed: null, packed: null, handedOver: null, replies: null } }).every((r) => !r.badges.length)).toBe(true);
  });
});

describe.skipIf(!HAS_TEST_DB)('team performance on PostgreSQL (PR 352)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let S = 0;
  let owner = '';
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('team');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.78' }, body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PW }) }), deps));
    ids.rana = (await t.prisma.staffUser.create({ data: { email: 'rana@example.com', displayName: 'Sample Rana', passwordHash: 'x' } })).id;
    ids.mitu = (await t.prisma.staffUser.create({ data: { email: 'mitu@example.com', displayName: 'Sample Mitu', passwordHash: 'x' } })).id;
    let n = 0;
    const order = async () => (await t.prisma.order.create({ data: { storeId: S, number: `L352-${++n}`, source: 'WEBSITE', currency: 'BDT', subtotalMinor: 1_000, totalMinor: 1_000, idempotencyKey: `l352-${n}` } })).id;
    const ev = (orderId: string, toStatus: 'CONFIRMED' | 'PACKED' | 'HANDED_OVER', who: string, when: Date) => t.prisma.orderEvent.create({ data: { storeId: S, orderId, type: 'status', toStatus, actorType: 'STAFF', actorId: who, source: 'admin', createdAt: when } });
    const o1 = await order();
    const o2 = await order();
    const o3 = await order();
    await ev(o1, 'CONFIRMED', ids.rana, at(8));
    await ev(o1, 'CONFIRMED', ids.rana, at(8, 11)); // the same order again counts once
    await ev(o2, 'CONFIRMED', ids.rana, at(9));
    await ev(o3, 'CONFIRMED', ids.mitu, at(9));
    await ev(o1, 'PACKED', ids.mitu, at(10));
    await ev(o2, 'HANDED_OVER', ids.mitu, at(10));
    await ev(o3, 'CONFIRMED', ids.mitu, at(6)); // the week before (Fri 6 Nov)
    const channel = await t.prisma.supportChannel.create({ data: { storeId: S, kind: 'WEBCHAT', externalId: 'sample-web', name: 'Sample chat' } });
    const contact = await t.prisma.supportContact.create({ data: { storeId: S, channelKind: 'WEBCHAT', externalId: 'sample-visitor' } });
    const conv = await t.prisma.conversation.create({ data: { storeId: S, channelId: channel.id, contactId: contact.id, status: 'OPEN', refCode: 'L352-1' } });
    const msg = (direction: string, who: string | null, note: boolean, when: Date) => t.prisma.message.create({ data: { storeId: S, conversationId: conv.id, direction, senderType: who ? 'STAFF' : 'CUSTOMER', senderStaffId: who, body: 'Sample', isInternalNote: note, sentAt: when } });
    await msg('OUT', ids.mitu, false, at(9));
    await msg('OUT', ids.mitu, false, at(10));
    await msg('NOTE', ids.mitu, true, at(10));
    await msg('IN', null, false, at(10));
    await msg('OUT', ids.rana, false, at(10));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('off as shipped: nothing counted', async () => {
    const v = await teamView(deps, S, 0, at(12));
    expect(v.settings.value.enabled).toBe(false);
    expect(v.rows).toEqual([]);
    expect({ from: v.from, to: v.to }).toEqual({ from: '2026-11-07', to: '2026-11-12' });
  });

  it('on: each person’s work this week from the records, with the badges', async () => {
    const v0 = await teamView(deps, S, 0, at(12));
    const saved = await teamRoute(req('PUT', { value: { ...v0.settings.value, enabled: true, mins: { ...v0.settings.value.mins, replies: 2 } }, version: v0.settings.version }, owner), deps);
    expect(saved.status).toBe(200);
    const v = await teamView(deps, S, 0, at(12));
    const row = (name: string) => v.rows.find((r) => r.name === name)!;
    expect(row('Sample Rana').counts).toEqual({ confirmed: 2, packed: 0, handedOver: 0, replies: 1 });
    expect(row('Sample Mitu').counts).toEqual({ confirmed: 1, packed: 1, handedOver: 1, replies: 2 });
    expect(row('Sample Rana').badges).toEqual([{ measure: 'confirmed', kind: 'top' }]);
    expect(row('Sample Mitu').badges).toEqual([
      { measure: 'packed', kind: 'top' },
      { measure: 'handedOver', kind: 'top' },
      { measure: 'replies', kind: 'top' },
      { measure: 'replies', kind: 'min' },
    ]);
    const before = await teamView(deps, S, 1, at(12));
    expect(before.rows.map((r) => [r.name, r.counts.confirmed])).toEqual([['Sample Mitu', 1]]);
  });

  it('the setting: a stale version refused, a bad minimum refused, audited once; signed out refused', async () => {
    const v = await teamView(deps, S, 0, at(12));
    expect((await teamRoute(req('PUT', { value: v.settings.value, version: v.settings.version - 1 }, owner), deps)).status).toBe(200); // no change, nothing written
    expect((await teamRoute(req('PUT', { value: { ...v.settings.value, top: false }, version: v.settings.version - 1 }, owner), deps)).status).toBe(409);
    expect((await teamRoute(req('PUT', { value: { ...v.settings.value, mins: { ...v.settings.value.mins, packed: 0 } }, version: v.settings.version }, owner), deps)).status).toBe(400);
    expect((await teamRoute(req('PUT', { value: v.settings.value, version: v.settings.version }), deps)).status).toBe(401);
    expect((await teamRoute(req('GET', undefined, owner), deps)).status).toBe(405);
    expect(await t.prisma.auditLog.count({ where: { action: 'team.badges' } })).toBe(1);
  });
});
