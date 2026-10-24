// S06 · PR 544 — the risk rules admin API end to end on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL):
// login, the same-site check and the permissions (a reader of orders may not see or switch the rules); the list of every
// rule as the settings ship it; a switch saved through the real settings resolver (its change log), the version refusing
// a stale screen, an unknown rule refused with nothing written. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { riskRoute } from './risk-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the risk tests';
const READER_PW = 'another long sentence for the risk tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('risk rules admin API on PostgreSQL (PR 544)', () => {
  let f: OrdersFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; origin?: string } = {}) => {
    const res = await riskRoute(call(method, `/api/admin/risk/${path.join('/')}`, { body: opts.body, cookie: opts.cookie ?? owner, origin: opts.origin }), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('risk_api');
    const db = f.t.prisma;
    await syncSettings(db, { registry, messages });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'risk-owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db, resolver: new SettingsResolver(prismaBackend(db), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'risk-owner@example.com', password: OWNER_PW } }), deps));
    await db.staffUser.update({ where: { email: 'reader@example.com' }, data: { passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: READER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('the list: every rule as the settings ship it; a login and the permission; unknown paths and methods refused', async () => {
    const got = await api('GET', ['rules']);
    expect(got.status).toBe(200);
    expect(got.body.rules.find((r: { key: string }) => r.key === 'risk.duplicateRules')).toMatchObject({ enabled: false, active: false, byDefault: false, label: { en: expect.any(String), bn: expect.any(String) } });
    expect(got.body.rules.find((r: { key: string }) => r.key === 'orders.duplicates')).toMatchObject({ enabled: true, active: true });
    expect((await api('GET', ['rules'], { cookie: '' })).status).toBe(401);
    expect((await api('GET', ['rules'], { cookie: reader })).status).toBe(403);
    expect((await api('PUT', ['rules'], { cookie: reader, body: { switches: { 'risk.score': true } } })).status).toBe(403);
    expect((await api('PUT', ['rules'], { origin: 'https://evil.example.test', body: { switches: { 'risk.score': true } } })).status).toBe(403);
    expect((await api('GET', ['blocklist'])).status).toBe(404);
    expect((await api('GET', ['rules', 'x'])).status).toBe(404);
    expect((await api('POST', ['rules'], { body: {} })).status).toBe(405);
  });

  it('a switch is saved through the settings (their change log); a stale screen and an unknown rule are refused', async () => {
    const list = await api('GET', ['rules']);
    const put = await api('PUT', ['rules'], { body: { version: list.body.version, switches: { 'risk.duplicateRules': true, 'risk.duplicateRules.D': true } } });
    expect(put.status).toBe(200);
    expect(put.body.rules.find((r: { key: string }) => r.key === 'risk.duplicateRules.D')).toMatchObject({ enabled: true, active: true, byDefault: false });
    const saved = await deps.resolver.value('risk.duplicateRules', { storeId: f.S });
    expect(saved).toMatchObject({ enabled: true, rules: { D: { enabled: true, windowMinutes: registry['risk.duplicateRules'].default.rules.D.windowMinutes } } });
    expect(await f.t.prisma.settingChange.count({ where: { key: 'risk.duplicateRules' } })).toBeGreaterThanOrEqual(1);
    const stale = await api('PUT', ['rules'], { body: { version: list.body.version, switches: { 'risk.score': true } } });
    expect(stale).toMatchObject({ status: 409, body: { ok: false, error: 'STALE' } });
    const bad = await api('PUT', ['rules'], { body: { switches: { 'risk.score': true, 'nope.rule': false } } });
    expect(bad).toMatchObject({ status: 404, body: { error: 'NOT_FOUND', details: ['nope.rule'] } });
    expect((await deps.resolver.value('risk.score', { storeId: f.S })).enabled).toBe(false);
  });
});
