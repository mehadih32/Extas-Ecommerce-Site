// S16 · PR 343 — Money → Cost ledger on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the spend by period
// and service from the store's own rows only; a top-up raises the balance once for one request key (a double tap writes
// once) and is audited; the low mark is kept and audited, and a balance under it is "low"; the export is a CSV of the
// period, cut at the setting and saying so; a reader with `books.read` may export, never record a top-up. Every value is
// made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { costLedger, costLedgerRoute } from './cost-ledger';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.73' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('cost ledger on PostgreSQL (PR 343)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let B = 0;
  let owner = '';
  let reader = '';
  const route = (method: string, path: string, opts: { body?: unknown; cookie?: string; query?: string } = {}) =>
    costLedgerRoute(call(method, `/api/admin/money/cost-ledger${path ? `/${path}` : ''}?storeId=${A}${opts.query ?? ''}`, opts), deps, path ? [path] : []);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('costledger');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Books reader', nameBn: 'হিসাব পাঠক', permissions: ['books.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
    await deps.resolver.set('store.timeZone', 'Asia/Dhaka', storeTarget(A), { actorId: null, reason: 'test' });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const cost = (storeId: number, service: string, amountMinor: number, occurredAt: Date) =>
    t.prisma.costEntry.create({ data: { storeId, service, module: 'messages', amountMinor, currency: 'BDT', refType: 'notification', refId: null, detail: 'placed · sample', source: 'system', occurredAt } });

  it('spend by period and service, this store only; latest rows capped; prepaid balances with low', async () => {
    const now = new Date('2026-10-31T06:00:00Z'); // 12:00 in Dhaka
    await cost(A, 'SMS', 35, new Date('2026-10-31T01:00:00Z'));
    await cost(A, 'SMS', 70, new Date('2026-10-05T01:00:00Z'));
    await cost(A, 'WHATSAPP', 90, new Date('2026-10-30T20:00:00Z')); // 31 Oct 02:00 in Dhaka: today
    await cost(A, 'EMAIL', 5, new Date('2026-03-01T00:00:00Z'));
    await cost(B, 'SMS', 9_999, new Date('2026-10-31T01:00:00Z'));
    await t.prisma.prepaidBalance.create({ data: { storeId: A, service: 'SMS', balanceMinor: 250, lowThresholdMinor: 300 } });
    const o = await costLedger(t.prisma, A, 'Asia/Dhaka', 3, now);
    expect(o.periods.map((p) => [p.key, p.minor, p.count])).toEqual([
      ['today', 125, 2],
      ['month', 195, 3],
      ['year', 200, 4],
    ]);
    expect(o.periods[1]!.byService).toEqual([
      { service: 'SMS', minor: 105, count: 2 },
      { service: 'WHATSAPP', minor: 90, count: 1 },
    ]);
    expect(o.recent).toHaveLength(3);
    expect(o.more).toBe(true);
    expect(o.prepaid).toEqual([{ service: 'SMS', balanceMinor: 250, lowMinor: 300, low: true, lastTopUp: null }]);
  });

  it('a top-up raises the balance once per request key, audited; the low mark is kept; a reader may not', async () => {
    const body = { service: 'SMS', amountMinor: 200_000, credits: 5_000, note: 'receipt 17', requestKey: 'topup-key-0001' };
    const r1 = await route('POST', 'top-up', { cookie: owner, body });
    expect(r1.status).toBe(201);
    expect(await r1.json()).toMatchObject({ ok: true, service: 'SMS', again: false, balanceMinor: 200_250 });
    const r2 = await route('POST', 'top-up', { cookie: owner, body });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ again: true, balanceMinor: 200_250 });
    expect(await t.prisma.prepaidTopUp.count({ where: { storeId: A } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'costs.topUp', storeId: A } })).toBe(1);

    expect((await route('POST', 'top-up', { cookie: owner, body: { ...body, requestKey: 'topup-key-0002', amountMinor: 0 } })).status).toBe(400);
    expect((await route('POST', 'top-up', { cookie: owner, body: { ...body, requestKey: 'topup-key-0003', service: 'COURIER' } })).status).toBe(400);
    expect((await route('POST', 'top-up', { cookie: reader, body: { ...body, requestKey: 'topup-key-0004' } })).status).toBe(403);
    expect((await route('GET', 'top-up', { cookie: owner })).status).toBe(405);

    const low = await route('PUT', 'low-mark', { cookie: owner, body: { service: 'SMS', lowMinor: 50_000 } });
    expect(low.status).toBe(200);
    expect((await t.prisma.prepaidBalance.findUniqueOrThrow({ where: { storeId_service: { storeId: A, service: 'SMS' } } })).lowThresholdMinor).toBe(50_000);
    expect((await route('PUT', 'low-mark', { cookie: owner, body: { service: 'SMS', lowMinor: null } })).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'costs.lowMark', storeId: A } })).toBe(2);
    const view = await costLedger(t.prisma, A, 'Asia/Dhaka', 50);
    expect(view.prepaid[0]).toMatchObject({ service: 'SMS', balanceMinor: 200_250, lowMinor: null, low: false, lastTopUp: { amountMinor: 200_000, credits: 5_000 } });
  });

  it('the export: the period as CSV, cut at the setting and saying so; a reader may export', async () => {
    const r = await route('GET', '', { cookie: reader, query: '&from=2026-10-01&to=2026-10-31' });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/csv');
    const lines = (await r.text()).trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines.slice(1).every((l) => l.includes(',SMS,') || l.includes(',WHATSAPP,'))).toBe(true);

    await deps.resolver.set('costs.ledger', { recentRows: 50, exportMaxRows: 100 }, storeTarget(A), { actorId: null, reason: 'test' });
    for (let i = 0; i < 101; i++) await cost(A, 'SMS', 1, new Date(`2026-08-15T0${i % 10}:00:00Z`));
    const cut = await (await route('GET', '', { cookie: owner, query: '&from=2026-08-01&to=2026-08-31' })).text();
    expect(cut.trim().split('\r\n')).toHaveLength(102);
    expect(cut).toContain('# cut at 100 rows');

    expect((await route('GET', '', { cookie: owner, query: '&from=2026-10-31&to=2026-10-01' })).status).toBe(400);
  });
});
