// S29 · PR 758–760 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL; written without being run — no database on
// the machine it was made on): the lens route. Off as shipped (the page switch and the lens's own switch each answer
// `not_on` and read nothing), signed out 401, a write 405, a bad lens or parent 400, the owner gets the figures, and the
// period is held to `costs.report`. The setting is given through a wrapper over the resolver, so this test does not depend on
// where the screen's lane registers `reports.geoMap`. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { geoLensRoute, MONEY_PART_PERMISSION, RISK_PART_PERMISSION } from './lens-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.79' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

const SETTING = { on: true, minOrders: 1, warnReturnPct: 10, topProducts: 3, lenses: { courier: false, risk: true, money: false, demand: false }, ai: false };

describe('the permission of each part of the risk lens (PR 758)', () => {
  it('each part needs the permission of its own source report; returns and cancels need only the page\'s', () => {
    expect(RISK_PART_PERMISSION).toEqual({ returns: 'reports.read', refusals: 'delivery.read', cancels: 'reports.read', risk: 'risk.report', claims: 'delivery.claims', tickets: 'support.read' });
  });
});

describe('the permissions of each part of the money and stock lens (PR 759)', () => {
  it('money needs books.read, the ad part also marketing.campaigns.read, the stock part only the page\'s', () => {
    expect(MONEY_PART_PERMISSION).toEqual({ delivery: ['books.read'], ads: ['books.read', 'marketing.campaigns.read'], stock: ['reports.read'] });
  });
});

describe.skipIf(!HAS_TEST_DB)('the Geography map lens route on PostgreSQL (PR 758)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let live: AdminDeps;
  let A = 0;
  let owner = '';
  let setting: unknown = SETTING;
  const get = (cookie?: string, query = '', method = 'GET') => geoLensRoute(call(method, `/api/admin/reports/geo-map/lens?storeId=${A}&from=2026-10-01&to=2026-10-31${query}`, cookie), live);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('geo-lens-api');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const real = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, resolver: real, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    // the same resolver, except that `reports.geoMap` answers what the test says
    live = { ...deps, resolver: new Proxy(real, { get: (target, prop, recv) => (prop === 'value' ? async (key: string, at: unknown) => (key === 'reports.geoMap' ? setting : (target as never as { value: (k: string, a: unknown) => unknown }).value(key, at)) : Reflect.get(target, prop, recv)) }) as typeof real };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('signed out is 401 and a write is 405', async () => {
    expect((await get(undefined, '&lens=risk')).status).toBe(401);
    expect((await get(owner, '&lens=risk', 'POST')).status).toBe(405);
  });

  it('is off as shipped: the page switch off, or the lens off, answers not_on', async () => {
    setting = { ...SETTING, on: false };
    const a = await get(owner, '&lens=risk');
    expect(a.status).toBe(404);
    expect(await a.json()).toMatchObject({ ok: false, error: 'not_on' });
    setting = { ...SETTING, lenses: { ...SETTING.lenses, risk: false } };
    expect((await get(owner, '&lens=risk')).status).toBe(404);
    setting = SETTING;
  });

  it('a bad lens, a lens this route does not serve and a bad parent are 400', async () => {
    expect((await get(owner, '&lens=nonsense')).status).toBe(400);
    expect((await get(owner, '&lens=courier')).status).toBe(400);
    expect((await get(owner, '&lens=risk&parent=1%27%20OR%201=1')).status).toBe(400);
  });

  it('the money lens is its own switch, and the owner gets its figures with nothing hidden', async () => {
    setting = SETTING; // money is off in SETTING
    expect((await get(owner, '&lens=money')).status).toBe(404);
    setting = { ...SETTING, lenses: { ...SETTING.lenses, money: true } };
    const res = await get(owner, '&lens=money&level=district');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, lens: 'money', hidden: [] });
    setting = SETTING;
  });

  it('the demand lens is its own switch, and its answer holds counts only', async () => {
    setting = SETTING; // demand is off in SETTING
    expect((await get(owner, '&lens=demand')).status).toBe(404);
    setting = { ...SETTING, lenses: { ...SETTING.lenses, demand: true } };
    const res = await get(owner, '&lens=demand&level=upazila');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, lens: 'demand', hidden: [] });
    expect(JSON.stringify(body)).not.toMatch(/phone|customerName|email|customerId/i);
    setting = SETTING;
  });

  it('the owner gets the figures, nothing is hidden for the owner, and the answer is never cached', async () => {
    const res = await get(owner, '&lens=risk&level=district');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, lens: 'risk', level: 'district', days: { from: '2026-10-01', to: '2026-10-31' }, hidden: [] });
    expect(JSON.stringify(body)).not.toMatch(/phone|customerName|email/i);
  });
});
