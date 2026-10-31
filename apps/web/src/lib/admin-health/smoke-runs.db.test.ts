// S21 · PR 418 — /api/admin/health/smoke and its pictures on PostgreSQL: the kept runs (state/smoke-runs/<slot>/), the
// newer one first, failed pages first; a picture is served only when the run's rows name it; an admin page's picture
// needs `health.smoke.shots` (the owner has it, a `health.read`-only role does not); nothing without a sign-in.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { smokeHandler, smokeShotHandler } from './smoke-api';
import type { SmokeView } from './smoke-runs';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.24' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/health/smoke'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

describe.skipIf(!HAS_TEST_DB)('Reports › Site health › Smoke runs on PostgreSQL (PR 418)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let watcher = '';
  const dir = mkdtempSync(join(tmpdir(), 'extas-state-'));

  const keep = (slot: string, result: object, rows: object[] | null, pictures: string[], age: number) => {
    const d = join(dir, 'smoke-runs', slot);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'result.json'), JSON.stringify(result));
    if (rows) writeFileSync(join(d, 'rows.json'), JSON.stringify({ rows }));
    for (const f of pictures) writeFileSync(join(d, f), JPEG);
    const at = new Date(Date.now() - age * 60_000);
    utimesSync(join(d, 'result.json'), at, at);
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = await rolesHandler(call('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Watch', nameBn: 'নজর', permissions: ['health.read'] } }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'watch@example.com', displayName: 'Sample watcher', password: 'first password from the owner' } }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'watch@example.com', password: 'first password from the owner' } }), deps));
    watcher = cookiesOf(await passwordHandler(call('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    await t?.drop();
  });

  const view = async (query = '', cookie = owner, stateDir: string | null = dir) => {
    const res = await smokeHandler(call('GET', { cookie, path: `/api/admin/health/smoke${query}` }), deps, { stateDir });
    return { status: res.status, v: ((await res.json()) as { view: SmokeView }).view };
  };
  const shot = (query: string, cookie = owner) => smokeShotHandler(call('GET', { cookie, path: `/api/admin/health/smoke/shot${query}` }), deps, { stateDir: dir });

  it('needs a sign-in; with nothing kept it says so', async () => {
    expect((await smokeHandler(call('GET'), deps, { stateDir: dir })).status).toBe(401);
    const { status, v } = await view('', owner, null);
    expect(status).toBe(200);
    expect(v).toMatchObject({ slot: 'deploy', run: null, pages: [], slots: { deploy: null, scheduled: null }, canSeeAdminShots: true });
  });

  it('shows the newer kept run, failed pages first, and the other run on request', async () => {
    const rows = [
      { path: '/', screen: 'phone', status: 200, landed: '/', ok: true, problems: [], screenshot: 'home-phone.jpg' },
      { path: '/', screen: 'desktop', status: 200, landed: '/', ok: true, problems: [], screenshot: 'home-desktop.jpg' },
      { path: '/admin/orders', screen: 'phone', status: 500, landed: '/admin/orders', ok: false, problems: ['/admin/orders: answered 500'], screenshot: 'admin-orders-phone.jpg' },
      { path: '/admin/orders', screen: 'desktop', status: 200, landed: '/admin/orders', ok: true, problems: [], screenshot: 'admin-orders-desktop.jpg' },
    ];
    keep('deploy', { at: '2026-10-31 19:10 (Asia/Dhaka)', kind: 'after deploy', sha: 'abc123', ok: false, pages: 4, failed: 1, rolledBack: true, problems: ['/admin/orders: answered 500 (phone)'], database: { appendOnly: 'ok: 30 tables', appRole: 'extas_app' } }, rows, ['home-phone.jpg', 'home-desktop.jpg', 'admin-orders-phone.jpg', 'admin-orders-desktop.jpg'], 5);
    keep('scheduled', { at: '2026-10-31 03:30 (Asia/Dhaka)', kind: 'nightly', sha: 'abc123', ok: true, pages: 240, failed: 0, problems: [] }, null, [], 60 * 16);
    const { v } = await view();
    expect(v.slot).toBe('deploy');
    expect(v.show).toBe('failed');
    expect(v.slots).toEqual({ deploy: { at: '2026-10-31 19:10 (Asia/Dhaka)', ok: false }, scheduled: { at: '2026-10-31 03:30 (Asia/Dhaka)', ok: true } });
    expect(v.run).toMatchObject({ ok: false, pages: 4, failed: 1, rolledBack: true, hasRows: true, database: { appRole: 'extas_app' } });
    expect(v.pageCount).toBe(2);
    expect(v.failedPages).toBe(1);
    expect(v.pages.map((p) => p.path)).toEqual(['/admin/orders']);
    expect((await view('?show=all')).v.pages.map((p) => p.path)).toEqual(['/admin/orders', '/']);
    const night = (await view('?run=scheduled')).v;
    expect(night).toMatchObject({ slot: 'scheduled', show: 'all', run: { ok: true, pages: 240, hasRows: false }, pages: [] });
    expect((await view('?run=nope')).v.slot).toBe('deploy');
  });

  it('serves a picture the rows name, nothing else', async () => {
    const res = await shot('?run=deploy&file=home-phone.jpg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG);
    writeFileSync(join(dir, 'smoke-runs', 'deploy', 'stray-phone.jpg'), JPEG);
    expect((await shot('?run=deploy&file=stray-phone.jpg')).status).toBe(404);
    expect((await shot('?run=deploy&file=..%2Fsmoke.json')).status).toBe(400);
    expect((await shot('?run=deploy&file=result.json')).status).toBe(400);
    expect((await shot('?run=other&file=home-phone.jpg')).status).toBe(400);
    expect((await shot('?run=scheduled&file=home-phone.jpg')).status).toBe(404);
    expect((await smokeShotHandler(call('GET', { path: '/api/admin/health/smoke/shot?run=deploy&file=home-phone.jpg' }), deps, { stateDir: dir })).status).toBe(401);
  });

  it('a health.read-only role sees every result but not the pictures of admin pages', async () => {
    const { status, v } = await view('?show=all', watcher);
    expect(status).toBe(200);
    expect(v.canSeeAdminShots).toBe(false);
    const orders = v.pages.find((p) => p.path === '/admin/orders')!;
    expect(orders.screens.map((s) => s.shot)).toEqual([null, null]);
    expect(v.pages.find((p) => p.path === '/')!.screens.map((s) => s.shot)).toEqual(['home-phone.jpg', 'home-desktop.jpg']);
    expect((await shot('?run=deploy&file=admin-orders-phone.jpg', watcher)).status).toBe(403);
    expect((await shot('?run=deploy&file=home-phone.jpg', watcher)).status).toBe(200);
    expect((await shot('?run=deploy&file=admin-orders-phone.jpg')).status).toBe(200);
    expect((await smokeHandler(call('POST', { cookie: owner, body: {} }), deps, { stateDir: dir })).status).toBe(405);
  });
});
