// S09 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// stock locations and the damaged bin (PR 201), the ERP mode switch (PR 497), the ERP-absent guard in every state
// (PR 499), the stock pull per SKU / colour / size on the practice ERP, through the LIVE path and through a second ERP
// adapter (PR 195, 498), retries, backoff and the error surface (PR 194), and the company / warehouse mapping (PR 196).
// Keys are made up inside the test; no network is used (the LIVE client's fetch is the practice ERP).
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { allAdapters, createConnections, defineAdapter, mockErp, type ErpApi, type ErpStockRow } from '@extas/adapters';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, createVariant, updateVariant, type CatalogueDeps } from '@extas/catalogue';
import { registry, type Key, type Value } from '@extas/settings';
import {
  createLocation,
  createWarehouse,
  ensureDefaultLocations,
  ERP_DEPENDENT_PATHS,
  erpSyncStatus,
  erpWarehouses,
  getErpSetup,
  listWarehouses,
  liveStock,
  pullStock,
  pushDisposition,
  resolveErp,
  runInventoryJob,
  setErpMapping,
  setErpMode,
  stockGrid,
  stockPollPlan,
  updateLocation,
  updateWarehouse,
  variantStock,
  verifyErpCompany,
  type InventoryDeps,
  type SettingsReader,
  type Who,
} from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const T0 = new Date('2026-10-20T06:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const BASE = 'https://erp.example.test';

/** A second ERP, written from scratch against the generic contract (no HTTP): the inventory code needs nothing else. */
const otherRows: ErpStockRow[] = [];
const otherApi: ErpApi = {
  provider: 'otherErp',
  async health() {
    return { companyId: 'OTHER-CO', companyName: 'Other sample ERP company', integrationName: 'Other sample shop', warehouseId: 'OTHER-WH' };
  },
  async variants() {
    return { items: [], nextCursor: null, rejected: [] };
  },
  async stock() {
    return { items: otherRows, nextCursor: null, rejected: [] };
  },
  async stockForSku(sku) {
    return otherRows.filter((r) => r.sku === sku);
  },
  async push(doc) {
    return { erpId: `OTHER-${doc.type}`, status: 201, body: null, replayed: false };
  },
};
const otherErp = defineAdapter<ErpApi, Record<string, never>>({
  kind: 'ERP',
  provider: 'otherErp',
  modes: ['LIVE'],
  secrets: [],
  configSchema: z.object({}) as unknown as z.ZodType<Record<string, never>>,
  create: async () => otherApi,
  mock: async () => otherApi,
  test: async () => ({ ok: true, message: 'other ERP answered' }),
});

describe.skipIf(!HAS_TEST_DB)('inventory and ERP sync on PostgreSQL (S09)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const clock = at(0);
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const vaultValues = new Map<string, string>();
  const sleeps: number[] = [];
  let connections: ReturnType<typeof createConnections>;
  const deps = (): InventoryDeps => ({
    db: t.prisma,
    settings,
    connections,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  });
  const catDeps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const sys = (storeId = A): Who => ({ actor: SYSTEM, storeId });
  let viewer: Actor;
  let storeKeeper: Actor;
  let keeper: Actor;
  let erpAdmin: Actor;
  const v: Record<string, string> = {};
  let productId = '';
  let whA = '';
  let whShow = '';
  const world = mockErp();
  const realFetch = globalThis.fetch;

  const levelOf = async (sku: string, warehouseCode: string, locCode = 'main') => {
    const l = await t.prisma.stockLevel.findFirst({ where: { variant: { sku, storeId: A }, location: { code: locCode, warehouse: { code: warehouseCode } } } });
    return l ? { onHand: l.onHand, reserved: l.reserved, available: l.available } : null;
  };
  const inStock = async (sku: string) => (await t.prisma.productVariant.findFirstOrThrow({ where: { sku, storeId: A } })).inStock;

  beforeAll(async () => {
    t = await createTestDatabase('inventory');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string) => vaultValues.get(name) ?? null }, adapters: [...allAdapters, otherErp], secretCacheMs: 0, testTimeoutMs: 5_000 });
    const staff = async (email: string, perms: ('inventory.read' | 'inventory.locations' | 'inventory.erp')[], storeId: number | null) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId } });
      return { staffUserId: u.id };
    };
    viewer = await staff('viewer@example.com', ['inventory.read'], A);
    storeKeeper = await staff('storekeeper@example.com', ['inventory.read', 'inventory.locations'], A);
    keeper = await staff('keeper@example.com', ['inventory.read', 'inventory.locations'], null);
    erpAdmin = await staff('erp@example.com', ['inventory.read', 'inventory.erp'], A);

    // A sample product in store A: navy and black in M and L, plus a retired navy XL.
    const navy = (await createColour(catDeps(), sys(), { nameEn: 'Navy', hex: '1b2a4a' })).colour;
    const black = (await createColour(catDeps(), sys(), { nameEn: 'Black', hex: '111111' })).colour;
    const m = await createSize(catDeps(), sys(), { label: 'M' });
    const l = await createSize(catDeps(), sys(), { label: 'L' });
    const xl = await createSize(catDeps(), sys(), { label: 'XL' });
    const p = await createProduct(catDeps(), sys(), { nameEn: 'Sample Polo', erpStyleCode: 'POLO' });
    productId = p.id;
    for (const [c, cn] of [[navy, 'NAVY'], [black, 'BLACK']] as const) {
      for (const [s, sn] of [[m, 'M'], [l, 'L']] as const) {
        v[`${cn}-${sn}`] = (await createVariant(catDeps(), sys(), { sku: `POLO-${cn}-${sn}`, productId, colourId: c.id, sizeId: s.id })).id;
      }
    }
    v['NAVY-XL'] = (await createVariant(catDeps(), sys(), { sku: 'POLO-NAVY-XL', productId, colourId: navy.id, sizeId: xl.id })).id;
    await updateVariant(catDeps(), sys(), v['NAVY-XL'], { archived: true });
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await t?.drop();
  });
  beforeEach(() => {
    sleeps.length = 0;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // ---- PR 201 · locations and the damaged bin ----------------------------------------------------------------------

  it('PR 201: a warehouse comes with its main stock and a damaged bin; only an all-store keeper may make one', async () => {
    expect(await code(createWarehouse(deps(), { actor: viewer, storeId: A }, { code: 'WH-A', name: 'Sample warehouse A' }))).toBe('FORBIDDEN');
    // A role in one store only cannot change the pool every store shares.
    expect(await code(createWarehouse(deps(), { actor: storeKeeper, storeId: A }, { code: 'WH-A', name: 'Sample warehouse A' }))).toBe('FORBIDDEN');
    const w = await createWarehouse(deps(), { actor: keeper, storeId: A }, { code: 'WH-A', name: 'Sample warehouse A', erpWarehouseId: 'SAMPLE-WH-1' });
    whA = w.id;
    expect(w.locations.map((l) => [l.code, l.kind, l.sellable, l.receivesErpStock])).toEqual([
      ['damaged', 'DAMAGED', false, false],
      ['main', 'WAREHOUSE', true, true],
    ]);
    expect(await code(createWarehouse(deps(), { actor: keeper, storeId: A }, { code: 'WH-A', name: 'again' }))).toBe('CODE_TAKEN');
    expect(await code(createWarehouse(deps(), { actor: keeper, storeId: A }, { code: 'WH-X', name: 'x', erpWarehouseId: 'SAMPLE-WH-1' }))).toBe('ERP_WAREHOUSE_TAKEN');
    expect(await code(createWarehouse(deps(), { actor: keeper, storeId: A }, { code: 'bad code', name: 'x' }))).toBe('INVALID_INPUT');
    const show = await createWarehouse(deps(), { actor: keeper, storeId: A }, { code: 'WH-SHOW', name: 'Sample showroom' });
    whShow = show.id;
    expect((await listWarehouses(deps(), { actor: viewer, storeId: A })).map((x) => x.code)).toEqual(['WH-A', 'WH-SHOW']);
    const logged = await t.prisma.auditLog.findMany({ where: { action: 'warehouse.create' } });
    expect(logged).toHaveLength(2);
    expect(logged[0]!.storeId).toBeNull();
  });

  it('PR 201: the last damaged bin stays; a location with stock keeps its kind and is not archived', async () => {
    const w = (await listWarehouses(deps(), sys())).find((x) => x.id === whA)!;
    const damaged = w.locations.find((l) => l.kind === 'DAMAGED')!;
    expect(await code(updateLocation(deps(), { actor: keeper, storeId: A }, damaged.id, { archived: true }))).toBe('DAMAGED_BIN_REQUIRED');
    expect(await code(updateLocation(deps(), { actor: keeper, storeId: A }, damaged.id, { kind: 'WAREHOUSE' }))).toBe('DAMAGED_BIN_REQUIRED');
    expect(await code(createLocation(deps(), { actor: keeper, storeId: A }, whA, { code: 'main', name: 'twice', kind: 'WAREHOUSE' }))).toBe('CODE_TAKEN');
    const two = await createLocation(deps(), { actor: keeper, storeId: A }, whA, { code: 'damaged-2', name: 'Second damaged bin', kind: 'DAMAGED' });
    const second = two.locations.find((l) => l.code === 'damaged-2')!;
    // With a second bin the first may go, and come back.
    expect(await code(updateLocation(deps(), { actor: keeper, storeId: A }, damaged.id, { archived: true }))).toBe('ok');
    expect(await code(updateLocation(deps(), { actor: keeper, storeId: A }, second.id, { archived: true }))).toBe('DAMAGED_BIN_REQUIRED');
    expect(await code(updateLocation(deps(), { actor: keeper, storeId: A }, damaged.id, { archived: false }))).toBe('ok');
    // Stock in a location: no archive, no change of kind; the warehouse cannot be archived either.
    await t.prisma.stockLevel.create({ data: { variantId: v['NAVY-M']!, locationId: second.id, onHand: 1, available: 0 } });
    expect(await code(updateLocation(deps(), { actor: keeper, storeId: A }, second.id, { kind: 'SHOWROOM' }))).toBe('LOCATION_HAS_STOCK');
    expect(await code(updateLocation(deps(), { actor: keeper, storeId: A }, damaged.id, { archived: true }))).toBe('ok');
    expect(await code(updateWarehouse(deps(), { actor: keeper, storeId: A }, whA, { archived: true }))).toBe('LOCATION_HAS_STOCK');
    // An empty warehouse can be archived; nothing can be added to it until it is back.
    const tmp = await createWarehouse(deps(), { actor: keeper, storeId: A }, { code: 'WH-TMP', name: 'Temporary' });
    expect(await code(updateWarehouse(deps(), { actor: keeper, storeId: A }, tmp.id, { archived: true }))).toBe('ok');
    expect(await code(createLocation(deps(), { actor: keeper, storeId: A }, tmp.id, { code: 'extra', name: 'x', kind: 'SHOWROOM' }))).toBe('PARENT_ARCHIVED');
    expect((await listWarehouses(deps(), sys())).map((x) => x.code)).not.toContain('WH-TMP');
    expect((await listWarehouses(deps(), sys(), { includeArchived: true })).map((x) => x.code)).toContain('WH-TMP');
    // The pretend damaged stock shows on its own and never counts as sellable.
    const s = await variantStock(deps(), { actor: viewer, storeId: A }, { sku: 'POLO-NAVY-M' });
    expect([s.sellable, s.damaged]).toEqual([0, 1]);
  });

  it('PR 201: warehouses made before (the sample seed) get their default locations and a damaged bin, once', async () => {
    const old = await t.prisma.warehouse.create({ data: { code: 'OLD-WH', name: 'Sample warehouse from the seed', locations: { create: { code: 'shelf', name: 'Shelf', kind: 'WAREHOUSE' } } } });
    const first = await runInventoryJob(deps(), { name: 'inventory.locations.ensureDefaults' });
    expect(first).toEqual({ created: 2, restored: 0 });
    expect((await t.prisma.inventoryLocation.findMany({ where: { warehouseId: old.id }, orderBy: { code: 'asc' } })).map((l) => l.code)).toEqual(['damaged', 'main', 'shelf']);
    expect(await ensureDefaultLocations(deps())).toEqual({ created: 0, restored: 0 });
    await updateWarehouse(deps(), sys(), old.id, { archived: true });
  });

  // ---- PR 497 · the mode switch -----------------------------------------------------------------------------------

  it('PR 497: a store follows erp.defaultMode until it chooses; switching is checked, audited and loses nothing', async () => {
    expect(await getErpSetup(deps(), { actor: viewer, storeId: A })).toMatchObject({ mode: 'EXTAS_ERP', modeSource: 'default', erpCompanyId: null });
    expect(await code(setErpMode(deps(), { actor: viewer, storeId: A }, { mode: 'NONE' }))).toBe('FORBIDDEN');
    expect(await code(setErpMode(deps(), { actor: erpAdmin, storeId: B }, { mode: 'NONE' }))).toBe('FORBIDDEN');
    expect(await code(setErpMode(deps(), { actor: erpAdmin, storeId: A }, { mode: 'OTHER_ERP' }))).toBe('INVALID_INPUT');
    expect(await code(setErpMode(deps(), { actor: erpAdmin, storeId: A }, { mode: 'SAP' as never }))).toBe('INVALID_INPUT');
    const ours = await t.prisma.integration.create({ data: { storeId: null, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'MOCK', enabled: false } });
    expect(await code(setErpMode(deps(), { actor: erpAdmin, storeId: A }, { mode: 'OTHER_ERP', integrationId: ours.id }))).toBe('INVALID_INPUT');
    expect(await code(setErpMode(deps(), { actor: erpAdmin, storeId: A }, { mode: 'NONE', integrationId: ours.id }))).toBe('INVALID_INPUT');

    await setErpMapping(deps(), { actor: erpAdmin, storeId: A }, { erpCompanyId: 'SAMPLE-CO-1', erpWarehouseId: 'SAMPLE-WH-1' });
    expect((await t.prisma.store.findUniqueOrThrow({ where: { id: A } })).erpCompanyId).toBe('SAMPLE-CO-1');
    const none = await setErpMode(deps(), { actor: erpAdmin, storeId: A }, { mode: 'NONE' });
    expect(none).toMatchObject({ mode: 'NONE', modeSource: 'store', erpCompanyId: 'SAMPLE-CO-1', erpWarehouseId: 'SAMPLE-WH-1' });
    const back = await setErpMode(deps(), { actor: erpAdmin, storeId: A }, { mode: 'EXTAS_ERP', integrationId: ours.id });
    expect(back).toMatchObject({ mode: 'EXTAS_ERP', integrationId: ours.id, erpCompanyId: 'SAMPLE-CO-1', erpWarehouseId: 'SAMPLE-WH-1' });
    const modes = await t.prisma.auditLog.findMany({ where: { action: 'erp.mode', storeId: A }, orderBy: { createdAt: 'asc' } });
    expect(modes.map((r) => (r.after as { mode: string }).mode)).toEqual(['NONE', 'EXTAS_ERP']);
    // Clear the company again: the LIVE test below learns it from the key.
    await setErpMapping(deps(), sys(), { erpCompanyId: null, erpWarehouseId: null });
    await setErpMode(deps(), sys(), { mode: 'NONE' });
  });

  // ---- PR 499 · the ERP-absent guard, every path in every state ----------------------------------------------------

  it('PR 499: the behaviour table covers every state of every ERP-dependent path', () => {
    for (const [path, row] of Object.entries(ERP_DEPENDENT_PATHS)) expect(Object.keys(row).sort(), path).toEqual(['connected', 'mock', 'none', 'unavailable']);
  });

  it('PR 499 · no ERP: nothing is asked of any ERP and the shop keeps working from its own stock', async () => {
    const before = await t.prisma.stockLevel.count();
    const calls = world.calls.length;
    expect((await resolveErp(deps(), A)).state).toBe('none');
    expect(await pullStock(deps(), { storeId: A })).toMatchObject({ status: 'skipped', reason: 'ERP_NONE', runId: null });
    expect(await liveStock(deps(), A, 'POLO-NAVY-M')).toMatchObject({ source: 'mirror', reason: 'ERP_NONE' });
    expect(await pushDisposition(deps(), A)).toEqual({ disposition: 'skip', pushStatus: 'SKIPPED_NO_ERP', link: 'none' });
    expect(await code(verifyErpCompany(deps(), { actor: erpAdmin, storeId: A }))).toBe('ERP_NOT_CONNECTED');
    expect(await erpWarehouses(deps(), { actor: viewer, storeId: A })).toEqual({ practice: false, warehouses: [] });
    expect((await stockPollPlan(deps())).jobs.map((j) => 'storeId' in j && j.storeId)).not.toContain(A);
    expect(await t.prisma.erpSyncRun.count({ where: { storeId: A } })).toBe(0);
    expect(await t.prisma.stockLevel.count()).toBe(before);
    expect(world.calls.length).toBe(calls);
  });

  it('PR 499 · ERP chosen, no key yet: the practice ERP answers, but its stock never reaches the shop', async () => {
    world.reset();
    world.setStock('POLO-NAVY-M', 'SAMPLE-WH-1', { onHand: 99, updatedAt: at(1) });
    await setErpMode(deps(), sys(), { mode: 'EXTAS_ERP' });
    const link = await resolveErp(deps(), A);
    expect([link.state, 'adapterMode' in link && link.adapterMode]).toEqual(['mock', 'MOCK']);
    expect(await pullStock(deps(), { storeId: A })).toMatchObject({ status: 'skipped', reason: 'ERP_ON_PRACTICE' });
    expect(await liveStock(deps(), A, 'POLO-NAVY-M')).toMatchObject({ source: 'mirror', reason: 'ERP_ON_PRACTICE' });
    expect((await pushDisposition(deps(), A)).disposition).toBe('hold');
    const check = await verifyErpCompany(deps(), { actor: erpAdmin, storeId: A });
    expect(check).toMatchObject({ practice: true, learned: false, erp: { companyId: 'SAMPLE-CO-1' } });
    expect((await t.prisma.store.findUniqueOrThrow({ where: { id: A } })).erpCompanyId).toBeNull();
    const wh = await erpWarehouses(deps(), { actor: viewer, storeId: A });
    expect(wh.practice).toBe(true);
    expect(wh.warehouses.map((w) => [w.erpWarehouseId, w.integrationWarehouse, w.linkedTo?.code ?? null])).toEqual([['SAMPLE-WH-1', true, 'WH-A']]);
    expect(await levelOf('POLO-NAVY-M', 'WH-A')).toBeNull();
  });

  it('PR 499 · ERP chosen but not usable (no adapter for it): runs fail visibly, the checkout uses the shop copy, documents wait', async () => {
    const ghost = await t.prisma.integration.create({ data: { storeId: B, kind: 'ERP', provider: 'ghostErp', name: 'ghost', mode: 'LIVE', enabled: true } });
    await setErpMode(deps(), sys(B), { mode: 'OTHER_ERP', integrationId: ghost.id });
    const link = await resolveErp(deps(), B);
    expect(link).toMatchObject({ state: 'unavailable', code: 'ADAPTER_MISSING' });
    const r = await pullStock(deps(), { storeId: B });
    expect(r).toMatchObject({ status: 'failed', error: { code: 'ERP_UNAVAILABLE' } });
    const run = await t.prisma.erpSyncRun.findUniqueOrThrow({ where: { id: r.runId! } });
    expect([run.status, run.kind]).toEqual(['FAILED', 'stock.pull']);
    expect(run.error).toContain('ADAPTER_MISSING');
    expect((await t.prisma.erpSyncState.findUniqueOrThrow({ where: { storeId_resource: { storeId: B, resource: 'stock' } } })).lastError).toContain('ADAPTER_MISSING');
    expect((await pushDisposition(deps(), B)).disposition).toBe('hold');
    expect(await code(verifyErpCompany(deps(), sys(B)))).toBe('ERP_UNAVAILABLE');
    expect(await code(erpWarehouses(deps(), sys(B)))).toBe('ERP_UNAVAILABLE');
  });

  // ---- PR 195 · the stock pull on the practice ERP ----------------------------------------------------------------

  it('PR 195: stock per SKU lands per variant and location, with movements, inStock and the product summary', async () => {
    overrides.set('erp.mock.stockEnabled', true);
    overrides.set('erp.sync.pageSize', 2);
    world.reset();
    world.setStock('POLO-NAVY-M', 'SAMPLE-WH-1', { onHand: 5, reserved: 1, updatedAt: at(1) });
    world.setStock('POLO-NAVY-L', 'SAMPLE-WH-1', { onHand: 0, updatedAt: at(2) });
    world.setStock('POLO-BLACK-M', 'SAMPLE-WH-1', { onHand: 3, updatedAt: at(3) });
    world.setStock('POLO-BLACK-M', 'SAMPLE-WH-2', { onHand: 2, updatedAt: at(4) });
    world.setStock('NEW-STYLE-M', 'SAMPLE-WH-1', { onHand: 4, updatedAt: at(5) });
    world.setStock('POLO-NAVY-XL', 'SAMPLE-WH-1', { onHand: 2, updatedAt: at(6) });

    const r = await pullStock(deps(), { storeId: A });
    expect(r).toMatchObject({ status: 'succeeded', adapterMode: 'MOCK', pages: 3, rows: 6, applied: 3, unknownSku: 1, retiredSku: 1, unmappedWarehouse: 1, movements: 2, complete: true });
    expect(await levelOf('POLO-NAVY-M', 'WH-A')).toEqual({ onHand: 5, reserved: 1, available: 4 });
    expect(await levelOf('POLO-NAVY-L', 'WH-A')).toEqual({ onHand: 0, reserved: 0, available: 0 });
    expect(await levelOf('POLO-BLACK-M', 'WH-A')).toEqual({ onHand: 3, reserved: 0, available: 3 });
    expect([await inStock('POLO-NAVY-M'), await inStock('POLO-NAVY-L'), await inStock('POLO-BLACK-M'), await inStock('POLO-BLACK-L')]).toEqual([true, false, true, false]);
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: productId } })).inStock).toBe(true);
    const run = await t.prisma.erpSyncRun.findUniqueOrThrow({ where: { id: r.runId! } });
    expect([run.status, run.itemsOk, run.itemsFailed, run.error]).toEqual(['SUCCEEDED', 4, 2, 'UNKNOWN_SKU ×1 · UNMAPPED_WAREHOUSE ×1']);
    const state = await t.prisma.erpSyncState.findUniqueOrThrow({ where: { storeId_resource: { storeId: A, resource: 'stock' } } });
    expect([state.cursor, state.updatedSince?.toISOString(), state.lastError]).toEqual([null, at(6).toISOString(), null]);

    // Colour × size grid and one SKU in every location.
    const grid = await stockGrid(deps(), { actor: viewer, storeId: A }, productId);
    expect(grid.colours.map((c) => c.nameEn)).toEqual(['Navy', 'Black']);
    expect(grid.sizes.map((s) => s.label)).toEqual(['M', 'L']);
    expect(grid.cells.map((c) => [c.sku, c.sellable])).toEqual([['POLO-NAVY-M', 4], ['POLO-NAVY-L', 0], ['POLO-BLACK-M', 3], ['POLO-BLACK-L', 0]]);
    expect(grid.totals).toEqual({ sellable: 7, damaged: 1 });
  });

  it('PR 195/200: reading the same rows again never moves stock twice; a sale in the ERP moves it once', async () => {
    const moves = await t.prisma.stockMovement.count();
    expect(await pullStock(deps(), { storeId: A })).toMatchObject({ status: 'succeeded', applied: 0, movements: 0 });
    expect(await pullStock(deps(), { storeId: A, full: true })).toMatchObject({ status: 'succeeded', rows: 6, applied: 0, unchanged: 3, movements: 0 });
    expect(await t.prisma.stockMovement.count()).toBe(moves);

    world.now = () => at(10);
    world.adjustStock('POLO-NAVY-M', 'SAMPLE-WH-1', { onHand: -2 });
    const r = await pullStock(deps(), { storeId: A });
    expect(r).toMatchObject({ applied: 1, movements: 1 });
    // Incremental: only what changed since the last pull, minus the 2-minute overlap (at(4)…at(6) again, plus at(10)).
    expect(r.rows).toBe(4);
    const m = await t.prisma.stockMovement.findFirstOrThrow({ where: { variantId: v['NAVY-M'] }, orderBy: { createdAt: 'desc' } });
    expect([m.delta, m.reason, m.referenceType, m.referenceId, m.storeId]).toEqual([-2, 'erp.sync', 'ErpSyncRun', r.runId, null]);
    expect(await pullStock(deps(), { storeId: A, full: true })).toMatchObject({ movements: 0 });
    expect(await t.prisma.stockMovement.count()).toBe(moves + 1);
  });

  it('PR 195: a row older than the mirror never overwrites it', async () => {
    await t.prisma.stockLevel.updateMany({ where: { variantId: v['BLACK-M'], location: { warehouseId: whA, code: 'main' } }, data: { erpUpdatedAt: at(500), onHand: 7, available: 7 } });
    const r = await pullStock(deps(), { storeId: A, full: true });
    expect(r.stale).toBe(1);
    expect(await levelOf('POLO-BLACK-M', 'WH-A')).toEqual({ onHand: 7, reserved: 0, available: 7 });
    await t.prisma.stockLevel.updateMany({ where: { variantId: v['BLACK-M'], location: { warehouseId: whA, code: 'main' } }, data: { erpUpdatedAt: at(3), onHand: 3, available: 3 } });
  });

  it('PR 195/196/201: a linked showroom warehouse is mirrored but only sellable kinds count', async () => {
    const show = (await listWarehouses(deps(), sys())).find((w) => w.id === whShow)!;
    await updateLocation(deps(), { actor: keeper, storeId: A }, show.locations.find((l) => l.code === 'main')!.id, { kind: 'SHOWROOM' });
    await updateWarehouse(deps(), { actor: keeper, storeId: A }, whShow, { erpWarehouseId: 'SAMPLE-WH-2' });
    const r = await pullStock(deps(), { storeId: A, full: true });
    expect([r.unmappedWarehouse, r.applied]).toEqual([0, 1]);
    const s = await variantStock(deps(), { actor: viewer, storeId: A }, { sku: 'POLO-BLACK-M' });
    expect(s.locations.map((l) => [l.warehouseCode, l.code, l.kind, l.sellable, l.available])).toEqual([
      ['WH-A', 'main', 'WAREHOUSE', true, 3],
      ['WH-SHOW', 'main', 'SHOWROOM', false, 2],
    ]);
    expect(s.sellable).toBe(3);
    expect(s.colour?.nameEn).toBe('Black');
    expect(s.size?.label).toBe('M');
    overrides.set('inventory.sellableLocationKinds', ['WAREHOUSE', 'SHOWROOM']);
    expect((await variantStock(deps(), sys(), { variantId: v['BLACK-M'] })).sellable).toBe(5);
    overrides.delete('inventory.sellableLocationKinds');
  });

  // ---- PR 194 · retries, backoff and the error surface --------------------------------------------------------------

  it('PR 194: a busy ERP is tried again with growing pauses; Retry-After is honoured', async () => {
    overrides.set('erp.sync.backoffBaseMs', 100);
    overrides.set('erp.sync.backoffJitter', false);
    world.failNext({ path: '/stock', status: 503, times: 2 });
    expect(await pullStock(deps(), { storeId: A })).toMatchObject({ status: 'succeeded' });
    expect(sleeps).toEqual([100, 200]);
    sleeps.length = 0;
    world.failNext({ path: '/health', status: 429, retryAfterSeconds: 3 });
    expect(await pullStock(deps(), { storeId: A })).toMatchObject({ status: 'succeeded' });
    expect(sleeps).toEqual([3000]);
  });

  it('PR 194: after the last try the run fails, with the ERP code on the run and the state; nothing is half-written', async () => {
    const calls = world.calls.length;
    world.failNext({ path: '/stock', status: 503, times: 4 });
    const r = await pullStock(deps(), { storeId: A });
    expect(r).toMatchObject({ status: 'failed', error: { code: 'SERVER' } });
    expect(world.calls.slice(calls).filter((c) => c.path === '/stock')).toHaveLength(4);
    const run = await t.prisma.erpSyncRun.findUniqueOrThrow({ where: { id: r.runId! } });
    expect(run.status).toBe('FAILED');
    expect(run.error).toMatch(/^SERVER 503: practice failure 503 \(4 tries\)/);
    const status = await erpSyncStatus(deps(), { actor: viewer, storeId: A });
    expect(status.lastFailure?.error).toBe(run.error);
    expect(status.states[0]).toMatchObject({ resource: 'stock', lastError: run.error });
    expect(status.lastRuns.map((x) => [x.kind, x.status])).toEqual([['stock.pull', 'FAILED']]);
    world.failNext({ path: '/stock', status: 400 });
    sleeps.length = 0;
    expect(await pullStock(deps(), { storeId: A })).toMatchObject({ status: 'failed', error: { code: 'INVALID_REQUEST' } });
    expect(sleeps).toEqual([]);
    // The next good pull clears the error.
    expect(await pullStock(deps(), { storeId: A })).toMatchObject({ status: 'succeeded' });
    expect((await erpSyncStatus(deps(), sys())).states[0]!.lastError).toBeNull();
  });

  it('PR 194/195: a pull cut short (page cap or a failed page) carries on from where it stopped', async () => {
    overrides.set('erp.sync.maxPagesPerRun', 1);
    const first = await pullStock(deps(), { storeId: A, full: true });
    expect([first.status, first.complete, first.pages]).toEqual(['succeeded', false, 1]);
    const state = await t.prisma.erpSyncState.findUniqueOrThrow({ where: { storeId_resource: { storeId: A, resource: 'stock' } } });
    expect(state.cursor).toBeTruthy();
    overrides.delete('erp.sync.maxPagesPerRun');
    world.failNext({ path: '/stock', status: 500, times: 4, skip: 1 });
    const second = await pullStock(deps(), { storeId: A });
    expect([second.status, second.pages]).toEqual(['failed', 1]);
    const third = await pullStock(deps(), { storeId: A });
    expect([third.status, third.complete, third.pages]).toEqual(['succeeded', true, 1]);
    const after = await t.prisma.erpSyncState.findUniqueOrThrow({ where: { storeId_resource: { storeId: A, resource: 'stock' } } });
    expect(after.cursor).toBeNull();
    overrides.delete('erp.sync.backoffBaseMs');
    overrides.delete('erp.sync.backoffJitter');
  });

  // ---- PR 196 + LIVE path · the company comes from the key ---------------------------------------------------------

  it('PR 196: with a real (LIVE) connection the key decides the company: learned once, a mismatch stops the sync', async () => {
    overrides.delete('erp.mock.stockEnabled');
    const key = randomBytes(18).toString('base64url');
    vaultValues.set('extasErp.apiKey', key);
    world.acceptKey(key, 'SAMPLE-CO-1');
    globalThis.fetch = world.fetch as typeof fetch;
    await t.prisma.integration.create({ data: { storeId: A, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
    await setErpMode(deps(), sys(), { mode: 'EXTAS_ERP', integrationId: null });
    const link = await resolveErp(deps(), A);
    expect([link.state, 'adapterMode' in link && link.adapterMode]).toEqual(['connected', 'LIVE']);
    expect((await pushDisposition(deps(), A)).disposition).toBe('send');

    world.now = () => at(20);
    world.adjustStock('POLO-BLACK-L', 'SAMPLE-WH-1', { onHand: 6 });
    const r = await pullStock(deps(), { storeId: A });
    expect(r).toMatchObject({ status: 'succeeded', adapterMode: 'LIVE', applied: 1 });
    expect(await inStock('POLO-BLACK-L')).toBe(true);
    expect((await t.prisma.store.findUniqueOrThrow({ where: { id: A } })).erpCompanyId).toBe('SAMPLE-CO-1');
    expect(await t.prisma.auditLog.count({ where: { action: 'erp.company.learn', storeId: A } })).toBe(1);

    await setErpMapping(deps(), { actor: erpAdmin, storeId: A }, { erpCompanyId: 'SAMPLE-CO-2' });
    world.adjustStock('POLO-BLACK-L', 'SAMPLE-WH-1', { onHand: 1 });
    const moves = await t.prisma.stockMovement.count();
    const bad = await pullStock(deps(), { storeId: A });
    expect(bad).toMatchObject({ status: 'failed', error: { code: 'COMPANY_MISMATCH' }, applied: 0 });
    expect(await t.prisma.stockMovement.count()).toBe(moves);
    expect(await code(verifyErpCompany(deps(), { actor: erpAdmin, storeId: A }))).toBe('COMPANY_MISMATCH');

    await setErpMapping(deps(), { actor: erpAdmin, storeId: A }, { erpCompanyId: 'SAMPLE-CO-1', erpWarehouseId: 'SAMPLE-WH-1' });
    expect(await verifyErpCompany(deps(), { actor: erpAdmin, storeId: A })).toMatchObject({ practice: false, matches: true, learned: false });
    expect(await pullStock(deps(), { storeId: A })).toMatchObject({ status: 'succeeded', applied: 1 });
    // The store's ERP warehouse limits what is asked for.
    expect(world.calls.filter((c) => c.path === '/stock').at(-1)?.query.warehouseId).toBe('SAMPLE-WH-1');
    const wh = await erpWarehouses(deps(), { actor: viewer, storeId: A });
    expect(wh.practice).toBe(false);
    expect(wh.warehouses.map((w) => [w.erpWarehouseId, w.linkedTo?.code, w.storeWarehouse])).toEqual([['SAMPLE-WH-1', 'WH-A', true]]);

    // The Test button on this connection proves the key and names the company.
    const integ = await t.prisma.integration.findFirstOrThrow({ where: { storeId: A, provider: 'extasErp' } });
    expect(await connections.test(integ.id)).toMatchObject({ ok: true, message: 'Sample company one · Sample website (SAMPLE-CO-1)', mode: 'LIVE' });
  });

  it('PR 195/499: the checkout check asks the ERP once, quickly, and falls back to the shop copy', async () => {
    globalThis.fetch = world.fetch as typeof fetch;
    await t.prisma.stockLevel.updateMany({ where: { variantId: v['NAVY-M'], location: { warehouseId: whA, code: 'main' } }, data: { cartReserved: 1 } });
    const live = await liveStock(deps(), A, 'POLO-NAVY-M');
    expect(live).toEqual({ sku: 'POLO-NAVY-M', variantId: v['NAVY-M'], source: 'erp', reason: null, sellable: 1 });
    expect(await liveStock(deps(), A, 'POLO-NAVY-L')).toMatchObject({ source: 'erp', reason: null, sellable: 0 });
    // The ERP (the master) knows no stock row for the SKU: nothing of it can be sold, whatever the mirror says.
    world.failNext({ path: '/stock/', status: 404 });
    expect(await liveStock(deps(), A, 'POLO-NAVY-M')).toMatchObject({ source: 'erp', reason: 'NOT_FOUND', sellable: 0 });
    expect(await liveStock(deps(), A, 'NOT-IN-SHOP')).toMatchObject({ variantId: null, reason: 'UNKNOWN_SKU', sellable: 0 });
    overrides.set('erp.liveCheck.timeoutSeconds', 1);
    world.failNext({ path: '/stock/', delayMs: 3_000 });
    const calls = world.calls.length;
    expect(await liveStock(deps(), A, 'POLO-NAVY-M')).toMatchObject({ source: 'mirror', reason: 'TIMEOUT', sellable: 1 });
    world.failNext({ path: '/stock/', status: 503, times: 3 });
    expect(await liveStock(deps(), A, 'POLO-NAVY-M')).toMatchObject({ source: 'mirror', reason: 'SERVER' });
    // One try each, never retried while a customer waits.
    expect(world.calls.length - calls).toBe(1);
    overrides.delete('erp.liveCheck.timeoutSeconds');
  });

  it('PR 194: a refused key is never tried again', async () => {
    globalThis.fetch = world.fetch as typeof fetch;
    vaultValues.set('extasErp.apiKey', randomBytes(18).toString('base64url'));
    sleeps.length = 0;
    const r = await pullStock(deps(), { storeId: A });
    expect(r).toMatchObject({ status: 'failed', error: { code: 'AUTH' } });
    expect(sleeps).toEqual([]);
    expect(r.error?.text).not.toContain(vaultValues.get('extasErp.apiKey'));
  });

  // ---- PR 498 · a second ERP is a new adapter, not a rewrite --------------------------------------------------------

  it('PR 498: another ERP adapter feeds the same stock pull', async () => {
    const m = await createSize(catDeps(), sys(B), { label: 'M' });
    const red = (await createColour(catDeps(), sys(B), { nameEn: 'Red', hex: 'aa2222' })).colour;
    const p = await createProduct(catDeps(), sys(B), { nameEn: 'Second sample tee' });
    const tee = await createVariant(catDeps(), sys(B), { sku: 'TEE-RED-M', productId: p.id, colourId: red.id, sizeId: m.id });
    await createWarehouse(deps(), { actor: keeper, storeId: B }, { code: 'WH-B', name: 'Second sample warehouse', erpWarehouseId: 'OTHER-WH' });
    const integ = await t.prisma.integration.create({ data: { storeId: B, kind: 'ERP', provider: 'otherErp', name: 'other', mode: 'LIVE', enabled: true } });
    await setErpMode(deps(), sys(B), { mode: 'OTHER_ERP', integrationId: integ.id });
    otherRows.push({ sku: 'TEE-RED-M', warehouseId: 'OTHER-WH', onHand: 8, reserved: 2, available: 6, updatedAt: at(30) });
    const r = await pullStock(deps(), { storeId: B });
    expect(r).toMatchObject({ status: 'succeeded', adapterMode: 'LIVE', applied: 1, movements: 1 });
    expect((await variantStock(deps(), sys(B), { variantId: tee.id })).sellable).toBe(6);
    expect((await t.prisma.store.findUniqueOrThrow({ where: { id: B } })).erpCompanyId).toBe('OTHER-CO');
    expect(await liveStock(deps(), B, 'TEE-RED-M')).toMatchObject({ source: 'erp', sellable: 6 });
    // Store isolation: store A's variants were never touched by store B's ERP.
    expect(await t.prisma.stockLevel.count({ where: { variant: { storeId: A }, location: { warehouse: { code: 'WH-B' } } } })).toBe(0);
    const plan = await stockPollPlan(deps());
    expect(plan.everyMs).toBe(5 * 60_000);
    expect(plan.jobs).toEqual([{ name: 'inventory.erp.pullStock', storeId: A }, { name: 'inventory.erp.pullStock', storeId: B }]);
  });
});
