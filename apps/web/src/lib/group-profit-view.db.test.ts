// S16 · PR 504 — Money → Profit by group on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): by category
// unless style is asked for, the owner's figures read from settings (packaging empty as shipped → left out), the table
// as a CSV with the total line, a reader may download it, signed out 401, a write 405. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { groupProfitCsv, groupProfitRoute, groupProfitView, marginPct } from './group-profit-view';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const LIMITS = { maxDays: 1830, maxDayRows: 92 };

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.79' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Money → Profit by group on PostgreSQL (PR 504)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  const csv = (cookie?: string, query = '', method = 'GET') => groupProfitRoute(call(method, `/api/admin/money/profit/groups?storeId=${A}&from=2026-10-01&to=2026-10-31${query}`, cookie), deps);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('group-profit');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const shirts = await t.prisma.category.create({ data: { storeId: A, slug: 'sample-shirts', nameEn: 'Shirts, formal' } });
    const polo = await t.prisma.styleGroup.create({ data: { storeId: A, level: 1, path: 'Polo', name: 'Polo', ancestorIds: [] } });
    const shirt = await t.prisma.product.create({ data: { storeId: A, slug: 'sample-shirt', nameEn: 'Shirt', categoryId: shirts.id, styleGroupId: polo.id } });
    const o = await t.prisma.order.create({
      data: { storeId: A, number: 'W504-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date('2026-10-05T04:00:00Z'), deliveredAt: new Date('2026-10-07T06:00:00Z'), subtotalMinor: 100_000, discountMinor: 0, deliveryChargeMinor: 10_000, totalMinor: 110_000, paymentMethod: 'COD', idempotencyKey: 'w504-1' },
    });
    await t.prisma.orderItem.create({ data: { storeId: A, orderId: o.id, productId: shirt.id, sku: 'SAMPLE-SH-M', productName: 'Shirt', quantity: 2, unitPriceMinor: 50_000, lineTotalMinor: 100_000, unitCostMinor: 30_000, status: 'ACTIVE' } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('by category unless style is asked; packaging empty as shipped is left out and counted', async () => {
    const v = await groupProfitView(deps, A, { from: '2026-10-01', to: '2026-10-31', by: 'nonsense' }, LIMITS);
    expect(v.by).toBe('category');
    expect(v.adsOn).toBe(true);
    expect(v.report.rows).toHaveLength(1);
    // 100,000 − 60,000 + 10,000 delivery; packaging not known; no ad account → no ad share
    expect(v.report.rows[0]).toMatchObject({ name: 'Shirts, formal', salesMinor: 100_000, grossProfitMinor: 40_000, orderCostsMinor: 10_000, profitMinor: 50_000, missingLines: 1 });
    expect(marginPct(v.report.rows[0]!)).toBe(50);
    expect((await groupProfitView(deps, A, { from: '2026-10-01', to: '2026-10-31', by: 'style' }, LIMITS)).report.rows[0]!.name).toBe('Polo');
  });

  it('the CSV with the total line; signed out 401, a write 405; a formula-like name made safe', async () => {
    const res = await csv(owner);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('profit-by-category-2026-10-01-2026-10-31.csv');
    const text = await res.text();
    expect(text).toContain('"Shirts, formal",0,1,2,100000,0,60000,40000,10000,0,50000,50,1,BDT\r\n');
    expect(text).toContain('(total),,1,2,100000,0,60000,40000,10000,0,50000,50,1,BDT\r\n');
    expect(await (await csv(owner, '&by=style')).text()).toContain('Polo,0,1,2,100000');
    expect((await csv()).status).toBe(401);
    expect((await csv(owner, '', 'PUT')).status).toBe(405);
    const v = await groupProfitView(deps, A, { from: '2026-10-01', to: '2026-10-31' }, LIMITS);
    expect(groupProfitCsv(v.report, 'BDT', () => '=SUM(A1)')).toContain(`'=SUM(A1)`);
  });
});
