// PR 12 (CN-025, CN-026 (b)) — PUT /api/admin/look and the Dashboard's one loader on a real PostgreSQL: a person's own
// design and guide choice kept on their staff account (only while the team allows it), the team's written through the
// settings resolver with the person as actor (settings.write), every page and design checked against the registry;
// and every Dashboard part read on an empty shop without an error and without a made-up number. A throwaway database
// (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminLookSettings, messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { lookCatalog } from '@/components/admin/look/registry';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { lookHandler } from './api';
import { DASH_PARTS, loadDashboard, type DashDesignSettings } from './dashboard-data';
import { readPrefs } from './pick';
import { rangeFrom } from './range';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(body: unknown, cookie?: string, method = 'PUT') {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.22', origin: `https://${HOST}`, 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`https://${HOST}/api/admin/look`, { method, headers, body: JSON.stringify(body) });
}
function login(body: unknown) {
  return new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.22', origin: `https://${HOST}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function post(path: string, cookie: string, body: unknown) {
  return new Request(`https://${HOST}${path}`, { method: 'POST', headers: { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.22', origin: `https://${HOST}`, 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('admin look on PostgreSQL (PR 12, CN-025)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let staff = '';
  let staffId = '';
  // The registry's pages, with two more Dashboard keys so a change between designs can be tested (launch has one, CN-027).
  const catalog = { ...lookCatalog(), dashboard: ['A', 'B', 'C'] };
  const scope = { storeId: MOTHER_STORE_ID };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(login({ email: 'owner@example.com', password: OWNER_PW }), deps));
    const role = await rolesHandler(post('/api/admin/roles', owner, { nameEn: 'Orders desk', nameBn: 'অর্ডার ডেস্ক', permissions: ['orders.read', 'settings.read'] }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(post('/api/admin/staff', owner, { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' }), deps);
    staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(post(`/api/admin/staff/${staffId}/roles`, owner, { action: 'assign', roleId, storeId: MOTHER_STORE_ID }), deps, staffId);
    const first = cookiesOf(await loginHandler(login({ email: 'desk@example.com', password: 'first password from the owner' }), deps));
    staff = cookiesOf(await passwordHandler(post('/api/admin/auth/password', first, { current: 'first password from the owner', next: 'my own words for this job' }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a session, PUT only, and a page and design the registry has', async () => {
    expect((await lookHandler(call({ scope: 'me', page: 'dashboard', design: 'C' }), catalog, deps)).status).toBe(401);
    expect((await lookHandler(call({ scope: 'me', page: 'dashboard', design: 'C' }, staff, 'POST'), catalog, deps)).status).toBe(405);
    expect((await lookHandler(call({ scope: 'me', page: 'dashboard', design: 'C' }, staff), catalog, null)).status).toBe(503);
    for (const [body, field] of [
      [{ scope: 'all', page: 'dashboard', design: 'C' }, 'scope'],
      [{ scope: 'me', page: 'nowhere', design: 'A' }, 'page'],
      [{ scope: 'me', page: 'dashboard', design: 'Z' }, 'design'],
      [{ scope: 'me', page: 'orders', design: 'B' }, 'design'],
      [{ scope: 'me', guide: 'window' }, 'guide'],
    ] as const) {
      const res = await lookHandler(call(body, staff), catalog, deps);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'VALIDATION', details: [field] });
    }
  });

  it('a person’s own design and guide choice stay on their account; null follows the team again', async () => {
    const res = await lookHandler(call({ scope: 'me', page: 'dashboard', design: 'C' }, staff), catalog, deps);
    expect(res.status).toBe(200);
    const row = await t.prisma.staffUser.findUnique({ where: { id: staffId }, select: { adminPrefs: true } });
    expect(readPrefs(row?.adminPrefs)).toEqual({ look: { dashboard: 'C' } });
    expect((await lookHandler(call({ scope: 'me', guide: 'popup' }, staff), catalog, deps)).status).toBe(200);
    expect(readPrefs((await t.prisma.staffUser.findUnique({ where: { id: staffId }, select: { adminPrefs: true } }))?.adminPrefs)).toEqual({ look: { dashboard: 'C' }, guide: 'popup' });
    expect((await lookHandler(call({ scope: 'me', page: 'dashboard', design: null }, staff), catalog, deps)).status).toBe(200);
    expect(readPrefs((await t.prisma.staffUser.findUnique({ where: { id: staffId }, select: { adminPrefs: true } }))?.adminPrefs)).toEqual({ look: {}, guide: 'popup' });
    // Nothing of the team's changed.
    expect(await deps.resolver.value('admin.look', scope)).toEqual(adminLookSettings['admin.look'].default);
  });

  it('a personal choice is refused while the team turned it off', async () => {
    const owners = await t.prisma.staffUser.findFirst({ where: { email: 'owner@example.com' }, select: { id: true } });
    await deps.resolver.set('admin.look', { pages: {}, perPerson: false }, storeTarget(MOTHER_STORE_ID), { actorId: owners!.id, reason: 'test: one look for everyone' });
    await deps.resolver.set('admin.guideOpens', { desktop: 'panel', phone: 'sheet', perPerson: false }, storeTarget(MOTHER_STORE_ID), { actorId: owners!.id, reason: 'test' });
    const res = await lookHandler(call({ scope: 'me', page: 'dashboard', design: 'A' }, staff), catalog, deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'PER_PERSON_OFF' });
    expect((await lookHandler(call({ scope: 'me', guide: 'page' }, staff), catalog, deps)).status).toBe(403);
    await deps.resolver.set('admin.look', adminLookSettings['admin.look'].default, storeTarget(MOTHER_STORE_ID), { actorId: owners!.id, reason: 'test: back' });
    await deps.resolver.set('admin.guideOpens', adminLookSettings['admin.guideOpens'].default, storeTarget(MOTHER_STORE_ID), { actorId: owners!.id, reason: 'test: back' });
  });

  it('the team’s design and guide need settings.write, and the change log keeps who did it', async () => {
    expect((await lookHandler(call({ scope: 'team', page: 'dashboard', design: 'C' }, staff), catalog, deps)).status).toBe(403);
    const res = await lookHandler(call({ scope: 'team', page: 'dashboard', design: 'C' }, owner), catalog, deps);
    expect(res.status).toBe(200);
    expect(await deps.resolver.value('admin.look', scope)).toEqual({ pages: { dashboard: 'C' }, perPerson: true });
    const log = await t.prisma.settingChange.findFirst({ where: { key: 'admin.look' }, orderBy: { createdAt: 'desc' } });
    const ownerRow = await t.prisma.staffUser.findFirst({ where: { email: 'owner@example.com' }, select: { id: true } });
    expect(log?.actorId).toBe(ownerRow!.id);
    expect(log?.reason).toContain('dashboard');
    expect((await lookHandler(call({ scope: 'team', page: 'dashboard', design: null }, owner), catalog, deps)).status).toBe(200);
    expect(await deps.resolver.value('admin.look', scope)).toEqual({ pages: {}, perPerson: true });
    expect((await lookHandler(call({ scope: 'team', guide: 'page' }, owner), catalog, deps)).status).toBe(200);
    expect(await deps.resolver.value('admin.guideOpens', scope)).toEqual({ desktop: 'page', phone: 'sheet', perPerson: true });
  });

  it('the Dashboard loader reads every part on an empty shop: zeros and empty lists, never a sample', async () => {
    const s = (await deps.resolver.value('admin.dashboardDesigns', scope)) as DashDesignSettings;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const ctx = { db: t.prisma, settings: deps.resolver, storeId: MOTHER_STORE_ID, now, timeZone: 'UTC', s, range: rangeFrom({ range: '7' }, [1, 7, 30], today, s.customMaxDays), queues: () => Promise.resolve([]) };
    const all = await loadDashboard({ ...ctx, viewer: { perms: new Set(), owner: true } }, DASH_PARTS);
    expect(all.money?.cur.sales).toMatchObject({ orders: 0, itemsMinor: 0 });
    expect(all.money?.cur.ordered).toMatchObject({ orders: 0, valueMinor: 0 });
    expect(all.money?.chart.days).toHaveLength(Math.max(7, s.chartMinDays));
    expect(all.stages).toMatchObject({ placed: 0, open: 0, o2cHours: null });
    expect(all.delivery).toMatchObject({ finished: 0, rate: null, couriers: [] });
    expect(all.top).toEqual([]);
    expect(all.lowStock).toEqual([]);
    // A part the person may not open is not read at all.
    const desk = await loadDashboard({ ...ctx, viewer: { perms: new Set(['orders.read']), owner: false } }, DASH_PARTS);
    expect(desk.money).toBeNull();
    expect(desk.top).toBeNull();
    expect(desk.lowStock).toBeNull();
    expect(desk.stages).not.toBeNull();
    expect([...desk.parts].sort()).toEqual(['delivery', 'queues', 'stages']);
  });
});
