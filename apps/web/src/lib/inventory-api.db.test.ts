// S09 · PR 497, 499, 196, 201, 195 — the inventory admin API end to end on a real PostgreSQL (a throwaway database;
// skipped without TEST_DATABASE_ADMIN_URL): login and same-site checks, the ERP panel on the practice ERP (no vault, no
// key: nothing real is touched), the mode switch, warehouses with the damaged bin, and the stock view.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { erpHandler, erpVerifyHandler, erpWarehousesHandler, locationHandler, stockHandler, warehouseHandler, warehouseLocationsHandler, warehousesHandler } from './inventory-api';

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
});
