// S11 · PR 220 — GET/PUT /api/admin/seo on a real PostgreSQL: the SEO settings with their versions and the shop's
// address, read with seo.read and saved with seo.manage through the settings resolver (a stale version is 409, a wrong
// value 400, an unchanged one writes nothing), with an audit row. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SEO_INDEXING_DEFAULT, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { seoSettingsRoute } from './admin-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const BASE = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.31', origin: `https://${HOST}`, 'content-type': 'application/json' };

function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { ...BASE };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new Request(`https://${HOST}${path}`, { method, headers, ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

/** Signs in a new staff member holding only `permissions`, and returns their cookies. */
async function staffWith(deps: AdminDeps, owner: string, email: string, permissions: string[]): Promise<string> {
  const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: `Role ${email}`, nameBn: 'ভূমিকা', permissions } }), deps);
  const roleId = ((await role.json()) as { role: { id: string } }).role.id;
  const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: 'Sample staff', password: 'first password from the owner' } }), deps);
  const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
  await staffRolesHandler(call('POST', `/api/admin/staff/${staffId}/roles`, { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
  const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email, password: 'first password from the owner' } }), deps));
  return cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
}

describe.skipIf(!HAS_TEST_DB)('Website › SEO settings on PostgreSQL (PR 220)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    reader = await staffWith(deps, owner, 'reader@example.com', ['seo.read']);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a session; seo.read reads, seo.manage saves', async () => {
    expect((await seoSettingsRoute(call('GET', '/api/admin/seo'), deps)).status).toBe(401);
    expect((await seoSettingsRoute(call('GET', '/api/admin/seo', { cookie: reader }), null)).status).toBe(503);
    const res = await seoSettingsRoute(call('GET', '/api/admin/seo', { cookie: reader }), deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { values: Record<string, unknown>; site: { primary: string | null; bengaliOn: boolean } };
    expect(body.values['seo.indexing']).toEqual(SEO_INDEXING_DEFAULT);
    expect(body.site.primary).toBeNull();
    const put = await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: reader, body: { key: 'seo.indexing', value: SEO_INDEXING_DEFAULT } }), deps);
    expect(put.status).toBe(403);
    expect((await seoSettingsRoute(call('DELETE', '/api/admin/seo', { cookie: owner }), deps)).status).toBe(405);
  });

  it('saves through the resolver with an audit row; stale and wrong values are refused', async () => {
    const got = (await (await seoSettingsRoute(call('GET', '/api/admin/seo', { cookie: owner }), deps)).json()) as { versions: Record<string, number> };
    const version = got.versions['seo.indexing'];
    const next = { ...SEO_INDEXING_DEFAULT, pages: { ...SEO_INDEXING_DEFAULT.pages, search: true }, xDefault: 'none' as const };
    expect((await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.indexing', value: next, version: (version ?? 0) + 7 } }), deps)).status).toBe(409);
    const bad = await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.indexing', value: { ...next, extra: 1 } } }), deps);
    expect(bad.status).toBe(400);
    expect((await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'store.name', value: 'x' } }), deps)).status).toBe(400);
    const ok = await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.indexing', value: next, version } }), deps);
    expect(ok.status).toBe(200);
    expect(await deps.resolver.value('seo.indexing', { storeId: MOTHER_STORE_ID })).toEqual(next);
    const rows = await t.prisma.auditLog.findMany({ where: { action: 'seo.settings' } });
    expect(rows).toHaveLength(1);
    // the same value again writes nothing
    expect((await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.indexing', value: next } }), deps)).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'seo.settings' } })).toBe(1);
  });
});
