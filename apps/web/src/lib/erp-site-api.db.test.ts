// PR 620 (CN-028, docs/erp/site-changes-v6.md §2.7) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the
// two calls the ERP makes to the shop when the owner clicks, end to end through the route's handler — signed with the
// store's own secret, answered live with that store's top products and customers only, every call logged without a
// customer in the log, a bad query refused, the row limits settings. CN-029 §16: stores A and B each have their own
// ERP connection and secret; nothing of one is ever answered to the other. Every key, number and name is made up; the
// clock is fixed at 23 Oct 2026.
// qa-gate (30 Oct): a call refused from the request alone reads nothing (the route builds no deps for it, the handler
// touches no database); only a verified caller's call gets its own log row; the search length is a setting.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, signedErpSiteCall } from '@extas/adapters';
import { syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { ERP_SITE_CALL_EVENT, newErpSiteGuard, type SettingsReader } from '@extas/inventory';
import { registry, type Key, type Value } from '@extas/settings';
import { erpSiteApiHandler, erpSiteRoute } from './erp-site-api';

const T0 = new Date('2026-10-23T04:00:00Z');
const SITE = 'https://shop.example.test';
// hardcode-ok: made-up test numbers
const PHONE = { a: '+8801700006301', b: '+8801700006302' };

describe.skipIf(!HAS_TEST_DB)('PR 620 · the ERP asks the shop (route handler, PostgreSQL)', () => {
  let t: TestDatabase;
  let storeA = 0;
  let storeB = 0;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const vault = new Map<string, string>();
  const secret = { a: randomBytes(24).toString('hex'), b: randomBytes(24).toString('hex') };
  let deps: Parameters<typeof erpSiteApiHandler>[1];
  let n = 0;

  const ask = async (who: 'a' | 'b' | string, pathAndQuery: string, method = 'GET') => {
    const key = who === 'a' || who === 'b' ? secret[who] : who;
    const h = signedErpSiteCall(key, method, pathAndQuery, T0).headers;
    const res = await erpSiteApiHandler(new Request(`${SITE}${pathAndQuery}`, { method, headers: h }), deps);
    return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers };
  };

  async function sale(storeId: number, customerId: string | null, phone: string, lines: { sku: string; qty: number; total: number; cost: number }[], day: number) {
    n += 1;
    const total = lines.reduce((s, l) => s + l.total, 0);
    const at = new Date(Date.UTC(2026, 9, day, 6));
    const o = await t.prisma.order.create({
      data: { storeId, number: `W620-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: at, deliveredAt: at, subtotalMinor: total, totalMinor: total, paymentMethod: 'COD', customerId, phone, shippingAddressText: `House ${n}, Sample Road`, idempotencyKey: `w620-${n}` },
    });
    for (const l of lines) {
      await t.prisma.orderItem.create({ data: { storeId, orderId: o.id, sku: l.sku, productName: `Sample ${l.sku}`, quantity: l.qty, unitPriceMinor: l.total / l.qty, lineTotalMinor: l.total, unitCostMinor: l.cost } });
    }
  }

  beforeAll(async () => {
    t = await createTestDatabase('erpsiteweb');
    [storeA, storeB] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const connections = createConnections({ db: t.prisma, vault: { get: async (name: string, s?: { storeId?: number | null }) => vault.get(`${s?.storeId ?? '-'}:${name}`) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    deps = { db: t.prisma, settings, connections, now: () => T0, guard: newErpSiteGuard() };
    for (const [s, k] of [[storeA, secret.a], [storeB, secret.b]] as const) {
      vault.set(`${s}:extasErp.apiKey`, randomBytes(16).toString('hex'));
      vault.set(`${s}:extasErp.webhookSecret`, randomBytes(24).toString('hex'));
      vault.set(`${s}:extasErp.signingSecret`, k);
      await t.prisma.integration.create({ data: { storeId: s, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: 'https://erp.example.test' }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret', 'extasErp.signingSecret'] } });
      overrides.set(`erp.model@${s}`, 'v6');
      overrides.set(`erp.siteApi.enabled@${s}`, true);
    }
    const ca = (await t.prisma.customer.create({ data: { storeId: storeA, phone: PHONE.a, name: 'Sample Rahim' } })).id;
    const cb = (await t.prisma.customer.create({ data: { storeId: storeB, phone: PHONE.b, name: 'Sample Karim' } })).id;
    await sale(storeA, ca, PHONE.a, [{ sku: 'POLO-M', qty: 2, total: 180_000, cost: 70_000 }, { sku: 'TEE-M', qty: 1, total: 60_000, cost: 30_000 }], 10);
    await sale(storeA, ca, PHONE.a, [{ sku: 'TEE-M', qty: 1, total: 60_000, cost: 30_000 }], 12);
    await sale(storeB, cb, PHONE.b, [{ sku: 'B-ONLY-SKU', qty: 9, total: 900_000, cost: 50_000 }], 11);
  });
  afterAll(async () => t?.drop());

  it("store A's call gets store A's top products: pieces, net sales and profit in taka, best first", async () => {
    const r = await ask('a', '/erp-api/top-products?from=2026-10-01&to=2026-10-22&limit=20');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.body).toEqual({
      ok: true,
      from: '2026-10-01',
      to: '2026-10-22',
      currency: 'BDT',
      items: [
        { sku: 'POLO-M', name: 'Sample POLO-M', pieces: 2, netSales: '1800.00', profit: '400.00' },
        { sku: 'TEE-M', name: 'Sample TEE-M', pieces: 2, netSales: '1200.00', profit: '600.00' },
      ],
    });
  });

  it("store A's call gets store A's customers, live: name, address, phone, total spent, last purchase, orders, first order", async () => {
    const r = await ask('a', '/erp-api/customers?page=1&pageSize=50');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      page: 1,
      pageSize: 50,
      total: 1,
      items: [{ name: 'Sample Rahim', address: 'House 2, Sample Road', phone: PHONE.a, totalSpent: '3000.00', lastPurchaseDate: '2026-10-12', orders: 2, firstOrderDate: '2026-10-10' }],
    });
    expect((await ask('a', '/erp-api/customers?search=karim')).body.total).toBe(0);
  });

  it("§16: store B's secret answers store B's data only; one store never sees the other's", async () => {
    const top = await ask('b', '/erp-api/top-products?from=2026-10-01&to=2026-10-22');
    expect(top.body.items.map((i: { sku: string }) => i.sku)).toEqual(['B-ONLY-SKU']);
    const cus = await ask('b', '/erp-api/customers');
    expect(cus.body.items.map((i: { name: string }) => i.name)).toEqual(['Sample Karim']);
    // Store A's answers never hold store B's rows, whatever is asked.
    const a = await ask('a', '/erp-api/customers?search=01700006302');
    expect([a.status, a.body.total]).toEqual([200, 0]);
  });

  it('refuses a bad signature, a bad query and a span beyond the setting; the limits are settings', async () => {
    // Round 2: every 401 is one code; the reason (BAD_SIGNATURE) is only counted on the shop.
    expect((await ask(randomBytes(24).toString('hex'), '/erp-api/customers')).body).toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect((await ask('a', '/erp-api/customers', 'POST')).status).toBe(405);
    for (const q of ['from=2026-10-22&to=2026-10-01', 'from=yesterday&to=2026-10-01', 'to=2026-10-22', 'from=2026-10-01&to=2026-10-22&limit=0']) {
      expect((await ask('a', `/erp-api/top-products?${q}`)).body, q).toEqual({ ok: false, code: 'BAD_QUERY' });
    }
    expect((await ask('a', '/erp-api/customers?page=0')).body).toEqual({ ok: false, code: 'BAD_QUERY' });
    overrides.set('erp.siteApi.maxRangeDays', 7);
    expect((await ask('a', '/erp-api/top-products?from=2026-10-01&to=2026-10-22')).body).toEqual({ ok: false, code: 'BAD_QUERY' });
    overrides.delete('erp.siteApi.maxRangeDays');
    // The default and the most a call may ask for.
    overrides.set('erp.siteApi.topProductsLimit', 1);
    expect((await ask('a', '/erp-api/top-products?from=2026-10-01&to=2026-10-22')).body.items).toHaveLength(1);
    overrides.delete('erp.siteApi.topProductsLimit');
    overrides.set('erp.siteApi.maxRows', 1);
    expect((await ask('a', '/erp-api/top-products?from=2026-10-01&to=2026-10-22&limit=50')).body.items).toHaveLength(1);
    expect((await ask('a', '/erp-api/customers?pageSize=500')).body.pageSize).toBe(1);
    overrides.delete('erp.siteApi.maxRows');
  });

  it('every verified call is logged with its store, never a customer, a number or the search text; a refused one is only counted', async () => {
    const before = await t.prisma.securityEvent.count({ where: { kind: ERP_SITE_CALL_EVENT } });
    await ask('a', '/erp-api/customers?search=Rahim');
    await ask(randomBytes(24).toString('hex'), '/erp-api/customers');
    const rows = await t.prisma.securityEvent.findMany({ where: { kind: ERP_SITE_CALL_EVENT }, orderBy: { id: 'desc' }, take: 1 });
    expect(await t.prisma.securityEvent.count({ where: { kind: ERP_SITE_CALL_EVENT } })).toBe(before + 1);
    expect(rows.map((r) => [r.storeId, (r.details as Record<string, unknown>).code, (r.details as Record<string, unknown>).rows, (r.details as Record<string, unknown>).searched])).toEqual([[storeA, 'OK', 1, true]]);
    expect(JSON.stringify(rows)).not.toMatch(/Rahim|\+880|House/);
  });

  it("p3 review: a flood of wrong signatures from one address cuts off that address only, never the ERP's signed calls", async () => {
    overrides.set('erp.siteApi.refusedPerMinute', 3);
    const own = { ...deps, guard: newErpSiteGuard() };
    const from = async (key: string, ip: string) => {
      const h = signedErpSiteCall(key, 'GET', '/erp-api/customers?page=1', T0).headers;
      const res = await erpSiteApiHandler(new Request(`${SITE}/erp-api/customers?page=1`, { headers: { ...h, 'cf-connecting-ip': ip } }), own);
      return `${res.status} ${((await res.json()) as { code?: string }).code ?? 'OK'}`;
    };
    try {
      const wrong = randomBytes(24).toString('hex');
      const codes: string[] = [];
      for (let i = 0; i < 10; i++) codes.push(await from(wrong, '203.0.113.50'));
      // Round 2: three, then the one refresh call; every 401 is UNAUTHORIZED.
      expect(codes.slice(0, 4)).toEqual(['401 UNAUTHORIZED', '401 UNAUTHORIZED', '401 UNAUTHORIZED', '401 UNAUTHORIZED']);
      expect(codes.slice(4).every((c) => c === '429 RATE_LIMITED')).toBe(true);
      expect(await from(wrong, '198.51.100.50')).toBe('401 UNAUTHORIZED');
      expect(await from(secret.a, '198.51.100.50')).toBe('200 OK');
      expect(await from(secret.a, '203.0.113.50')).toBe('200 OK');
    } finally {
      overrides.delete('erp.siteApi.refusedPerMinute');
    }
  });

  it('qa-gate: refused from the request alone, the handler touches nothing and still answers no-store', async () => {
    const boom = (what: string) =>
      new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => { throw new Error(`${what} touched (${String(k)})`); }) });
    const none = { db: boom('db'), settings: boom('settings'), connections: boom('vault'), now: () => T0, guard: newErpSiteGuard() } as unknown as typeof deps;
    const send = async (path: string, init: RequestInit = {}) => {
      const r = await erpSiteApiHandler(new Request(`${SITE}${path}`, init), none);
      return [r.status, ((await r.json()) as { code: string }).code, r.headers.get('cache-control')];
    };
    expect(await send('/erp-api/customers')).toEqual([401, 'UNAUTHORIZED', 'no-store']);
    expect(await send('/erp-api/customers', { method: 'POST' })).toEqual([405, 'METHOD', 'no-store']);
    expect(await send('/erp-api/orders')).toEqual([404, 'NOT_FOUND', 'no-store']);
    expect(await send('/erp-api/customers', { headers: { 'x-extas-signature': 'sha256=00', 'x-extas-timestamp': '1' } })).toEqual([401, 'UNAUTHORIZED', 'no-store']);
  });

  it('qa-gate: the route answers request-only refusals before it builds any deps', async () => {
    for (const [init, path, want] of [
      [{}, '/erp-api/customers?page=1&pageSize=50', [401, 'UNAUTHORIZED']],
      [{ method: 'DELETE' }, '/erp-api/customers', [405, 'METHOD']],
      [{ method: 'HEAD' }, '/erp-api/top-products', [405, null]],
    ] as const) {
      const r = await erpSiteRoute(new Request(`${SITE}${path}`, init));
      const body = init.method === 'HEAD' ? null : ((await r.json()) as { code: string }).code;
      expect([r.status, body], path).toEqual(want);
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('qa-gate: the longest search is a setting; the signature covers the query as the URL standard reads it', async () => {
    overrides.set('erp.siteApi.searchMaxChars', 3);
    expect((await ask('a', '/erp-api/customers?search=Rahim')).body).toEqual({ ok: false, code: 'BAD_QUERY' });
    expect((await ask('a', '/erp-api/customers?search=Rah')).status).toBe(200);
    overrides.delete('erp.siteApi.searchMaxChars');
    // The ERP percent-encodes the query (RFC 3986) and signs exactly what it sends: that verifies.
    const enc = await ask('a', '/erp-api/customers?search=Sample%20Rahim');
    expect([enc.status, enc.body.total]).toEqual([200, 1]);
    // A raw space is sent by no HTTP client; signed raw, it would not match what the shop reads: refused.
    const h = signedErpSiteCall(secret.a, 'GET', '/erp-api/customers?search=Sample Rahim', T0).headers;
    const raw = await erpSiteApiHandler(new Request(`${SITE}/erp-api/customers?search=Sample Rahim`, { headers: h }), deps);
    expect([raw.status, ((await raw.json()) as { code: string }).code]).toEqual([401, 'UNAUTHORIZED']);
  });
});
