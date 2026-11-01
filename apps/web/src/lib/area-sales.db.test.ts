// S16 · PR 568 — Reports → Sales by area on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the query made
// safe (unknown level → district, a bad or foreign category/product id dropped), the table as a CSV with the unknown,
// outside and total lines, a reader may download it, signed out 401, a write 405; products found by name or SKU.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { areaReport, areasRoute, findAreaProducts, parseAreaQuery, ratePct } from './area-sales';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const LIMITS = { maxDays: 1830, maxDayRows: 92 };

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.78' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe('the area query (PR 568)', () => {
  it('an unknown level falls back to district; only ids are taken', () => {
    expect(parseAreaQuery({ level: 'dhaka', category: '0190A1B2-0000-7000-8000-00000000ABCD' })).toEqual({ level: 'dhaka', categoryId: '0190a1b2-0000-7000-8000-00000000abcd', productId: null });
    expect(parseAreaQuery({ level: 'planet', product: "1' OR 1=1" })).toEqual({ level: 'district', categoryId: null, productId: null });
    expect(ratePct(1 / 3)).toBe(33.3);
    expect(ratePct(null)).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('Reports → Sales by area on PostgreSQL (PR 568)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let B = 0;
  let owner = '';
  const g: Record<string, string> = {};
  const csv = (cookie?: string, query = '', method = 'GET') => areasRoute(call(method, `/api/admin/reports/areas?storeId=${A}&from=2026-10-01&to=2026-10-31${query}`, cookie), deps);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('area-sales');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const dhk = await t.prisma.geoArea.create({ data: { level: 'DISTRICT', nameEn: 'Dhaka', code: 'test.dhk', ancestorIds: [], aliases: [], postcodes: [] } });
    g.mirpur = (await t.prisma.geoArea.create({ data: { level: 'THANA', nameEn: 'Mirpur', code: 'test.mirpur', parentId: dhk.id, ancestorIds: [dhk.id], aliases: [], postcodes: [], cityCorporation: 'DNCC' } })).id;
    g.savar = (await t.prisma.geoArea.create({ data: { level: 'UPAZILA', nameEn: 'Savar, old town', code: 'test.savar', parentId: dhk.id, ancestorIds: [dhk.id], aliases: [], postcodes: [] } })).id;
    g.shirts = (await t.prisma.category.create({ data: { storeId: A, slug: 'sample-shirts', nameEn: 'Shirts' } })).id;
    g.otherCat = (await t.prisma.category.create({ data: { storeId: B, slug: 'sample-other', nameEn: 'Other' } })).id;
    const shirt = await t.prisma.product.create({ data: { storeId: A, slug: 'sample-oxford', nameEn: 'Oxford shirt', categoryId: g.shirts } });
    g.shirt = shirt.id;
    await t.prisma.productVariant.create({ data: { storeId: A, productId: shirt.id, sku: 'SAMPLE-OX-M', priceMinor: 100_000 } });
    let n = 0;
    for (const [area, status, total] of [
      [g.mirpur, 'DELIVERED', 100_000],
      [g.savar, 'DELIVERED', 50_000],
      [g.savar, 'RETURNED', 50_000],
      [null, 'DELIVERED', 10_000],
    ] as const) {
      n += 1;
      const at = new Date('2026-10-07T06:00:00Z');
      const o = await t.prisma.order.create({
        data: { storeId: A, number: `W568-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: new Date('2026-10-05T04:00:00Z'), deliveredAt: status === 'DELIVERED' ? at : null, returnedAt: status === 'RETURNED' ? at : null, areaId: area, subtotalMinor: total, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: total, paymentMethod: 'COD', idempotencyKey: `w568-${n}` },
      });
      await t.prisma.orderItem.create({ data: { storeId: A, orderId: o.id, productId: shirt.id, sku: 'SAMPLE-OX-M', productName: 'Oxford shirt', quantity: 1, unitPriceMinor: total, lineTotalMinor: total, status: 'ACTIVE' } });
    }
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('a foreign category is dropped; this store’s category and product are named', async () => {
    const foreign = await areaReport(deps, A, { from: '2026-10-01', to: '2026-10-31', category: g.otherCat }, LIMITS, 'Asia/Dhaka');
    expect(foreign.area.categoryId).toBeNull();
    expect(foreign.category).toBeNull();
    const mine = await areaReport(deps, A, { from: '2026-10-01', to: '2026-10-31', level: 'upazila', category: g.shirts, product: g.shirt }, LIMITS, 'Asia/Dhaka');
    expect(mine.category?.nameEn).toBe('Shirts');
    expect(mine.product?.nameEn).toBe('Oxford shirt');
    expect(mine.sales.rows.map((r) => [r.nameEn, r.parentNameEn, r.delivered, r.returned])).toEqual([
      ['Mirpur', 'Dhaka', 1, 0],
      ['Savar, old town', 'Dhaka', 1, 1],
    ]);
  });

  it('the CSV: rows, unknown, outside (Dhaka level only) and total; signed out 401, a write 405', async () => {
    const res = await csv(owner, '&level=dhaka');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('areas-dhaka-2026-10-01-2026-10-31.csv');
    const text = await res.text();
    expect(text).toContain('Mirpur,Dhaka,1,100000,1,0,0,BDT\r\n');
    expect(text).toContain('(area not known),,1,10000,1,0,0,BDT\r\n');
    expect(text).toContain('(outside Dhaka City),,1,50000,1,1,50,BDT\r\n');
    expect(text).toContain('(total),,3,160000,3,1,25,BDT\r\n');
    const district = await (await csv(owner)).text();
    expect(district).not.toContain('outside Dhaka City');
    expect(district).toContain('Dhaka,,2,150000,2,1,33.3,BDT\r\n');
    const upazila = await (await csv(owner, '&level=upazila')).text();
    expect(upazila).toContain('"Savar, old town",Dhaka,1,50000,1,1,50,BDT\r\n');
    expect((await csv()).status).toBe(401);
    expect((await csv(owner, '', 'PUT')).status).toBe(405);
  });

  it('finds a product by name or SKU, this store only, at most the number asked', async () => {
    expect((await findAreaProducts(t.prisma, A, 'oxford', 10)).map((p) => p.nameEn)).toEqual(['Oxford shirt']);
    expect((await findAreaProducts(t.prisma, A, 'sample-ox-m', 10)).map((p) => p.id)).toEqual([g.shirt]);
    expect(await findAreaProducts(t.prisma, B, 'oxford', 10)).toEqual([]);
    expect(await findAreaProducts(t.prisma, A, 'o', 10)).toEqual([]);
  });
});
