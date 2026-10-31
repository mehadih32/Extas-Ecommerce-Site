// S21 · PR 421 (B6.6) — the site auditor's sandbox on PostgreSQL: the smoke test's and the journeys' check account
// signs in and reads every admin page's data, and every admin write from its session is refused with 403
// READ_ONLY_ACCOUNT before any permission check — also on the person's own routes (two-step login, devices) and even
// after a write permission was added to its role by hand. The owner's writes are untouched.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { base32Decode, CHECK_ROLE_KEY, counterAt, createFirstOwner, defaultSecurityPolicy, ensureCheckAccount, loginStaff, syncAuth, totpAt, verifyStaffTwoFactor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, sessionsHandler, totpHandler } from './admin-api';
import { SESSION_COOKIE, type AdminDeps } from './admin-auth';
import { fixesHandler } from './admin-health/fixes-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.31', cookie };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)("the site auditor's sandbox on PostgreSQL (PR 421, B6.6)", () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let check = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const vault = createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k'));
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', '', { email: 'owner@example.com', password: OWNER_PW }), deps));
    const acct = await ensureCheckAccount(t.prisma, vault, { email: 'check@example.test', displayName: 'Site check' });
    const sd = { db: t.prisma, policy: defaultSecurityPolicy(), vault };
    const first = await loginStaff(sd, { email: 'check@example.test', password: acct.password });
    if (first.kind !== 'two-factor') throw new Error('the check account always has two-step login');
    const done = await verifyStaffTwoFactor(sd, { challenge: first.challenge, code: totpAt(base32Decode(acct.totpSecret), counterAt(new Date())) });
    if (done.kind !== 'session') throw new Error('no session');
    check = `${SESSION_COOKIE}=${done.token}`;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('reads like any read-only role', async () => {
    expect((await fixesHandler(call('GET', '/api/admin/health/fixes', check), deps)).status).toBe(200);
    expect((await sessionsHandler(call('GET', '/api/admin/auth/sessions', check), deps)).status).toBe(200);
  });

  it('every write is refused before any permission check, also on its own routes', async () => {
    const refused = async (res: Response) => ({ status: res.status, error: ((await res.json()) as { error?: string }).error });
    expect(await refused(await fixesHandler(call('POST', '/api/admin/health/fixes', check, { action: 'approve', id: '00000000-0000-0000-0000-000000000000' }), deps))).toEqual({ status: 403, error: 'READ_ONLY_ACCOUNT' });
    expect(await refused(await fixesHandler(call('PUT', '/api/admin/health/fixes', check, { key: 'fixGate' }), deps))).toEqual({ status: 403, error: 'READ_ONLY_ACCOUNT' });
    expect(await refused(await totpHandler(call('POST', '/api/admin/auth/totp', check, { action: 'disable' }), deps))).toEqual({ status: 403, error: 'READ_ONLY_ACCOUNT' });
    expect(await refused(await sessionsHandler(call('POST', '/api/admin/auth/sessions', check, { all: true }), deps))).toEqual({ status: 403, error: 'READ_ONLY_ACCOUNT' });
  });

  it('a write permission added to its role by hand changes nothing', async () => {
    const role = await t.prisma.role.findUniqueOrThrow({ where: { key: CHECK_ROLE_KEY } });
    const p = await t.prisma.permission.findUniqueOrThrow({ where: { key: 'settings.write' } });
    await t.prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    const res = await fixesHandler(call('PUT', '/api/admin/health/fixes', check, { key: 'fixGate', value: { proposals: true, expireDays: 0 }, version: 'x' }), deps);
    expect(res.status).toBe(403);
    expect((await deps.resolver.value('health.fixGate')).proposals).toBe(false);
  });

  it("the owner's writes go on as before", async () => {
    const res = await fixesHandler(call('POST', '/api/admin/health/fixes', owner, { action: 'approve', id: '00000000-0000-0000-0000-000000000000' }), deps);
    expect(res.status).toBe(404);
  });
});
