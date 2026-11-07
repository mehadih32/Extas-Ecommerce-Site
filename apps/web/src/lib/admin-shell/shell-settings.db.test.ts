// PR 495 (12) follow-up 205 — Settings › More › Start & search on a real PostgreSQL: as shipped at first (every role on
// the Dashboard, both helpers off); a save of each card and switch lands in its setting, is audited and writes nothing
// when unchanged; a stale version, an unknown role or section, evening before afternoon, a date choice twice and a staff
// member who may only look are refused. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { shellSettingsHandler, type ShellScreen } from './shell-settings';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.78', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/settings/shell'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Settings › Start & search on PostgreSQL (follow-up 205)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  let roleKey = '';
  const saved = process.env.DATABASE_URL;
  type Err = { ok: boolean; error?: string; details?: string[] };
  const go = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
    const res = await shellSettingsHandler(req(method, { body: o.body, cookie: o.cookie ?? owner }), admin);
    return { status: res.status, a: (await res.json()) as ShellScreen & Err };
  };
  const audits = () => t.prisma.auditLog.count({ where: { action: 'settings.adminShell.save' } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_shell_settings');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Packing desk', nameBn: 'প্যাকিং ডেস্ক', permissions: ['settings.read', 'orders.read'] } }), admin);
    const made = (await role.json()) as { role: { id: string; key: string } };
    roleKey = made.role.key;
    const staff = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await staff.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId: made.role.id, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('as shipped: every role on the Dashboard, both helpers off; a looker may see but not change', async () => {
    const h = (await go('GET')).a;
    expect(h.ok).toBe(true);
    expect(h.cards['admin.startPages'].value[roleKey]).toBe('dashboard');
    expect(h.switches).toEqual({ recentPages: { on: false, count: 10 }, keyJumps: { on: false } });
    expect(h.cards['admin.dashboard'].value.ranges).toEqual([{ days: 1 }, { days: 7 }, { days: 30 }]);
    expect((await go('GET', { cookie: desk })).status).toBe(200);
    expect((await go('PUT', { cookie: desk, body: { key: 'keyJumps', on: true, values: {} } })).status).toBe(403);
  });

  it('the switch cards: recent pages with a count, key jumps; audited; the search numbers stay', async () => {
    expect((await go('PUT', { body: { key: 'recentPages', on: true, values: { count: 4 } } })).a.switches.recentPages).toEqual({ on: true, count: 4 });
    expect((await go('PUT', { body: { key: 'keyJumps', on: true, values: {} } })).a.switches.keyJumps).toEqual({ on: true });
    expect(await resolver.value('admin.shell', { storeId: S })).toEqual({ badgeCacheSeconds: 30, searchPerGroup: 5, searchMinChars: 2, recentPages: 4, keyJumps: true });
    expect(await audits()).toBe(2);
    await go('PUT', { body: { key: 'keyJumps', on: true, values: {} } });
    expect(await audits()).toBe(2);
    expect((await go('PUT', { body: { key: 'keyJumps', values: {} } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['on'] });
  });

  it('the cards: start page per role, the search numbers and the Dashboard; stale and bad values refused', async () => {
    const h = (await go('GET')).a;
    const start = h.cards['admin.startPages'];
    const put = await go('PUT', { body: { key: 'admin.startPages', value: { ...start.value, [roleKey]: 'orders' }, version: start.version } });
    expect(put.a.cards['admin.startPages'].value[roleKey]).toBe('orders');
    expect(await resolver.value('admin.startPages', { storeId: S })).toEqual({ [roleKey]: 'orders' });
    expect((await go('PUT', { body: { key: 'admin.startPages', value: { ...start.value, [roleKey]: 'money' }, version: start.version } })).a).toMatchObject({ ok: false, error: 'STALE' });
    const next = put.a.cards['admin.startPages'];
    expect((await go('PUT', { body: { key: 'admin.startPages', value: { ...next.value, [roleKey]: 'ai' }, version: next.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: [roleKey] });
    expect((await go('PUT', { body: { key: 'admin.startPages', value: { ...next.value, 'no-such-role': 'orders' }, version: next.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['no-such-role'] });

    const search = h.cards['admin.shell'];
    const s2 = await go('PUT', { body: { key: 'admin.shell', value: { ...search.value, searchPerGroup: 8 }, version: search.version } });
    expect(s2.a.cards['admin.shell'].value.searchPerGroup).toBe(8);
    expect(await resolver.value('admin.shell', { storeId: S })).toMatchObject({ searchPerGroup: 8, recentPages: 4, keyJumps: true });
    expect((await go('PUT', { body: { key: 'admin.shell', value: { ...s2.a.cards['admin.shell'].value, recentPages: 9 }, version: s2.a.cards['admin.shell'].version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['recentPages'] });
    expect((await go('PUT', { body: { key: 'admin.shell', value: { ...s2.a.cards['admin.shell'].value, searchMinChars: 9 }, version: s2.a.cards['admin.shell'].version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['searchMinChars'] });

    const dash = h.cards['admin.dashboard'];
    const d2 = await go('PUT', { body: { key: 'admin.dashboard', value: { ...dash.value, ranges: [{ days: 7 }, { days: 90 }] }, version: dash.version } });
    expect(await resolver.value('admin.dashboard', { storeId: S })).toEqual({ ranges: [7, 90], afternoonHour: 12, eveningHour: 17, sparkDays: 14 });
    const dv = d2.a.cards['admin.dashboard'];
    expect((await go('PUT', { body: { key: 'admin.dashboard', value: { ...dv.value, afternoonHour: 18 }, version: dv.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['eveningHour'] });
    expect((await go('PUT', { body: { key: 'admin.dashboard', value: { ...dv.value, ranges: [{ days: 7 }, { days: 7 }] }, version: dv.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['ranges'] });
    expect(await audits()).toBe(5);
  });
});
