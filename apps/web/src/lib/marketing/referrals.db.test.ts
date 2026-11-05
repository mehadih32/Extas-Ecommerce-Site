// S13 · PR 273 — Marketing › Referrals on a real PostgreSQL: off as shipped (no rule, no reward, not live); only the
// owner (`rules.approve`) saves the programme, the friend offer must be a rule that asks for a code, the reward is typed
// in taka and kept in minor units; a friend's order with an invite code shows with its reward state; "Give reward" needs
// the wallet permission, the confirm and a delivered order, pays once into the sharer's wallet (REFERRAL) and stops at
// the most rewards per customer. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { myInvite, redeemCoupon } from '@extas/rules';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { rulesRoute } from '../rules-api';
import { referralsHandler, type ReferralsOverview } from './referrals';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = new Date('2026-11-05T08:00:00Z');

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.46', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/referrals'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Referrals on PostgreSQL (PR 273)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  type Answer = ReferralsOverview & { ok: boolean; error?: string; details?: string[]; cards?: { programme: ReferralsOverview['card'] }; reward?: { rewardMinor: number; walletEntryId: string } };
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const res = await referralsHandler(req(method, { body, cookie }), admin, { now: () => T0 });
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const rules = async (method: string, path: string[], body?: unknown) => (await rulesRoute(req(method, { path: `/api/admin/rules/${path.join('/')}`, body, cookie: owner }), admin, path)).json() as Promise<Record<string, any>>;

  beforeAll(async () => {
    t = await createTestDatabase('web_ref');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Campaign desk', nameBn: 'ক্যাম্পেইন ডেস্ক', permissions: ['marketing.campaigns.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped; only the owner saves it; the friend offer must ask for a code; the reward is typed in taka', async () => {
    const g = await api('GET', undefined, desk);
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ live: false, rules: [], uses: [], totals: { codes: 0, uses: 0, delivered: 0, rewarded: 0, rewardedMinor: 0 } });
    expect(g.a.card.value).toMatchObject({ on: false, friendRuleKey: '', rewardMinor: null, rewardsMax: null });
    expect(g.a.cards!.programme.version).toBe(g.a.card.version);
    // a plain policy rule cannot be the friend offer; a free-delivery code rule can
    await rules('POST', [], { key: 'care-note', kind: 'policy', nameEn: 'Care note' });
    const made = await rules('POST', [], { templateId: 'coupon-free-delivery', key: 'friend-code', nameEn: 'Friend free delivery' });
    const saved = await rules('PUT', [made.rule.id, 'draft'], { content: { ...made.rule.live, status: 'ACTIVE' }, version: made.rule.version });
    await rules('POST', [made.rule.id, 'publish'], { version: saved.rule.version });
    const value = { ...g.a.card.value, on: true, friendRuleKey: 'friend-code', rewardMinor: 100, rewardsMax: 1 };
    expect((await api('PUT', { key: 'programme', value, version: g.a.card.version }, desk)).status).toBe(403);
    expect((await api('PUT', { key: 'programme', value: { ...value, friendRuleKey: 'care-note' }, version: g.a.card.version })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['friendRuleKey'] });
    expect((await api('PUT', { key: 'programme', value: { ...value, rewardMinor: '' }, version: 'old' })).a.error).toBe('STALE');
    const put = await api('PUT', { key: 'programme', value, version: g.a.card.version });
    expect(put.status).toBe(200);
    expect(put.a.cards!.programme.value).toMatchObject({ rewardMinor: 100 });
    expect(await admin.resolver.value('referrals.programme', { storeId: S })).toMatchObject({ on: true, rewardMinor: 10000, rewardsMax: 1 });
    const now = await api('GET');
    expect(now.a).toMatchObject({ live: true, rules: [{ key: 'friend-code', live: true }] });
    expect(now.a.card.value.rewardMinor).toBe(100);
  });

  it("a friend's order shows its reward state; the reward needs the wallet permission, the confirm and delivery, is paid once, and stops at the cap", async () => {
    const sharer = await t.prisma.customer.create({ data: { storeId: S, phone: '+8801711000280', name: 'Sample sharer' } });
    const settings = { db: t.prisma, settings: admin.resolver, now: () => T0 };
    const mine = (await myInvite(settings, { storeId: S, customerId: sharer.id }))!;
    const order = (num: string, phone: string) => t.prisma.order.create({ data: { storeId: S, number: num, source: 'WEBSITE', currency: 'BDT', placedAt: T0, paymentMethod: 'COD', subtotalMinor: 150000, totalMinor: 150000, idempotencyKey: `idem-${num}`, phone, status: 'PLACED' } });
    const o1 = await order('S-2801', '+8801711000281');
    const o2 = await order('S-2802', '+8801711000282');
    for (const o of [o1, o2]) await t.prisma.$transaction((tx) => redeemCoupon(tx, { storeId: S, code: mine.code, orderId: o.id, phone: o.phone, discountMinor: 0, now: T0 }));
    const g = await api('GET');
    expect(g.a.totals).toMatchObject({ codes: 1, uses: 2, delivered: 0, rewarded: 0 });
    expect(g.a.uses.map((u) => [u.order?.number, u.code, u.sharer.name, u.block])).toEqual([
      ['S-2802', mine.code, 'Sample sharer', 'NOT_DELIVERED'],
      ['S-2801', mine.code, 'Sample sharer', 'NOT_DELIVERED'],
    ]);
    const id = g.a.uses[1]!.id;
    expect((await api('POST', { action: 'reward', id, confirm: true })).a.error).toBe('NOT_DELIVERED');
    await t.prisma.order.updateMany({ where: { id: { in: [o1.id, o2.id] } }, data: { status: 'DELIVERED' } });
    expect((await api('POST', { action: 'reward', id, confirm: true }, desk)).status).toBe(403);
    expect((await api('POST', { action: 'reward', id })).a.error).toBe('CONFIRM_REQUIRED');
    const paid = await api('POST', { action: 'reward', id, confirm: true });
    expect(paid.status).toBe(200);
    expect(paid.a.reward).toMatchObject({ rewardMinor: 10000 });
    const entry = await t.prisma.walletEntry.findUniqueOrThrow({ where: { id: paid.a.reward!.walletEntryId } });
    expect(entry).toMatchObject({ direction: 'CREDIT', amountMinor: 10000, reason: 'REFERRAL', idempotencyKey: `referral:${id}` });
    expect((await t.prisma.walletAccount.findUniqueOrThrow({ where: { customerId: sharer.id } })).balanceMinor).toBe(10000);
    expect((await api('POST', { action: 'reward', id, confirm: true })).a.error).toBe('GIVEN');
    const after = await api('GET');
    expect(after.a.totals).toMatchObject({ delivered: 2, rewarded: 1, rewardedMinor: 10000 });
    expect(after.a.uses.map((u) => [u.status, u.block])).toEqual([
      ['PENDING', 'CAP'],
      ['REWARDED', 'GIVEN'],
    ]);
    expect((await api('POST', { action: 'reward', id: after.a.uses[0]!.id, confirm: true })).a.error).toBe('CAP');
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['referrals.settings', 'referrals.reward'] } } })).toBe(2);
  });
});
