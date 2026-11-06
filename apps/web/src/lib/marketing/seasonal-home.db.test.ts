// S13 · PR 280 — Marketing › Seasonal home on a real PostgreSQL: off as shipped (nothing saved while off, the home page
// unchanged); a look saved from the home page as it is, then changed for the season (sections and order, hero lines in
// both languages or the usual words, a collection that must exist); windows typed on the shop's clock, never
// overlapping, ending after they start; the home page (lib/shop/seasonal-home, the switch read once it is on) shows the live window's look and is the owner's own again after
// it or once it is stopped (stopped windows kept); a look in use cannot be set aside; seeing needs
// `marketing.campaigns.read`, changing `marketing.campaigns.write`; audited.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { HOME_SECTIONS, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { defaultShopSettings, type ShopContext } from '../shop/context';
import { seasonalHome } from '../shop/seasonal-home';
import { seasonalHomeHandler, type SeasonalHomeOverview } from './seasonal-home';

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
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.49', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/seasonal'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Seasonal home on PostgreSQL (PR 280)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  let now = T0;
  const saved = process.env.DATABASE_URL;
  const ids: Record<string, string> = {};
  type Answer = SeasonalHomeOverview & { ok: boolean; error?: string; details?: string[]; id?: string; cards?: { seasonalHome: SeasonalHomeOverview['card'] } };
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const res = await seasonalHomeHandler(req(method, { body, cookie }), admin, () => new Date(now));
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const shop = () => ({ live: true, storeId: S, s: defaultShopSettings() }) as unknown as ShopContext;

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_seasonal_home');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Season desk', nameBn: 'মৌসুম ডেস্ক', permissions: ['marketing.campaigns.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
    await t.prisma.collection.create({ data: { storeId: S, slug: 'eid-edit', nameEn: 'Eid edit', kind: 'SEASONAL' } });
  });
  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('is off as shipped: the page reads, nothing is saved, the home page is unchanged; read and write keys', async () => {
    const g = await api('GET', undefined, desk);
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ settings: { enabled: false }, timeZone: 'Asia/Dhaka', live: null, looks: [], windows: [], collections: [{ slug: 'eid-edit' }] });
    expect((await api('POST', { action: 'look.save', name: 'Eid 2027' })).a).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    expect((await api('PUT', { key: 'seasonalHome', value: { enabled: true }, version: g.a.card.version }, desk)).status).toBe(403);
    expect((await api('PUT', { key: 'seasonalHome', value: { enabled: 'yes' }, version: g.a.card.version })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['enabled'] });
    expect((await api('PUT', { key: 'seasonalHome', value: { enabled: true }, version: 'old' })).a).toMatchObject({ ok: false, error: 'STALE' });
    const on = await api('PUT', { key: 'seasonalHome', value: { enabled: true }, version: g.a.card.version });
    expect(on.a.cards!.seasonalHome.value).toEqual({ enabled: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'seasonalHome.settings' } })).toBe(1);
  });

  it('saves the home page as it is as a look, then changes it for the season; bad input is refused', async () => {
    expect((await api('POST', { action: 'look.save', name: ' ' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['name'] });
    expect((await api('POST', { action: 'look.save', name: 'Eid 2027' }, desk)).status).toBe(403);
    const s = await api('POST', { action: 'look.save', name: 'Eid 2027' });
    ids.eid = s.a.id!;
    const look0 = (await api('GET')).a.looks[0]!;
    expect(look0).toMatchObject({ id: ids.eid, name: 'Eid 2027', archived: false, collection: null, inUse: false, hero: { eyebrow: null, title: null, sub: null } });
    expect(look0.sections.map((x) => x.id)).toEqual([...HOME_SECTIONS]);
    const sections = [{ id: 'hero', on: true }, { id: 'new-in', on: true }, { id: 'categories', on: true }, ...HOME_SECTIONS.filter((x) => !['hero', 'new-in', 'categories'].includes(x)).map((id) => ({ id, on: false }))];
    const edit = { action: 'look.update', id: ids.eid, name: 'Eid 2027', sections, hero: { eyebrow: { en: '', bn: '' }, title: { en: 'Eid edit', bn: 'ঈদ সংগ্রহ' }, sub: { en: '', bn: '' } }, collection: 'eid-edit' };
    expect((await api('POST', { ...edit, hero: { title: { en: 'Eid edit', bn: '' } }, collection: 'no-such', sections: [{ id: 'hero', on: true }, { id: 'hero', on: false }] })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['sections', 'title', 'collection'] });
    expect((await api('POST', edit)).a.ok).toBe(true);
    const look1 = (await api('GET')).a.looks[0]!;
    expect(look1).toMatchObject({ collection: 'eid-edit', hero: { eyebrow: null, title: { en: 'Eid edit', bn: 'ঈদ সংগ্রহ' }, sub: null } });
    expect(look1.sections.slice(0, 3)).toEqual(sections.slice(0, 3));
    ids.winter = (await api('POST', { action: 'look.save', name: 'Winter' })).a.id!;
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['seasonalHome.look.save', 'seasonalHome.look.update'] } } })).toBe(3);
  });

  it('schedules windows on the shop clock: ends after starts and in the future, never overlapping', async () => {
    const add = (o: Record<string, unknown>, cookie = owner) => api('POST', { action: 'window.add', lookId: ids.eid, ...o }, cookie);
    expect((await add({ starts: '2027-03-09T25:00', ends: '2027-03-01T10:00' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['starts', 'ends'] });
    expect((await add({ starts: '2027-03-09T18:00', ends: '2027-03-09T18:00' })).a).toMatchObject({ ok: false, details: ['ends'] });
    expect((await add({ lookId: '00000000-0000-7000-8000-000000000000', starts: '2027-03-09T18:00', ends: '' })).a).toMatchObject({ ok: false, error: 'NOT_FOUND', details: ['lookId'] });
    expect((await add({ starts: '2027-03-09T18:00', ends: '2027-03-12T23:59' }, desk)).status).toBe(403);
    const a = await add({ starts: '2027-03-09T18:00', ends: '2027-03-12T23:59' });
    ids.w1 = a.a.id!;
    expect((await add({ lookId: ids.winter, starts: '2027-03-12T20:00', ends: '' })).a).toMatchObject({ ok: false, error: 'OVERLAP' });
    ids.w2 = (await api('POST', { action: 'window.add', lookId: ids.winter, starts: '2027-03-13T00:00', ends: '' })).a.id!;
    const g = (await api('GET')).a;
    expect(g.windows.find((w) => w.id === ids.w1)).toMatchObject({ lookName: 'Eid 2027', starts: '2027-03-09T18:00', ends: '2027-03-12T23:59', state: 'UPCOMING' });
    expect(g.windows.find((w) => w.id === ids.w2)).toMatchObject({ lookName: 'Winter', ends: null, state: 'UPCOMING' });
    expect((await t.prisma.scheduledLayoutSwitch.findUnique({ where: { id: ids.w1 } }))!.applyAt.toISOString()).toBe('2027-03-09T12:00:00.000Z');
    expect(g.looks.find((l) => l.id === ids.eid)!.inUse).toBe(true);
    expect((await api('POST', { action: 'look.archive', id: ids.eid })).a).toMatchObject({ ok: false, error: 'IN_USE' });
  });

  it('the home page shows the live window’s look, then the owner’s own again after it or once stopped', async () => {
    const c = shop();
    expect(await seasonalHome(c, new Date(now))).toBe(c);
    const inside = new Date('2027-03-10T06:00:00Z');
    now = inside.getTime();
    const g = (await api('GET')).a;
    expect(g.live).toMatchObject({ id: ids.w1, lookName: 'Eid 2027', state: 'LIVE' });
    const eid = await seasonalHome(c, inside);
    expect(eid.s['home.sections'].filter((x) => x.on).map((x) => x.id)).toEqual(['hero', 'new-in', 'categories']);
    expect(eid.s['home.hero'].title).toEqual({ en: 'Eid edit', bn: 'ঈদ সংগ্রহ' });
    expect(eid.s['home.hero'].eyebrow).toEqual(registry['home.hero'].default.eyebrow);
    expect(eid.s['home.heroSlides'].collection).toBe('eid-edit');
    expect(eid.s['store.name']).toBe(c.s['store.name']);
    const after = new Date('2027-03-13T06:00:00Z');
    expect((await seasonalHome(c, after)).s['home.sections']).toEqual(registry['home.sections'].default);
    expect((await seasonalHome(c, new Date('2027-03-12T18:30:00Z'))).s['home.heroSlides'].collection).toBeNull();
    expect((await api('POST', { action: 'window.stop', id: ids.w1 }, desk)).status).toBe(403);
    expect((await api('POST', { action: 'window.stop', id: ids.w1 })).a.ok).toBe(true);
    expect(await seasonalHome(c, inside)).toBe(c);
    expect((await api('POST', { action: 'window.stop', id: ids.w1 })).a).toMatchObject({ ok: false, error: 'ENDED' });
    const g2 = (await api('GET')).a;
    expect(g2.live).toBeNull();
    expect(g2.windows.find((w) => w.id === ids.w1)).toMatchObject({ state: 'STOPPED' });
    expect(g2.windows.find((w) => w.id === ids.w1)!.stoppedAt).toBe(inside.toISOString());
    expect(await t.prisma.scheduledLayoutSwitch.count()).toBe(2);
  });

  it('sets a free look aside and back, never deleting; while off only stopping and setting aside work', async () => {
    expect((await api('POST', { action: 'look.archive', id: ids.eid })).a.ok).toBe(true);
    expect((await api('POST', { action: 'window.add', lookId: ids.eid, starts: '2027-04-01T00:00', ends: '' })).a).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    expect((await api('POST', { action: 'look.restore', id: ids.eid })).a.ok).toBe(true);
    const g = (await api('GET')).a;
    const off = await api('PUT', { key: 'seasonalHome', value: { enabled: false }, version: g.card.version });
    expect(off.a.ok).toBe(true);
    expect((await api('POST', { action: 'look.save', name: 'Puja' })).a).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    now = Date.parse('2027-03-14T06:00:00Z');
    expect((await api('GET')).a).toMatchObject({ settings: { enabled: false }, live: null });
    expect((await api('POST', { action: 'window.stop', id: ids.w2 })).a.ok).toBe(true);
    expect(await t.prisma.layoutSnapshot.count()).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'seasonalHome.window.' } } })).toBe(4);
  });
});
