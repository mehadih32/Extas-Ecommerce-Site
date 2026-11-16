// S29 · PR 761 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL; written without being run — no database on the
// machine it was made on): the advisor route. Off as shipped at every gate (the map, the advisor, AI), signed out 401, a wrong
// method 405; a GET never calls the AI; with AI off a POST makes no draft; and a run only ever writes drafts to the approval
// queue (nothing else in the database moves). The settings are given through a wrapper over the resolver, so this test does not
// depend on where the screen's lane registers `reports.geoMap`. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { geoAdvisorRoute } from './advisor-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = {
    host: HOST,
    'user-agent': 'SampleBrowser/1.0',
    'x-forwarded-for': '192.0.2.81',
  };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

// the retired keys (an older stored value) are still there and never read
const SETTING = {
  on: false,
  minOrders: 1,
  warnReturnPct: 10,
  topProducts: 3,
  lenses: { courier: false, risk: false, money: false, demand: false },
  ai: false,
};

describe.skipIf(!HAS_TEST_DB)('the Geography map advisor route on PostgreSQL (PR 761)', () => {
  let t: TestDatabase;
  let live: AdminDeps;
  let A = 0;
  let owner = '';
  let geoMap: unknown = SETTING;
  let aiEnabled = false;
  const ask = (cookie?: string, method = 'GET', query = '') =>
    geoAdvisorRoute(call(method, `/api/admin/reports/geo-map/advisor?storeId=${A}&from=2026-10-01&to=2026-10-31${query}`, cookie), live);
  const drafts = () => t.prisma.aiApprovalRequest.count({ where: { kind: 'geo.advice' } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('geo-advisor-api');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), {
      email: 'owner@example.com',
      displayName: 'Sample owner',
      password: OWNER_PW,
      passwordChosenByOwner: true,
    });
    const real = new SettingsResolver(prismaBackend(t.prisma), registry);
    const deps: AdminDeps = {
      db: t.prisma,
      resolver: real,
      vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')),
    };
    live = {
      ...deps,
      resolver: new Proxy(real, {
        get: (target, prop, recv) =>
          prop === 'value'
            ? async (key: string, at: unknown) =>
                key === 'reports.geoMap'
                  ? geoMap
                  : key === 'ai.enabled'
                    ? aiEnabled
                    : (
                        target as never as {
                          value: (k: string, a: unknown) => unknown;
                        }
                      ).value(key, at)
            : Reflect.get(target, prop, recv),
      }) as typeof real,
    };
    owner = cookiesOf(
      await loginHandler(
        call('POST', '/api/admin/auth/login', undefined, {
          email: 'owner@example.com',
          password: OWNER_PW,
        }),
        deps,
      ),
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('signed out is 401 and a wrong method is 405', async () => {
    expect((await ask(undefined)).status).toBe(401);
    expect((await ask(owner, 'DELETE')).status).toBe(405);
  });

  it('has no geo switch of its own: the only gate is the global AI control (a GET still answers, with the AI state)', async () => {
    geoMap = SETTING;
    aiEnabled = false;
    const a = await ask(owner);
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ ok: true, status: 'aiOff' });
  });

  it('a GET reports where the advisor stands and lists the waiting drafts, with no AI call and no write', async () => {
    const res = await ask(owner);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      status: 'aiOff',
      drafts: [],
      run: null,
    });
    expect(await drafts()).toBe(0);
  });

  it('with AI off a POST is refused and makes no draft', async () => {
    aiEnabled = false;
    const res = await ask(owner, 'POST');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: 'not_on',
      status: 'aiOff',
    });
    expect(await drafts()).toBe(0);
  });

  it('with AI on but only the mock provider (no connection), a run finds what it finds and queues nothing without an AI note', async () => {
    aiEnabled = true;
    const before = {
      orders: await t.prisma.order.count(),
      approvals: await t.prisma.aiApprovalRequest.count(),
    };
    const res = await ask(owner, 'POST', '&lang=en');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      run: { status: string; drafted: number; left: { noNote: number } };
    };
    expect(body.run.status).toBe('ready');
    expect(body.run.drafted).toBe(0); // no live model connection here: every note is a "no", so nothing is queued
    expect(await t.prisma.order.count()).toBe(before.orders);
    expect(await t.prisma.aiApprovalRequest.count()).toBe(before.approvals);
  });
});
