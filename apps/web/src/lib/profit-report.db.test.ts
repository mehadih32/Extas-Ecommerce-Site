// S16 · PR 349 — Money → Profit & loss with settings and fixed costs (skipped without TEST_DATABASE_ADMIN_URL): the
// fixed costs of a month (its latest version) spread over its days and only the period's days counted; no fixed costs
// entered = null (not 0); net profit = contribution − ads − other − fixed; the CSV for a books reader, refused without
// a session and for another method. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { fixedCostsIn, profitReport, profitRoute } from './profit-report';

const HOST = 'admin.example.test';
const PW = 'a long sentence for the tests';
function call(method: string, path: string, cookie?: string) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.74' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  return new Request(`https://${HOST}${path}`, { method, headers, body: method === 'POST' ? JSON.stringify({ email: 'owner@example.com', password: PW }) : undefined });
}

describe.skipIf(!HAS_TEST_DB)('profit & loss with fixed costs (PR 349)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('profit_349');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    const login = call('POST', '/api/admin/auth/login');
    login.headers.set('content-type', 'application/json');
    owner = (await loginHandler(login, deps)).headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
    await deps.resolver.set('store.timeZone', 'Asia/Dhaka', storeTarget(A), { actorId: null, reason: 'test' });
    const link = await t.prisma.erpStoreLink.create({ data: { storeId: A } });
    // October 2026 has 31 days: 31,000 + 10 → 1,000 a day, the last day 1,010; version 2 replaces version 1
    await t.prisma.erpFixedCostMonth.create({ data: { storeId: A, linkId: link.id, month: new Date('2026-10-01T00:00:00Z'), version: 1, salaryMinor: 99_999n, rentMinor: 0n, utilitiesMinor: 0n, otherMinor: 0n } });
    await t.prisma.erpFixedCostMonth.create({ data: { storeId: A, linkId: link.id, month: new Date('2026-10-01T00:00:00Z'), version: 2, salaryMinor: 20_000n, rentMinor: 10_000n, utilitiesMinor: 1_000n, otherMinor: 10n } });
    const o = await t.prisma.order.create({ data: { storeId: A, number: 'W349-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date('2026-10-30T06:00:00Z'), deliveredAt: new Date('2026-10-31T06:00:00Z'), subtotalMinor: 100_000, totalMinor: 100_000, paymentMethod: 'COD', idempotencyKey: 'w349-1' } });
    await t.prisma.orderItem.create({ data: { storeId: A, orderId: o.id, sku: 'POLO-M', productName: 'Sample polo', quantity: 1, unitPriceMinor: 100_000, lineTotalMinor: 100_000, unitCostMinor: 60_000 } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('fixed costs: the latest version spread by days, only the period’s days; none entered is null', async () => {
    expect(await fixedCostsIn(t.prisma, A, '2026-10-01', '2026-10-31')).toBe(31_010);
    expect(await fixedCostsIn(t.prisma, A, '2026-10-30', '2026-11-01')).toBe(2_010);
    expect(await fixedCostsIn(t.prisma, A, '2026-09-01', '2026-09-30')).toBeNull();
  });

  it('net profit = contribution − ads − other − fixed', async () => {
    const r = await profitReport(deps, A, '2026-10-30', '2026-10-31');
    expect(r.contributionMinor).toBe(40_000);
    expect(r.fixedMinor).toBe(2_010);
    expect(r.netProfitMinor).toBe(40_000 - 2_010);
  });

  it('the CSV for a books reader; no session refused; GET only', async () => {
    const res = await profitRoute(call('GET', `/api/admin/money/profit?storeId=${A}&from=2026-10-30&to=2026-10-31`, owner), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('profit-2026-10-30-2026-10-31.csv');
    const text = await res.text();
    expect(text).toContain('sales.delivered,100000,BDT');
    expect(text).toContain('netProfit,37990,BDT');
    expect(text).toContain('2026-10-31,1,100000,40000,40000');
    expect((await profitRoute(call('GET', `/api/admin/money/profit?storeId=${A}`), deps)).status).toBe(401);
    expect((await profitRoute(new Request(`https://${HOST}/api/admin/money/profit`, { method: 'DELETE' }), deps)).status).toBe(405);
  });
});
