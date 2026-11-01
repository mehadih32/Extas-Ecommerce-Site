// S16 · PR 355 — Money → Profit by channel on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the owner's
// UTM words read from settings (shipped with the common words), a paid Facebook visit in Meta ads, a website order
// organic, the platform's spend set against its Sales; the CSV with the total line; the words saved with their version
// and audited, a stale version refused, a wrong shape refused; signed out 401, a write on the CSV 405. Values made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { channelProfitRoute, channelProfitView } from './channel-profit-view';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const LIMITS = { maxDays: 1830, maxDayRows: 92 };
const Q = { from: '2026-10-01', to: '2026-10-31' };

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.81' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Money → Profit by channel on PostgreSQL (PR 355)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  const route = (method: string, path: string[], cookie?: string, body?: unknown) =>
    channelProfitRoute(call(method, `/api/admin/money/profit/channels${path.length ? `/${path.join('/')}` : ''}?storeId=${A}&from=${Q.from}&to=${Q.to}`, cookie, body), deps, path);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('channel-profit');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    let n = 0;
    const order = async (x: { utmSource?: string; utmMedium?: string; total: number }) => {
      n += 1;
      const o = await t.prisma.order.create({
        data: { storeId: A, number: `W355-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date('2026-10-05T04:00:00Z'), deliveredAt: new Date('2026-10-07T06:00:00Z'), subtotalMinor: x.total, deliveryChargeMinor: 0, totalMinor: x.total, paymentMethod: 'COD', utmSource: x.utmSource ?? null, utmMedium: x.utmMedium ?? null, idempotencyKey: `w355-${n}` },
      });
      await t.prisma.orderItem.create({ data: { storeId: A, orderId: o.id, sku: `SAMPLE-355-${n}`, productName: 'Sample', quantity: 1, unitPriceMinor: x.total, lineTotalMinor: x.total, unitCostMinor: x.total / 2 } });
    };
    await order({ utmSource: 'facebook', utmMedium: 'cpc', total: 100_000 });
    await order({ total: 40_000 });
    const acc = await t.prisma.adAccount.create({ data: { storeId: A, platform: 'META', externalId: 'act-w355', name: 'Sample ads', currency: 'BDT' } });
    await t.prisma.adSpendDaily.create({ data: { storeId: A, adAccountId: acc.id, date: new Date('2026-10-06T00:00:00Z'), platform: 'META', spendMinor: 30_000, currency: 'BDT' } });
  });
  afterAll(async () => t?.drop());

  it('the shipped words put a paid Facebook visit in Meta ads; its spend set against it; the CSV has the total', async () => {
    const v = await channelProfitView(deps, A, Q, LIMITS);
    expect(v.report.rows.map((r) => [r.key, r.salesMinor, r.adSpendMinor, r.profitMinor])).toEqual([
      ['ads:META', 100_000, 30_000, 50_000 - 30_000],
      ['organic', 40_000, 0, 20_000],
    ]);
    const res = await route('GET', [], owner);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('profit-by-channel-2026-10-01-2026-10-31.csv');
    const text = await res.text();
    expect(text).toContain('ads:META,1,100000,0,0,50000,30000,20000,20,0,0,1,BDT\r\n' /* packaging not entered: 1 order misses a part */);
    expect(text).toContain('total,2,140000,0,0,70000,30000,40000,28.6,0,0,2,BDT\r\n');
    expect((await route('GET', [])).status).toBe(401);
    expect((await route('PUT', [], owner)).status).toBe(405);
  });

  it('the words are saved with their version and audited; stale or wrong refused; the report follows them', async () => {
    const v0 = await channelProfitView(deps, A, Q, LIMITS);
    const value = { ...v0.rules.value, platforms: v0.rules.value.platforms.map((p) => (p.platform === 'META' ? { ...p, sources: ['instagram'] } : p)) };
    expect((await route('PUT', ['rules'], owner, { value: { paidMediums: 'cpc' }, version: v0.rules.version })).status).toBe(400);
    const ok = await route('PUT', ['rules'], owner, { value, version: v0.rules.version });
    expect(ok.status).toBe(200);
    expect((await route('PUT', ['rules'], owner, { value: v0.rules.value, version: v0.rules.version })).status).toBe(409);
    expect(await t.prisma.auditLog.count({ where: { action: 'reports.channels', storeId: A } })).toBe(1);
    const v1 = await channelProfitView(deps, A, Q, LIMITS);
    expect(v1.report.rows.find((r) => r.key === 'ads:OTHER')?.salesMinor).toBe(100_000);
  });
});
