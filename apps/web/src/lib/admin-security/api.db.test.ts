// S18 · PR 380 — Settings › Sign-in & security on a real PostgreSQL: the page's data needs security.read, saving
// needs security.write; a stale card is refused; the admin address list cannot be switched on without the address it
// is saved from, and once on it refuses sign-in and every admin call from elsewhere (until the break-glass switch);
// the event list never shows a full address. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { ALLOWLIST_BREAK_GLASS_ENV } from './access';
import { securityHandler } from './api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const HOME = '192.0.2.21';
const AWAY = '198.51.100.9';

function call(method: string, opts: { body?: unknown; cookie?: string; ip?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': opts.ip ?? HOME };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/security'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface Card {
  value: Record<string, unknown>;
  version: string;
}
interface Answer {
  ok: boolean;
  error?: string;
  cards: Record<string, Card>;
  view: { staff: { active: number; twoFactor: number }; address: { ip: string | null; onList: boolean }; events: { kind: string; details: Record<string, unknown> }[] };
}

describe.skipIf(!HAS_TEST_DB)('Settings › Sign-in & security on PostgreSQL (PR 380)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let staff = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    // A staff member who may only see security.
    const role = await rolesHandler(call('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Watch', nameBn: 'নজর', permissions: ['security.read'] } }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'watch@example.com', displayName: 'Sample watcher', password: 'first password from the owner' } }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'watch@example.com', password: 'first password from the owner' } }), deps));
    staff = cookiesOf(await passwordHandler(call('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    delete process.env[ALLOWLIST_BREAK_GLASS_ENV];
    await t?.drop();
  });

  const get = async (cookie: string, ip?: string) => {
    const res = await securityHandler(call('GET', { cookie, ip }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const put = async (cookie: string, b: unknown, ip?: string) => {
    const res = await securityHandler(call('PUT', { cookie, ip, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  it('reads with security.read: the cards, the staff counts, the address, and events without a full address', async () => {
    const { status, a } = await get(staff);
    expect(status).toBe(200);
    expect(a.cards.signIn!.value).toMatchObject({ twoFactor: false, idleMinutes: 30, maxHours: 12, maxAttempts: 5, lockoutMinutes: 15, loginAlerts: true, noteDays: 7 });
    expect(a.cards.allowlist!.value).toEqual({ enabled: false, entries: [] });
    expect(a.view.staff).toEqual({ active: 2, twoFactor: 0 });
    expect(a.view.address).toEqual({ ip: HOME, onList: false });
    expect(a.view.events.some((e) => e.kind === 'staff.login.newDevice')).toBe(true);
    expect(JSON.stringify(a.view.events)).not.toContain(HOME);
    const signIn = a.view.events.find((e) => e.kind.startsWith('staff.login'))!.details;
    expect(signIn).toMatchObject({ who: expect.any(String), device: 'SampleBrowser/1.0', address: expect.stringMatching(/^[0-9a-f]{8}$/) });
    expect(signIn).not.toHaveProperty('staffUserId');
    expect(signIn).not.toHaveProperty('userAgent');
  });

  it('saving needs security.write; a stale card is refused with the fresh version', async () => {
    const { a } = await get(owner);
    expect((await put(staff, { key: 'signIn', value: { idleMinutes: 45 }, version: a.cards.signIn!.version })).status).toBe(403);
    const ok = await put(owner, { key: 'signIn', value: { idleMinutes: 45 }, version: a.cards.signIn!.version });
    expect(ok.status).toBe(200);
    expect(ok.a.cards.signIn!.value.idleMinutes).toBe(45);
    expect(await deps.resolver.value('security.staffSessionIdleMinutes')).toBe(45);
    expect((await put(owner, { key: 'signIn', value: { idleMinutes: 50 }, version: a.cards.signIn!.version })).status).toBe(409);
    expect((await put(owner, { key: 'signIn', value: { idleMinutes: 1 } })).status).toBe(400);
    expect((await put(owner, { key: 'signIn', value: { nope: 1 } })).status).toBe(400);
    expect(await t.prisma.auditLog.count({ where: { action: 'security.settings.save' } })).toBe(1);
  });

  it('the address list: not without your own address; once on, sign-in and admin calls from elsewhere are refused', async () => {
    const away = await put(owner, { key: 'allowlist', value: { enabled: true, entries: [AWAY] } });
    expect(away.status).toBe(400);
    expect(away.a.error).toBe('ADDRESS_NOT_ON_LIST');
    expect((await put(owner, { key: 'allowlist', value: { enabled: true, entries: [] } })).status).toBe(400);

    const on = await put(owner, { key: 'allowlist', value: { enabled: true, entries: ['192.0.2.0/24'] } });
    expect(on.status).toBe(200);
    expect(on.a.view.address.onList).toBe(true);
    expect((await get(owner)).status).toBe(200);
    const refused = await securityHandler(call('GET', { cookie: owner, ip: AWAY }), deps);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toBe('ADDRESS_NOT_ALLOWED');
    const login = await loginHandler(call('POST', { path: '/api/admin/auth/login', ip: AWAY, body: { email: 'owner@example.com', password: OWNER_PW } }), deps);
    expect(login.status).toBe(403);

    // The break-glass switch on the server opens it again.
    process.env[ALLOWLIST_BREAK_GLASS_ENV] = '1';
    expect((await get(owner, AWAY)).status).toBe(200);
    delete process.env[ALLOWLIST_BREAK_GLASS_ENV];

    const off = await put(owner, { key: 'allowlist', value: { enabled: false } });
    expect(off.status).toBe(200);
    expect((await get(owner, AWAY)).status).toBe(200);
  });
});
