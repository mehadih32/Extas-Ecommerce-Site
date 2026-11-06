// S13 · PR 281 — Marketing › Festive cut-off on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL), through the
// real admin API (sign-in, permissions), the settings resolver and a festive Smart Rule made from the PR 214 template
// and switched on: off as shipped (the shop says nothing), the card's checks (both languages or none, a link only on
// the shop and only with its words, stale versions), the audit line, what each live rule says now per band, and the
// shop's own read (lib/rules-public festiveLines) once switched on, only where ticked. Every date is a test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { festiveLines } from '../rules-public';
import { festiveCutoffHandler, type FestiveCutoffOverview } from './festive-cutoff';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = Date.parse('2027-03-01T06:00:00Z'); // 12:00 on the shop's clock (Asia/Dhaka)

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.51', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/festive'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Festive cut-off on PostgreSQL (PR 281)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = FestiveCutoffOverview & { ok: boolean; error?: string; details?: string[]; cards?: { festiveCutoff: FestiveCutoffOverview['card'] } };
  const api = async (method: string, body?: unknown, cookie = owner, now = T0) => {
    const res = await festiveCutoffHandler(req(method, { body, cookie }), admin, () => new Date(now));
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const card = (value: Record<string, unknown>, version: string) => ({ key: 'festiveCutoff', value: { enabled: true, places: { home: true, product: false, checkout: false }, title: null, linkHref: null, linkLabel: null, ...value }, version });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_festive_cutoff');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Festive desk', nameBn: 'উৎসব ডেস্ক', permissions: ['marketing.campaigns.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
    await t.prisma.deliveryBand.create({ data: { storeId: S, key: 'outside-dhaka', nameEn: 'Outside Dhaka', nameBn: 'ঢাকার বাইরে', chargeMinor: 0, sortOrder: 0 } });
  });
  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('is off as shipped: the page reads with no rule; reading and changing keys (the shop staying silent while off: @extas/rules festive.db.test)', async () => {
    const g = await api('GET', undefined, desk);
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ settings: { enabled: false, places: { home: true, product: true, checkout: true }, title: null }, timeZone: 'Asia/Dhaka', rules: [] });
    expect((await api('PUT', card({}, g.a.card.version), desk)).status).toBe(403);
  });

  it('checks the card: one language, a link without words, a link off the shop, a stale version; then saves and audits', async () => {
    const v = (await api('GET')).a.card.version;
    expect((await api('PUT', card({ title: { en: 'Eid delivery', bn: '' } }, v))).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['title'] });
    expect((await api('PUT', card({ linkHref: '/collections/eid' }, v))).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['linkLabel'] });
    expect((await api('PUT', card({ linkHref: 'https://example.com/', linkLabel: { en: 'Shop', bn: 'কিনুন' } }, v))).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await api('PUT', card({}, 'old'))).a).toMatchObject({ ok: false, error: 'STALE' });
    // an empty link box is no link
    const on = await api('PUT', card({ title: { en: 'Eid delivery', bn: 'ঈদের ডেলিভারি' }, linkHref: '  ' }, v));
    expect(on.a.cards!.festiveCutoff.value).toEqual({ enabled: true, places: { home: true, product: false, checkout: false }, title: { en: 'Eid delivery', bn: 'ঈদের ডেলিভারি' }, linkHref: null, linkLabel: null });
    expect(await t.prisma.auditLog.count({ where: { action: 'festiveCutoff.settings' } })).toBe(1);
  });

  it('shows each live festive rule with its band times and its words now; the shop reads it only where ticked', async () => {
    const staff = await t.prisma.staffUser.findFirstOrThrow({ where: { email: 'owner@example.com' } });
    const who: rl.Who = { actor: { staffUserId: staff.id }, storeId: S };
    const rdeps: rl.RulesDeps = { db: t.prisma, settings: admin.resolver };
    const r = await rl.createRule(rdeps, who, { templateId: 'festive' });
    const times: Record<string, string> = { cutoffDhakaCity: '2027-03-06T23:59:00+06:00', cutoffOutsideDhaka: '2027-02-27T23:59:00+06:00' };
    const params = r.live!.params.map((p) => (times[p.key] ? { ...p, value: times[p.key] } : p));
    await rl.saveDraft(rdeps, who, r.id, { content: { ...r.live!, params, status: 'ACTIVE' } });
    await rl.publishRule(rdeps, who, r.id);
    const g = await api('GET');
    expect(g.a.rules).toHaveLength(1);
    const row = g.a.rules[0]!;
    expect(row).toMatchObject({ key: 'festive', state: 'open', places: ['home', 'product', 'checkout'] });
    expect(row.cuts).toEqual([
      { band: 'outside-dhaka', bandName: { en: 'Outside Dhaka', bn: 'ঢাকার বাইরে' }, at: times.cutoffOutsideDhaka, passed: true },
      { band: 'dhaka-city', bandName: null, at: times.cutoffDhakaCity, passed: false },
      { band: 'dhaka-sub-area', bandName: null, at: times.cutoffDhakaCity, passed: false },
    ]);
    expect(row.now.en).toMatch(/^Order by .+ for delivery before the festival/);
    expect(row.now.bn).toContain('উৎসবের আগে পেতে');
    // after every time: the after words
    expect((await api('GET', undefined, owner, Date.parse('2027-03-08T06:00:00Z'))).a.rules[0]).toMatchObject({ state: 'closed', now: { en: 'Orders placed now arrive after the festival.' } });
    // the shop (its own clock and its own settings reader, first read here, after the switch): the home page ticked, the product page not
    const [home] = await festiveLines({ storeId: S, place: 'home', locale: 'en-BD' });
    expect(home).toMatchObject({ key: 'festive', state: 'open' });
    expect(await festiveLines({ storeId: S, place: 'product', locale: 'en-BD' })).toEqual([]);
  });
});
