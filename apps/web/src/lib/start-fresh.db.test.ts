// S28 · PR 706 — Start fresh on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): off as shipped; only the
// owner (a desk person is refused at the door); the switch and the run need the owner's PIN; the run needs the exact
// words and a recent SUCCEEDED backup; the site clears carts, reviews and returns itself, hands the append-only kinds
// to the server and keeps them; real products are kept or archived on the owner's choice; it runs only once; a try
// that fails rolls back and may be tried again. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, setOwnerPin, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { startFreshRoute } from './start-fresh';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PIN = '4821';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.76' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Start fresh on PostgreSQL (PR 706)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let desk = '';
  const route = async (method: string, path: string[], opts: { body?: unknown; cookie?: string } = {}) => {
    const res = await startFreshRoute(call(method, `/api/admin/start-fresh${path.length ? `/${path.join('/')}` : ''}?storeId=${A}`, opts), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const goodBackup = () => t.prisma.backupRequest.create({ data: { kind: 'BACKUP', status: 'SUCCEEDED', finishedAt: new Date() } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('startfresh');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const ownerRow = await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    await setOwnerPin(t.prisma, { staffUserId: ownerRow.id }, { password: OWNER_PW, pin: PIN }, { minLength: 4, maxLength: 12, maxAttempts: 5, lockMinutes: 15 }, new Date());
    const role = ((await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Desk', nameBn: 'রোল', permissions: ['orders.read'] } }), deps)).json()) as { role: { id: string } }).role;
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'desk@example.com', displayName: 'desk', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.id } }), deps, staff.staff.id);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'desk@example.com', password: 'first password from the owner' } }), deps));
    desk = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
    await t.prisma.review.createMany({ data: [{ storeId: A, rating: 5 }, { storeId: A, rating: 1 }] });
    await t.prisma.cart.create({ data: { storeId: A, visitorId: 'v-1' } });
    await t.prisma.customer.create({ data: { storeId: A } });
    await t.prisma.customerProblem.create({ data: { storeId: A, fingerprint: 'f-1', kind: 'script_error', step: 'other', path: '/', detail: 'x', firstSeenAt: new Date(), lastSeenAt: new Date() } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('is off as shipped and a desk person is refused at the door', async () => {
    const v = await route('GET', [], { cookie: owner });
    expect(v.status).toBe(200);
    expect(v.body.enabled).toBe(false);
    expect(v.body.isOwner).toBe(true);
    expect(v.body.done).toBeNull();
    expect(v.body.preview.kinds.find((k: any) => k.id === 'reviews').count).toBe(2);
    expect((await route('GET', [], { cookie: desk })).status).toBe(403);
    expect((await route('POST', [], { cookie: desk, body: { words: 'START FRESH', pin: PIN } })).status).toBe(403);
  });

  it('refuses a run while it is switched off, then the switch needs the PIN', async () => {
    expect((await route('POST', [], { cookie: owner, body: { words: 'START FRESH', pin: PIN } })).body.error).toBe('SWITCHED_OFF');
    expect((await route('POST', ['switch'], { cookie: owner, body: { enabled: true, pin: '0000' } })).body.error).toBe('WRONG_PIN');
    const on = await route('POST', ['switch'], { cookie: owner, body: { enabled: true, pin: PIN } });
    expect(on.status).toBe(200);
    expect(on.body.enabled).toBe(true);
  });

  it('needs the exact words, a recent backup and the PIN; each refusal changes nothing', async () => {
    expect((await route('POST', [], { cookie: owner, body: { words: 'start fresh', pin: PIN } })).body.error).toBe('WORDS_MISMATCH');
    expect((await route('POST', [], { cookie: owner, body: { words: 'START FRESH', pin: PIN } })).body.error).toBe('BACKUP_FIRST');
    await t.prisma.backupRequest.create({ data: { kind: 'BACKUP', status: 'SUCCEEDED', finishedAt: new Date(Date.now() - 3 * 3600_000) } });
    expect((await route('POST', [], { cookie: owner, body: { words: 'START FRESH', pin: PIN } })).body.error).toBe('BACKUP_FIRST');
    await goodBackup();
    expect((await route('POST', [], { cookie: owner, body: { words: 'START FRESH', pin: '0000' } })).body.error).toBe('WRONG_PIN');
    expect(await t.prisma.review.count({ where: { storeId: A } })).toBe(2);
    expect(await t.prisma.startFreshRun.count()).toBe(0);
  });

  it('runs once: clears carts and reviews, hands the customers to the server, keeps products, audits, and then refuses', async () => {
    await t.prisma.product.updateMany({ where: { storeId: A }, data: {} });
    const keptBefore = await t.prisma.product.count({ where: { storeId: A, status: { not: 'ARCHIVED' } } });
    const r = await route('POST', [], { cookie: owner, body: { words: 'START FRESH', pin: PIN } });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('PARTIAL');
    expect(await t.prisma.review.count({ where: { storeId: A } })).toBe(0);
    expect(await t.prisma.cart.count({ where: { storeId: A } })).toBe(0);
    expect(await t.prisma.customer.count({ where: { storeId: A } })).toBe(1);
    expect(await t.prisma.product.count({ where: { storeId: A, status: { not: 'ARCHIVED' } } })).toBe(keptBefore);
    const run = await t.prisma.startFreshRun.findFirstOrThrow({ where: { storeId: A } });
    expect(run).toMatchObject({ status: 'PARTIAL', erpStatus: 'MOCK_NOT_SENT', removeProducts: false });
    expect((run.kinds as any[]).find((k) => k.id === 'customers')).toMatchObject({ count: 1, how: 'HANDED_OFF' });
    // customer problems are never cleared (owner decision 16): counted as kept, left out of the total, still there
    expect((run.kinds as any[]).find((k) => k.id === 'problems')).toMatchObject({ count: 1, how: 'KEPT' });
    expect(await t.prisma.customerProblem.count({ where: { storeId: A } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'startFresh.run' } })).toBe(1);
    await goodBackup();
    expect((await route('POST', [], { cookie: owner, body: { words: 'START FRESH', pin: PIN } })).body.error).toBe('ALREADY_DONE');
    expect((await route('POST', ['switch'], { cookie: owner, body: { enabled: false, pin: PIN } })).body.error).toBe('ALREADY_DONE');
    const v = await route('GET', [], { cookie: owner });
    expect(v.body.done.status).toBe('PARTIAL');
    // the server's purge finishes it: the view then shows the handed-off kinds as cleared
    await t.prisma.$queryRaw`SELECT extas_start_fresh_purge(${run.id}::uuid)`;
    expect(await t.prisma.customer.count({ where: { storeId: A } })).toBe(0);
    const after = await route('GET', [], { cookie: owner });
    expect(after.body.done.status).toBe('DONE');
    expect(after.body.done.kinds.find((k: any) => k.id === 'customers').how).toBe('CLEARED');
    expect(after.body.done.kinds.find((k: any) => k.id === 'problems').how).toBe('KEPT');
  });

  it('a failed try rolls back, is recorded FAILED and leaves the place free', async () => {
    const store = await t.prisma.store.findFirstOrThrow({ where: { id: { not: A } } });
    const B = store.id;
    await t.prisma.review.create({ data: { storeId: B, rating: 3 } });
    const boom = new Proxy(t.prisma, { get: (o, k) => (k === '$transaction' ? async () => { throw new Error('permission denied for table Review'); } : (o as any)[k]) });
    const { runStartFresh } = await import('./start-fresh');
    await deps.resolver.set('startFresh.settings', { enabled: true, backupMaxAgeMinutes: 60 }, (await import('@extas/settings')).storeTarget(B), { actorId: null, reason: 'test' });
    const ownerRow = await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    const r = await runStartFresh({ ...deps, db: boom as any }, { staffUserId: ownerRow.id } as any, {} as any, B, { words: 'START FRESH', pin: PIN });
    expect(r).toEqual({ ok: false, error: 'RUN_FAILED' });
    expect(await t.prisma.review.count({ where: { storeId: B } })).toBe(1);
    expect(await t.prisma.startFreshRun.findFirstOrThrow({ where: { storeId: B } })).toMatchObject({ status: 'FAILED' });
    const again = await runStartFresh(deps, { staffUserId: ownerRow.id } as any, {} as any, B, { words: 'START FRESH', pin: PIN });
    expect(again.ok).toBe(true);
    expect(await t.prisma.review.count({ where: { storeId: B } })).toBe(0);
  });
});
