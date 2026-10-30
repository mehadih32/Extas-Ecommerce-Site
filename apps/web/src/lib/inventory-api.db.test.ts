// S09 · PR 497, 499, 196, 201, 195, 202–207 — the inventory admin API end to end on a real PostgreSQL (a throwaway
// database; skipped without TEST_DATABASE_ADMIN_URL): login and same-site checks, the ERP panel on the practice ERP (no
// vault, no key: nothing real is touched), the mode switch, warehouses with the damaged bin, the stock view, and the stock
// page's routes: health panel, re-sync, documents, low stock, stock counts, publish queue, movements and the ERP check.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import {
  auditHandler,
  auditLineHandler,
  auditsHandler,
  erpHandler,
  erpStyleHandler,
  erpStylesHandler,
  erpVerifyHandler,
  erpWarehousesHandler,
  healthHandler,
  locationHandler,
  lowStockHandler,
  movementsHandler,
  publishQueueHandler,
  pushesHandler,
  pushesRetryHandler,
  reconcileHandler,
  resyncHandler,
  shopPricesHandler,
  shopPricesSeenHandler,
  stockHandler,
  warehouseHandler,
  warehouseLocationsHandler,
  warehousesHandler,
} from './inventory-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe.skipIf(!HAS_TEST_DB)('inventory admin API on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('inventory_api');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login, a database and a same-site request', async () => {
    expect((await erpHandler(call('GET', '/api/admin/inventory/erp'), deps)).status).toBe(401);
    expect((await erpHandler(call('GET', '/api/admin/inventory/erp', { cookie: owner }), null)).status).toBe(503);
    expect((await warehousesHandler(call('POST', '/api/admin/inventory/warehouses', { cookie: owner, origin: 'https://evil.example.test', body: { code: 'WH-1', name: 'x' } }), deps)).status).toBe(403);
    expect((await erpHandler(call('DELETE', '/api/admin/inventory/erp', { cookie: owner }), deps)).status).toBe(405);
  });

  it('without keys the store follows the default mode on the practice ERP; the mode switch and "no ERP" work', async () => {
    const erp = await read(await erpHandler(call('GET', '/api/admin/inventory/erp', { cookie: owner }), deps));
    expect(erp.status).toBe(200);
    expect(erp.body.setup).toMatchObject({ mode: 'EXTAS_ERP', modeSource: 'default' });
    expect(erp.body.connection).toMatchObject({ state: 'mock', adapterMode: 'MOCK', stockEnabled: false });
    const check = await read(await erpVerifyHandler(call('POST', '/api/admin/inventory/erp/verify', { cookie: owner }), deps));
    expect(check.body.check).toMatchObject({ practice: true, learned: false });
    expect((await t.prisma.store.findUniqueOrThrow({ where: { id: 1 } })).erpCompanyId).toBeNull();
    const wh = await read(await erpWarehousesHandler(call('GET', '/api/admin/inventory/erp/warehouses', { cookie: owner }), deps));
    expect(wh.body.practice).toBe(true);

    const none = await read(await erpHandler(call('PUT', '/api/admin/inventory/erp', { cookie: owner, body: { mode: 'NONE' } }), deps));
    expect([none.status, none.body.setup.mode, none.body.connection.state]).toEqual([200, 'NONE', 'none']);
    const refused = await read(await erpVerifyHandler(call('POST', '/api/admin/inventory/erp/verify', { cookie: owner }), deps));
    expect([refused.status, refused.body.error]).toEqual([409, 'ERP_NOT_CONNECTED']);
    const bad = await read(await erpHandler(call('PUT', '/api/admin/inventory/erp', { cookie: owner, body: { mode: 'SOMETHING' } }), deps));
    expect([bad.status, bad.body.error]).toEqual([400, 'INVALID_INPUT']);
    const back = await read(await erpHandler(call('PUT', '/api/admin/inventory/erp', { cookie: owner, body: { mode: 'EXTAS_ERP', erpWarehouseId: 'SAMPLE-WH-1' } }), deps));
    expect(back.body.setup).toMatchObject({ mode: 'EXTAS_ERP', modeSource: 'store', erpWarehouseId: 'SAMPLE-WH-1' });
  });

  it('a warehouse comes with its default locations; the last damaged bin stays; the stock view answers', async () => {
    const created = await read(await warehousesHandler(call('POST', '/api/admin/inventory/warehouses', { cookie: owner, body: { code: 'WH-MAIN', name: 'Sample warehouse', erpWarehouseId: 'SAMPLE-WH-1' } }), deps));
    expect(created.status).toBe(201);
    const w = created.body.created;
    expect(w.locations.map((l: { code: string; kind: string }) => [l.code, l.kind])).toEqual([
      ['damaged', 'DAMAGED'],
      ['main', 'WAREHOUSE'],
    ]);
    const taken = await read(await warehousesHandler(call('POST', '/api/admin/inventory/warehouses', { cookie: owner, body: { code: 'WH-MAIN', name: 'again' } }), deps));
    expect([taken.status, taken.body.error]).toEqual([409, 'CODE_TAKEN']);
    const loc = await read(await warehouseLocationsHandler(call('POST', `/api/admin/inventory/warehouses/${w.id}/locations`, { cookie: owner, body: { code: 'rack-a', kind: 'WAREHOUSE', name: 'Rack A' } }), deps, w.id));
    expect(loc.status).toBe(201);
    const damaged = w.locations.find((l: { kind: string }) => l.kind === 'DAMAGED');
    const keep = await read(await locationHandler(call('PATCH', `/api/admin/inventory/locations/${damaged.id}`, { cookie: owner, body: { archived: true } }), deps, damaged.id));
    expect([keep.status, keep.body.error]).toEqual([409, 'DAMAGED_BIN_REQUIRED']);
    const renamed = await read(await warehouseHandler(call('PATCH', `/api/admin/inventory/warehouses/${w.id}`, { cookie: owner, body: { name: 'Sample main warehouse' } }), deps, w.id));
    expect(renamed.body.item.name).toBe('Sample main warehouse');
    expect((await warehouseHandler(call('GET', '/api/admin/inventory/warehouses/x', { cookie: owner }), deps, 'x')).status).toBe(400);
    const list = await read(await warehousesHandler(call('GET', '/api/admin/inventory/warehouses', { cookie: owner }), deps));
    expect(list.body.warehouses).toHaveLength(1);

    expect((await stockHandler(call('GET', '/api/admin/inventory/stock', { cookie: owner }), deps)).status).toBe(400);
    const unknown = await read(await stockHandler(call('GET', '/api/admin/inventory/stock?sku=NOT-A-SKU', { cookie: owner }), deps));
    expect([unknown.status, unknown.body.error]).toEqual([404, 'NOT_FOUND']);
    const logged = await t.prisma.auditLog.findMany({ where: { action: { in: ['erp.mode', 'warehouse.create', 'location.create'] } }, select: { action: true } });
    expect(new Set(logged.map((l) => l.action))).toEqual(new Set(['erp.mode', 'warehouse.create', 'location.create']));
  });

  it('the stock page: health on the practice ERP, re-sync waits for real keys, documents, low stock, counts, movements', async () => {
    const h = await read(await healthHandler(call('GET', '/api/admin/inventory/health', { cookie: owner }), deps));
    expect(h.status).toBe(200);
    expect(h.body.health).toMatchObject({ level: 'practice', link: { state: 'mock' }, pushes: { pending: 0, dead: 0 }, holds: { active: { holds: 0 } } });
    expect((await healthHandler(call('POST', '/api/admin/inventory/health', { cookie: owner }), deps)).status).toBe(405);

    const all = await read(await resyncHandler(call('POST', '/api/admin/inventory/resync', { cookie: owner, body: {} }), deps));
    expect([all.status, all.body.stock.status, all.body.stock.reason]).toEqual([200, 'skipped', 'ERP_ON_PRACTICE']);
    const one = await read(await resyncHandler(call('POST', '/api/admin/inventory/resync', { cookie: owner, body: { sku: 'NOT-A-SKU' } }), deps));
    expect([one.status, one.body.error]).toEqual([404, 'NOT_FOUND']);
    const both = await read(await resyncHandler(call('POST', '/api/admin/inventory/resync', { cookie: owner, body: { sku: 'X', productId: 'y' } }), deps));
    expect([both.status, both.body.error]).toEqual([400, 'INVALID_INPUT']);

    const pushes = await read(await pushesHandler(call('GET', '/api/admin/inventory/pushes?status=FAILED,DEAD', { cookie: owner }), deps));
    expect([pushes.status, pushes.body.items]).toEqual([200, []]);
    expect((await pushesHandler(call('GET', '/api/admin/inventory/pushes?status=LOST', { cookie: owner }), deps)).status).toBe(400);
    const retry = await read(await pushesRetryHandler(call('POST', '/api/admin/inventory/pushes/retry', { cookie: owner, body: { all: true } }), deps));
    expect([retry.status, retry.body.queued]).toEqual([200, 0]);
    const low = await read(await lowStockHandler(call('GET', '/api/admin/inventory/low-stock', { cookie: owner }), deps));
    expect([low.status, low.body.total]).toEqual([200, 0]);
    const queue = await read(await publishQueueHandler(call('GET', '/api/admin/inventory/publish-queue', { cookie: owner }), deps));
    expect(queue.status).toBe(200);
    const styles = await read(await erpStylesHandler(call('GET', '/api/admin/inventory/erp/styles', { cookie: owner }), deps));
    expect([styles.status, styles.body.styles.state]).toEqual([200, 'practice']);

    const w = (await read(await warehousesHandler(call('GET', '/api/admin/inventory/warehouses', { cookie: owner }), deps))).body.warehouses[0];
    const main = w.locations.find((l: { code: string }) => l.code === 'main');
    const started = await read(await auditsHandler(call('POST', '/api/admin/inventory/audits', { cookie: owner, body: { locationId: main.id } }), deps));
    expect(started.status).toBe(201);
    const id = started.body.audit.id as string;
    const again = await read(await auditsHandler(call('POST', '/api/admin/inventory/audits', { cookie: owner, body: { locationId: main.id } }), deps));
    expect([again.status, again.body.error]).toEqual([409, 'AUDIT_OPEN']);
    const scan = await read(await auditHandler(call('POST', `/api/admin/inventory/audits/${id}`, { cookie: owner, body: { action: 'scan', code: 'SAMPLE-UNKNOWN', quantity: 2 } }), deps, id));
    expect([scan.status, scan.body.known, scan.body.counted]).toEqual([200, false, 2]);
    expect((await auditHandler(call('POST', `/api/admin/inventory/audits/${id}`, { cookie: owner, body: { action: 'delete' } }), deps, id)).status).toBe(400);
    const reviewed = await read(await auditHandler(call('POST', `/api/admin/inventory/audits/${id}`, { cookie: owner, body: { action: 'review' } }), deps, id));
    expect(reviewed.body.audit.status).toBe('REVIEW');
    const needs = await read(await auditHandler(call('POST', `/api/admin/inventory/audits/${id}`, { cookie: owner, body: { action: 'complete' } }), deps, id));
    expect([needs.status, needs.body.error]).toEqual([409, 'REASON_REQUIRED']);
    const lineId = reviewed.body.audit.lines[0].id as string;
    const reasoned = await read(await auditLineHandler(call('PATCH', `/api/admin/inventory/audit-lines/${lineId}`, { cookie: owner, body: { reason: 'wrong-label' } }), deps, lineId));
    expect(reasoned.body.audit.totals.withoutReason).toBe(0);
    const done = await read(await auditHandler(call('POST', `/api/admin/inventory/audits/${id}`, { cookie: owner, body: { action: 'complete' } }), deps, id));
    expect(done.body.audit.status).toBe('COMPLETED');
    const list = await read(await auditsHandler(call('GET', '/api/admin/inventory/audits', { cookie: owner }), deps));
    expect(list.body.audits.map((a: { id: string }) => a.id)).toEqual([id]);
    expect((await auditLineHandler(call('PATCH', '/api/admin/inventory/audit-lines/x', { cookie: owner, body: { reason: null } }), deps, 'x')).status).toBe(400);

    const range = 'from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z';
    const report = await read(await movementsHandler(call('GET', `/api/admin/inventory/movements?${range}`, { cookie: owner }), deps));
    expect([report.status, report.body.report.totals.movements]).toEqual([200, 0]);
    expect((await movementsHandler(call('GET', '/api/admin/inventory/movements', { cookie: owner }), deps)).status).toBe(400);
    const check = await read(await reconcileHandler(call('POST', '/api/admin/inventory/reconcile', { cookie: owner }), deps));
    expect([check.status, check.body.reconcile.status, check.body.reconcile.reason]).toEqual([200, 'skipped', 'ERP_ON_PRACTICE']);
    const logged = await t.prisma.auditLog.count({ where: { action: { in: ['erp.resync', 'erp.push.retry', 'stock.audit.start', 'stock.audit.complete'] } } });
    expect(logged).toBeGreaterThanOrEqual(3);
  });

  it('PR 609: import by style code previews on the practice ERP but never saves; the buying-price list and "seen" answer', async () => {
    const styles = await read(await erpStylesHandler(call('GET', '/api/admin/inventory/erp/styles', { cookie: owner }), deps));
    const code = (styles.body.styles.styles[0]?.styleCode as string | undefined) ?? 'SAMPLE-NONE';
    const p = await read(await erpStyleHandler(call('GET', `/api/admin/inventory/erp/style?styleCode=${encodeURIComponent(code)}`, { cookie: owner }), deps));
    expect([p.status, p.body.preview.state, p.body.preview.blocking]).toEqual([200, 'practice', expect.arrayContaining(['ERP_ON_PRACTICE'])]);
    const imp = await read(await erpStyleHandler(call('POST', '/api/admin/inventory/erp/style', { cookie: owner, body: { styleCode: code } }), deps));
    expect([imp.status, imp.body.error]).toEqual([409, 'ERP_ON_PRACTICE']);
    expect(await t.prisma.product.count({ where: { erpStyleCode: code } })).toBe(0);
    const empty = await read(await erpStyleHandler(call('GET', '/api/admin/inventory/erp/style', { cookie: owner }), deps));
    expect([empty.status, empty.body.error]).toEqual([400, 'INVALID_INPUT']);
    expect((await erpStyleHandler(call('PATCH', '/api/admin/inventory/erp/style', { cookie: owner, body: {} }), deps)).status).toBe(405);

    const changes = await read(await shopPricesHandler(call('GET', '/api/admin/inventory/shop-prices', { cookie: owner }), deps));
    expect([changes.status, changes.body.changes]).toEqual([200, { total: 0, items: [] }]);
    const seen = await read(await shopPricesSeenHandler(call('POST', '/api/admin/inventory/shop-prices/seen', { cookie: owner, body: { all: true } }), deps));
    expect([seen.status, seen.body.seen]).toEqual([200, 0]);
    const bad = await read(await shopPricesSeenHandler(call('POST', '/api/admin/inventory/shop-prices/seen', { cookie: owner, body: {} }), deps));
    expect([bad.status, bad.body.error]).toEqual([400, 'INVALID_INPUT']);
  });
});
