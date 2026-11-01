// S16 · PR 351 — the money report setting on Money → Profit & loss on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): off as shipped with no next day; the card's words are the worker's words for its period; the
// setting is saved with its version (a stale one refused), audited once per change, a bad time refused; a reader of the
// books may see it but not change it. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { moneyReportRoute, moneyReportView } from './money-report-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; storeId?: number } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.77' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/money/profit/report?storeId=${opts.storeId ?? 1}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Money report setting on PostgreSQL (PR 351)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let reader = '';
  const put = async (opts: { body?: unknown; cookie?: string }) => {
    const res = await moneyReportRoute(call('PUT', { ...opts, storeId: A }), deps);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('money-report');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.77' }, body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PW }) }), deps));
    const post = (path: string, body: unknown, cookie: string) => new Request(`https://${HOST}${path}`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, cookie, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.77' }, body: JSON.stringify(body) });
    const role = (await (await rolesHandler(post('/api/admin/roles', { nameEn: 'Books reader', nameBn: 'হিসাব পাঠক', permissions: ['books.read'] }, owner), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(post('/api/admin/staff', { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' }, owner), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(post(`/api/admin/staff/${staff.staff.id}/roles`, { action: 'assign', roleId: role.role.id }, owner), deps, staff.staff.id);
    const first = cookiesOf(await loginHandler(post('/api/admin/auth/login', { email: 'reader@example.com', password: 'first password from the owner' }, ''), deps));
    reader = cookiesOf(await passwordHandler(post('/api/admin/auth/password', { current: 'first password from the owner', next: 'my own words for this job' }, first), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('off as shipped: no next day; the words are the report for its period', async () => {
    const v = await moneyReportView(deps, A, new Date('2026-11-07T10:00:00+06:00'));
    expect(v.value).toMatchObject({ enabled: false, frequency: 'daily', at: '22:00', lang: 'bn' });
    expect(v.nextDay).toBeNull();
    expect(v.preview.split('\n')[0]).toBe('টাকার রিপোর্ট · 2026-11-07');
  });

  it('saved with its version and audited; a stale version and a bad time refused; a reader may not', async () => {
    const v = await moneyReportView(deps, A);
    const value = { ...v.value, enabled: true, frequency: 'weekly', at: '21:30', lang: 'en' };
    expect((await put({ cookie: reader, body: { value, version: v.version } })).status).toBe(403);
    expect((await put({ body: { value, version: v.version } })).status).toBe(401);
    const ok = await put({ cookie: owner, body: { value, version: v.version } });
    expect(ok.status).toBe(200);
    expect(ok.body.value).toEqual(value);
    expect((await put({ cookie: owner, body: { value: { ...value, at: '22:00' }, version: v.version } })).status).toBe(409);
    expect((await put({ cookie: owner, body: { value: { ...value, at: '25:00' }, version: ok.body.version } })).status).toBe(400);
    expect((await put({ cookie: owner, body: { value, version: ok.body.version } })).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'money.report' } })).toBe(1);
    const after = await moneyReportView(deps, A, new Date('2026-11-05T10:00:00+06:00'));
    expect(after.nextDay).toBe('2026-11-07');
    expect(after.preview.split('\n')[0]).toBe('Money report · 2026-10-30 – 2026-11-05');
    expect((await moneyReportRoute(call('GET', { cookie: owner, storeId: A }), deps)).status).toBe(405);
  });
});
