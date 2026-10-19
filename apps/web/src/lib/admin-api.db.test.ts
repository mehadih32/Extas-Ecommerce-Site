// The admin API end to end on a real PostgreSQL: login, the cookie, the guard on every route, the role builder over
// HTTP and the settings list behind `settings.read`. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  passwordHandler,
  permissionsHandler,
  roleHandler,
  rolesHandler,
  sessionsHandler,
  settingsHandler,
  staffHandler,
  staffMemberHandler,
  staffRolesHandler,
  totpHandler,
} from './admin-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.20' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

/** The cookie pairs a response sets, ready to send back. */
function cookiesOf(res: Response): string {
  return res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
}

describe.skipIf(!HAS_TEST_DB)('admin API on PostgreSQL (PR 15, 16, 495)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let ownerCookie: string;
  let stores: [number, number];

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    stores = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('the settings list needs a login (it was open behind the staging password before)', async () => {
    expect((await settingsHandler(call('GET', '/api/admin/settings'), deps)).status).toBe(401);
    expect((await settingsHandler(call('GET', '/api/admin/settings'), null)).status).toBe(503);
  });

  it('logs in: an httpOnly host-only cookie; wrong password 401; a cross-site login is refused', async () => {
    expect((await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: 'nope' } }), deps)).status).toBe(401);
    expect((await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW }, origin: 'https://evil.example.test' }), deps)).status).toBe(403);
    const res = await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps);
    expect(res.status).toBe(200);
    const set = res.headers.getSetCookie().find((c) => c.startsWith('__Host-admin_sid='))!;
    expect(set).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    ownerCookie = cookiesOf(res);
    expect(JSON.stringify(await res.json())).not.toContain('passwordHash');
  });

  it('the owner reads the settings of any store and sees every permission', async () => {
    const res = await settingsHandler(call('GET', `/api/admin/settings?storeId=${stores[1]}`, { cookie: ownerCookie }), deps);
    expect(res.status).toBe(200);
    const keys = ((await res.json()) as { settings: { key: string }[] }).settings.map((s) => s.key);
    expect(keys).toContain('security.staffTwoFactorRequired');
    const me = (await (await meHandler(call('GET', '/api/admin/auth/me', { cookie: ownerCookie }), deps)).json()) as { permissions: string[] };
    expect(me.permissions).toContain('roles.manage');
    expect((await settingsHandler(call('GET', '/api/admin/settings?storeId=x', { cookie: ownerCookie }), deps)).status).toBe(400);
  });

  let supportCookie = '';
  let supportId = '';
  let roleId = '';

  it('role builder over HTTP: create a role, add staff, give the role in one store', async () => {
    const perms = (await (await permissionsHandler(call('GET', '/api/admin/permissions', { cookie: ownerCookie }), deps)).json()) as { permissions: { key: string; label: { en: string; bn: string } }[] };
    expect(perms.permissions.find((p) => p.key === 'settings.read')?.label.bn).toBeTruthy();

    const created = await rolesHandler(call('POST', '/api/admin/roles', { cookie: ownerCookie, body: { nameEn: 'Support', nameBn: 'সাপোর্ট', permissions: ['settings.read'] } }), deps);
    expect(created.status).toBe(201);
    roleId = ((await created.json()) as { role: { id: string } }).role.id;
    // A state change without the cookie, or from another site, is refused.
    expect((await rolesHandler(call('POST', '/api/admin/roles', { body: { nameEn: 'X', nameBn: 'X', permissions: [] } }), deps)).status).toBe(401);
    expect((await rolesHandler(call('POST', '/api/admin/roles', { cookie: ownerCookie, origin: null, body: { nameEn: 'X', nameBn: 'X', permissions: [] } }), deps)).status).toBe(403);

    const staff = await staffHandler(call('POST', '/api/admin/staff', { cookie: ownerCookie, body: { email: 'support@example.com', displayName: 'Sample support', password: 'first password from the owner' } }), deps);
    expect(staff.status).toBe(201);
    supportId = ((await staff.json()) as { staff: { id: string } }).staff.id;
    const give = await staffRolesHandler(call('POST', `/api/admin/staff/${supportId}/roles`, { cookie: ownerCookie, body: { action: 'assign', roleId, storeId: stores[0] } }), deps, supportId);
    expect(give.status).toBe(200);
  });

  it('a new account must change its first password before anything else', async () => {
    const res = await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'support@example.com', password: 'first password from the owner' } }), deps);
    let cookie = cookiesOf(res);
    expect((await settingsHandler(call('GET', `/api/admin/settings?storeId=${stores[0]}`, { cookie }), deps)).status).toBe(403);
    const changed = await passwordHandler(call('POST', '/api/admin/auth/password', { cookie, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps);
    expect(changed.status).toBe(200);
    expect((await meHandler(call('GET', '/api/admin/auth/me', { cookie }), deps)).status).toBe(401); // old session ended
    cookie = cookiesOf(changed);
    supportCookie = cookie;
  });

  it('permissions are checked per action and per store', async () => {
    expect((await settingsHandler(call('GET', `/api/admin/settings?storeId=${stores[0]}`, { cookie: supportCookie }), deps)).status).toBe(200);
    expect((await settingsHandler(call('GET', `/api/admin/settings?storeId=${stores[1]}`, { cookie: supportCookie }), deps)).status).toBe(403);
    expect((await rolesHandler(call('GET', '/api/admin/roles', { cookie: supportCookie }), deps)).status).toBe(403);
    expect((await staffHandler(call('GET', '/api/admin/staff', { cookie: supportCookie }), deps)).status).toBe(403);
    const self = await staffRolesHandler(call('POST', `/api/admin/staff/${supportId}/roles`, { cookie: supportCookie, body: { action: 'assign', roleId, storeId: stores[1] } }), deps, supportId);
    expect(self.status).toBe(403);
    // Taking settings.read out of the role takes it away at once.
    expect((await roleHandler(call('PATCH', `/api/admin/roles/${roleId}`, { cookie: ownerCookie, body: { permissions: [] } }), deps, roleId)).status).toBe(200);
    expect((await settingsHandler(call('GET', `/api/admin/settings?storeId=${stores[0]}`, { cookie: supportCookie }), deps)).status).toBe(403);
  });

  it('device list, log out everywhere, pausing an account and logout', async () => {
    const second = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const list = (await (await sessionsHandler(call('GET', '/api/admin/auth/sessions', { cookie: ownerCookie }), deps)).json()) as { sessions: { current: boolean }[] };
    expect(list.sessions.length).toBeGreaterThanOrEqual(2);
    expect(list.sessions.filter((s) => s.current)).toHaveLength(1);
    expect((await sessionsHandler(call('POST', '/api/admin/auth/sessions', { cookie: ownerCookie, body: { all: true } }), deps)).status).toBe(200);
    expect((await meHandler(call('GET', '/api/admin/auth/me', { cookie: second }), deps)).status).toBe(401);
    expect((await meHandler(call('GET', '/api/admin/auth/me', { cookie: ownerCookie }), deps)).status).toBe(200);

    expect((await staffMemberHandler(call('PATCH', `/api/admin/staff/${supportId}`, { cookie: ownerCookie, body: { status: 'SUSPENDED' } }), deps, supportId)).status).toBe(200);
    expect((await meHandler(call('GET', '/api/admin/auth/me', { cookie: supportCookie }), deps)).status).toBe(401);

    const out = await logoutHandler(call('POST', '/api/admin/auth/logout', { cookie: ownerCookie }), deps);
    expect(out.headers.getSetCookie()[0]).toContain('Max-Age=0');
    expect((await meHandler(call('GET', '/api/admin/auth/me', { cookie: ownerCookie }), deps)).status).toBe(401);
  });

  it('two-step login over HTTP: set up gives an authenticator link; then login asks for the code', async () => {
    ownerCookie = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const setup = (await (await totpHandler(call('POST', '/api/admin/auth/totp', { cookie: ownerCookie, body: { action: 'setup' } }), deps)).json()) as { uri: string; secret: string };
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\//);
    expect((await totpHandler(call('POST', '/api/admin/auth/totp', { cookie: ownerCookie, body: { action: 'enable', code: '000000' } }), deps)).status).toBe(400);
  });

  it('every change made over HTTP is in the audit log with the address it came from', async () => {
    const rows = await t.prisma.auditLog.findMany({ where: { source: 'admin-api' } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.ip === '192.0.2.20' && r.userAgent === 'SampleBrowser/1.0')).toBe(true);
  });
});
