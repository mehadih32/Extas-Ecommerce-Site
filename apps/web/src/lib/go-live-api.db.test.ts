// S19 · PR 393, 397, 399, 400 — Settings → System → Go-live on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL):
// the list from the database and the server's files, the owner's own data checked per store that goes live (the mother
// store; a draft store is not asked), a delivery band counted, a sign-off recorded with who and audited, and refused
// without its permission. Every value is made up.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { goLiveRoute } from './go-live-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.72' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

type Item = { key: string; ok: boolean; by?: string | null; vars?: Record<string, string | number> };

describe.skipIf(!HAS_TEST_DB)('go-live checklist API on PostgreSQL (PR 393, 397, 399)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let ownerId = '';
  let reader = '';
  const stateDir = mkdtempSync(join(tmpdir(), 'golive-state-'));
  const before = process.env.EXTAS_STATE_DIR;

  const get = async (cookie = owner) => {
    const res = await goLiveRoute(call('GET', '/api/admin/go-live', { cookie }), deps, []);
    return { status: res.status, body: (await res.json()) as { ok: boolean; items: Item[]; people: Record<string, string> } };
  };
  const item = (items: Item[], key: string) => items.find((i) => i.key === key)!;

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.EXTAS_STATE_DIR = stateDir;
    t = await createTestDatabase('golive');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const first = await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    ownerId = first.id;
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Reader', nameBn: 'পাঠক', permissions: ['system.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (before === undefined) delete process.env.EXTAS_STATE_DIR;
    else process.env.EXTAS_STATE_DIR = before;
    rmSync(stateDir, { recursive: true, force: true });
    await t?.drop();
  });

  it('a new installation: nothing is ready; the owner data of the mother store is named, the draft store is not asked', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.items.every((i) => !i.ok)).toBe(true);
    expect(item(r.body.items, 'ownerData').vars).toEqual({
      stores: 1,
      missing: 'Sample store A: contact.phone, contact.address, legal.registeredName, legal.tradeLicence, delivery band',
    });
    expect(item(r.body.items, 'originCert').ok).toBe(false);
    expect(item(r.body.items, 'connections').vars).toEqual({ live: '—', missing: 'PAYMENT, COURIER, SMS' });
  });

  it('PR 400: a connection counts only switched on, LIVE and with a passing last test', async () => {
    const row = (kind: 'PAYMENT' | 'COURIER' | 'SMS', provider: string, mode: 'MOCK' | 'LIVE', lastTestOk: boolean | null) =>
      t.prisma.integration.create({ data: { storeId: null, kind, provider, name: provider, mode, enabled: true, config: {}, secretNames: [], lastTestOk } });
    await row('PAYMENT', 'bkash', 'LIVE', true);
    await row('COURIER', 'steadfast', 'MOCK', null);
    await row('SMS', 'bulkSmsBd', 'LIVE', false);
    expect(item((await get()).body.items, 'connections').vars).toEqual({ live: 'bkash', missing: 'COURIER, SMS' });
    await deps.resolver.set('golive.connections', { kinds: ['PAYMENT'] }, INSTALLATION, { actorId: ownerId, reason: 'test' });
    expect(item((await get()).body.items, 'connections')).toMatchObject({ ok: true });
  });

  it("PR 399: the owner's fields filled in and a band switched on (a free one too) make the line done", async () => {
    const who = { actorId: ownerId, reason: 'test' };
    await deps.resolver.set('contact.phone', '+8801700000000', storeTarget(A), who);
    await deps.resolver.set('contact.address', { en: 'Sample road 1, Dhaka', bn: 'নমুনা রোড ১, ঢাকা' }, storeTarget(A), who);
    await deps.resolver.set('legal.registeredName', 'Sample Trading', storeTarget(A), who);
    let r = await get();
    expect(item(r.body.items, 'ownerData').vars?.missing).toBe('Sample store A: legal.tradeLicence, delivery band');
    await deps.resolver.set('legal.tradeLicence', 'TL-0000-SAMPLE', storeTarget(A), who);
    await t.prisma.deliveryBand.create({ data: { storeId: A, key: 'city', nameEn: 'City', chargeMinor: 0, enabled: true } });
    r = await get();
    expect(item(r.body.items, 'ownerData')).toMatchObject({ ok: true, vars: { stores: 1, missing: '—' } });
    // The answer names fields, never their values.
    expect(JSON.stringify(r.body)).not.toContain('TL-0000-SAMPLE');
  });

  it('a sign-off is kept with who, shown with the name, audited, and taken back; a reader may look but not confirm', async () => {
    const post = (b: unknown, cookie = owner) => goLiveRoute(call('POST', '/api/admin/go-live/signoff', { cookie, body: b }), deps, ['signoff']);
    expect((await post({ key: 'runbook', done: true }, reader)).status).toBe(403);
    expect((await get(reader)).status).toBe(200);
    expect((await post({ key: 'smoke', done: true })).status).toBe(400);
    const res = await post({ key: 'runbook', done: true });
    const body = (await res.json()) as { items: Item[]; people: Record<string, string> };
    expect(item(body.items, 'runbook')).toMatchObject({ ok: true, by: ownerId });
    expect(body.people[ownerId]).toBe('Sample owner');
    expect(await t.prisma.auditLog.count({ where: { action: 'golive.signoff' } })).toBe(1);
    await post({ key: 'runbook', done: false });
    expect(item((await get()).body.items, 'runbook').ok).toBe(false);
  });
});
