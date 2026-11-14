// S28 · PR 711 — Couriers › Claims & payouts › More options on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the list
// sizes ship at their defaults; a reader of delivery sees them but may not change them; the owner saves against the version the page
// showed (a stale one is refused), a number out of range is refused, and a change is audited. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { claimsPageHandler } from './courier-claims-page-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const SAMPLE_UUID = '00000000-0000-4000-8000-000000000001';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; key?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.76' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.key) headers['idempotency-key'] = opts.key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Claims & payouts list sizes on PostgreSQL (PR 711)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const opts = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
    const res = await claimsPageHandler(call(method, '/api/admin/delivery/claims-overview/options', o), deps);
    return { status: res.status, body: (await res.json()) as { ok?: boolean; error?: string; cards?: { options: { value: { claimRows: number; payoutRows: number }; version: string } } } };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('claims_page');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Delivery reader', nameBn: 'ডেলিভারি দেখা', permissions: ['delivery.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships at the default sizes and a delivery reader sees them', async () => {
    const r = await opts('GET', { cookie: reader });
    expect(r.status).toBe(200);
    expect(r.body.cards?.options.value).toEqual({ claimRows: 25, payoutRows: 12 });
  });

  it('a reader may not change them; the owner may, against the version shown; stale and out-of-range are refused; audited', async () => {
    const shown = (await opts('GET', { cookie: owner })).body.cards!.options;
    expect((await opts('PUT', { cookie: reader, body: { key: 'options', value: { claimRows: 40, payoutRows: 12 }, version: shown.version } })).status).toBe(403);
    expect((await opts('PUT', { cookie: owner, body: { key: 'options', value: { claimRows: 3, payoutRows: 12 }, version: shown.version } })).status).toBe(400);
    const ok = await opts('PUT', { cookie: owner, body: { key: 'options', value: { claimRows: 40, payoutRows: 12 }, version: shown.version } });
    expect(ok.status).toBe(200);
    expect(ok.body.cards?.options.value).toEqual({ claimRows: 40, payoutRows: 12 });
    const stale = await opts('PUT', { cookie: owner, body: { key: 'options', value: { claimRows: 50, payoutRows: 12 }, version: shown.version } });
    expect(stale.status).toBe(409);
    expect(await t.prisma.auditLog.count({ where: { action: 'delivery.claimsPage.options' } })).toBe(1);
  });
});
