// S08 · PR 192 — the courier claims and rider issues API on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): everything ships off and empty; a claim or a rider issue is refused while its switch is off;
// the owner's switches are saved against the value the page showed (a stale one is refused) and audited; a reader with
// only `support.read` sees the list but may not switch anything; an order number that is not the shop's is named. The
// money paths themselves (claims, approval, the refund request) are tested in @extas/payments. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { claimsRoute, riderIssuesRoute } from './courier-report-api';

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

describe.skipIf(!HAS_TEST_DB)('courier claims and rider issues API on PostgreSQL (PR 192)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let reader = '';
  const claims = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; key?: string } = {}) => {
    const res = await claimsRoute(call(method, `/api/admin/delivery/claims${path.length ? `/${path.join('/')}` : ''}?storeId=${A}`, opts), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const rider = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; key?: string } = {}) => {
    const res = await riderIssuesRoute(call(method, `/api/admin/support/rider-issues${path.length ? `/${path.join('/')}` : ''}?storeId=${A}`, opts), deps, path, null);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('courier_report');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Support reader', nameBn: 'সাপোর্ট দেখা', permissions: ['support.read', 'delivery.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships off and empty; a claim or a rider issue is refused while off', async () => {
    const list = await claims('GET', [], { cookie: reader });
    expect(list.status).toBe(200);
    expect(list.body.open).toEqual({ count: 0, claimedMinor: 0 });
    expect(list.body.rows).toEqual([]);
    const issues = await rider('GET', [], { cookie: reader });
    expect(issues.status).toBe(200);
    expect(issues.body.counts).toEqual({ LOGGED: 0, APPROVED: 0, REJECTED: 0 });

    const raise = await claims('POST', [], { cookie: owner, key: 'claim-off-1', body: { shipmentId: SAMPLE_UUID, kind: 'LOST', note: 'the courier says it is lost' } });
    expect(raise.body.error).toBe('FEATURE_OFF');
    const log = await rider('POST', [], { cookie: owner, key: 'rider-off-1', body: { orderId: SAMPLE_UUID, chargedMinor: 130_000, words: 'the rider asked for more', proofMediaIds: [] } });
    expect(log.body.error).toBe('FEATURE_OFF');
  });

  it("the owner's switches: saved against what the page showed, a stale one refused, audited; a reader may not", async () => {
    const denied = await claims('POST', ['settings'], { cookie: reader, body: { key: 'delivery.courier.claims', before: { enabled: false }, value: { enabled: true } } });
    expect(denied.status).toBe(403);
    const deniedRider = await rider('POST', ['settings'], { cookie: reader, body: { before: { enabled: false }, value: { enabled: true } } });
    expect(deniedRider.status).toBe(403);

    const wrongKey = await claims('POST', ['settings'], { cookie: owner, body: { key: 'store.currency', before: 'BDT', value: 'USD' } });
    expect(wrongKey.status).toBe(400);

    const on = await claims('POST', ['settings'], { cookie: owner, body: { key: 'delivery.courier.claims', before: { enabled: false }, value: { enabled: true } } });
    expect(on.status).toBe(200);
    expect(await deps.resolver.value('delivery.courier.claims', { storeId: A })).toEqual({ enabled: true });
    const stale = await claims('POST', ['settings'], { cookie: owner, body: { key: 'delivery.courier.claims', before: { enabled: false }, value: { enabled: true } } });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('STALE');

    const book = await claims('POST', ['settings'], { cookie: owner, body: { key: 'delivery.courier.rtoBook', before: { enabled: false }, value: { enabled: true } } });
    expect(book.status).toBe(200);
    // PR 564: the charge mismatch log's switch, saved the same way; it takes nothing but on/off
    const log = await claims('POST', ['settings'], { cookie: owner, body: { key: 'delivery.chargeMismatch', before: { enabled: false }, value: { enabled: true } } });
    expect(log.status).toBe(200);
    expect(await deps.resolver.value('delivery.chargeMismatch', { storeId: A })).toEqual({ enabled: true });
    const extra = await claims('POST', ['settings'], { cookie: owner, body: { key: 'delivery.chargeMismatch', before: { enabled: true }, value: { enabled: true, correct: true } } });
    expect(extra.status).toBe(400);

    const before = await deps.resolver.value('support.riderIssues', { storeId: A });
    expect(before).toMatchObject({ enabled: false, refundAsk: false });
    const riderOn = await rider('POST', ['settings'], { cookie: owner, body: { before, value: { ...before, enabled: true } } });
    expect(riderOn.status).toBe(200);
    const bad = await rider('POST', ['settings'], { cookie: owner, body: { before: { ...before, enabled: true }, value: { ...before, enabled: true, maxPhotos: 99 } } });
    expect(bad.status).toBe(400);

    const audits = await t.prisma.auditLog.findMany({ where: { action: 'setting.save', entityId: { in: ['delivery.courier.claims', 'delivery.courier.rtoBook', 'delivery.chargeMismatch', 'support.riderIssues'] } } });
    expect(audits).toHaveLength(4);
  });

  it('with the switches on: an unknown parcel or order number is named, never guessed', async () => {
    const raise = await claims('POST', [], { cookie: owner, key: 'claim-on-1', body: { shipmentId: SAMPLE_UUID, kind: 'LOST', note: 'the courier says it is lost' } });
    expect(raise.status).toBe(404);
    const log = await rider('POST', [], { cookie: owner, key: 'rider-on-1', body: { orderNumber: 'NO-SUCH-1', chargedMinor: 130_000, words: 'the rider asked for more', proofMediaIds: [] } });
    expect(log.status).toBe(404);
    expect(log.body.details).toEqual(['orderNumber']);
    const readerLog = await rider('POST', [], { cookie: reader, key: 'rider-on-2', body: { orderNumber: 'NO-SUCH-1', chargedMinor: 130_000, words: 'the rider asked for more', proofMediaIds: [] } });
    expect(readerLog.status).toBe(403);
    const move = await claims('POST', ['not-a-uuid', 'move'], { cookie: owner, body: { to: 'SENT' } });
    expect(move.status).toBe(404);
  });
});
