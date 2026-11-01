// S16 · PR 537 — the VAT report on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): no report while the VAT
// system is off (the CSV answers 409 VAT_OFF); on, the period's delivered orders with the VAT inside them at the owner's
// rates, as a CSV a reader may download (signed out 401, a write method 405); the Profit & loss line reads the same
// figure. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { profitReport, profitCsv } from './profit-report';
import { vatRoute } from './vat-api';
import { vatCsv, vatReportFor } from './vat-report';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.77' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Money → VAT report on PostgreSQL (PR 537)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let shirts = '';
  const report = (cookie?: string, method = 'GET') => vatRoute(call(method, `/api/admin/money/vat/report?storeId=${A}&from=2026-10-01&to=2026-10-31`, cookie), deps, ['report']);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('vat-report');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    shirts = (await t.prisma.category.create({ data: { storeId: A, slug: 'sample-shirts', nameEn: 'Shirts, formal' } })).id;
    const shirt = await t.prisma.product.create({ data: { storeId: A, slug: 'sample-shirt', nameEn: 'Shirt', categoryId: shirts } });
    const o = await t.prisma.order.create({
      data: { storeId: A, number: 'W537-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date('2026-10-05T04:00:00Z'), deliveredAt: new Date('2026-10-07T06:00:00Z'), subtotalMinor: 115_000, discountMinor: 0, deliveryChargeMinor: 11_500, totalMinor: 126_500, paymentMethod: 'COD', idempotencyKey: 'w537-1' },
    });
    await t.prisma.orderItem.create({ data: { storeId: A, orderId: o.id, productId: shirt.id, sku: 'SAMPLE-SH-M', productName: 'Shirt', quantity: 1, unitPriceMinor: 115_000, lineTotalMinor: 115_000, status: 'ACTIVE' } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('while the VAT system is off there is no report', async () => {
    expect(await vatReportFor(deps, A, '2026-10-01', '2026-10-31')).toBeNull();
    const res = await report(owner);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: 'VAT_OFF' });
  });

  it('on: the VAT inside the delivered goods (and delivery, when on) as a CSV; signed out 401, a write 405', async () => {
    const to = storeTarget(A);
    await deps.resolver.set('vat.rates', { defaultBps: 1_500, categories: [{ categoryId: shirts, bps: 1_500 }], products: [] }, to, { actorId: null, reason: 'test' });
    await deps.resolver.set('vat.system', { enabled: true, onDelivery: true }, to, { actorId: null, reason: 'test' });
    const r = (await vatReportFor(deps, A, '2026-10-01', '2026-10-31'))!;
    expect(r).toMatchObject({ orders: 1, salesMinor: 115_000, goodsVatMinor: 15_000, deliveryVatMinor: 1_500, totalVatMinor: 16_500, unratedMinor: 0 });
    const res = await report(owner);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('vat-2026-10-01-2026-10-31.csv');
    const csv = await res.text();
    expect(csv).toContain('sales.delivered,115000,BDT\r\n');
    expect(csv).toContain('vat.total,16500,BDT\r\n');
    expect(csv).toContain('1500,1,115000,15000\r\n');
    expect(csv).toContain('"Shirts, formal",1,115000,15000,0\r\n');
    expect(csv).toContain('2026-10-07,1,115000,16500\r\n');
    // Profit & loss carries the same figure as one more line, only while the system is on
    const pl = await profitReport(deps, A, '2026-10-01', '2026-10-31');
    expect(profitCsv(pl, 'BDT', r.totalVatMinor)).toContain('vat.insideSales,16500,BDT\r\n');
    expect(profitCsv(pl, 'BDT')).not.toContain('vat.insideSales');
    expect((await report()).status).toBe(401);
    expect((await report(owner, 'PUT')).status).toBe(405);
  });

  it('a name that starts like a formula is made safe in the file', () => {
    const csv = vatCsv({ ...emptyReport(), byCategory: [{ categoryId: 'x', lines: 1, netMinor: 1, vatMinor: 0, unratedMinor: 0 }] }, 'BDT', () => '=HYPERLINK("x")');
    expect(csv).toContain(`"'=HYPERLINK(""x"")",1,1,0,0`);
  });
});

function emptyReport() {
  return { from: '2026-10-01', to: '2026-10-01', orders: 0, salesMinor: 0, goodsVatMinor: 0, unratedMinor: 0, unratedSkus: [], deliveryMinor: 0, deliveryVatMinor: null, totalVatMinor: 0, byRate: [], byCategory: [], byDay: [] };
}
