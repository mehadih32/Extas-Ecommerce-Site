// S09 · PR 497, 498, 499, 194, 195, 196, 201 — the inventory's admin API. The screens come with the stock pages
// (PR 202–206); they call these routes. Every route signs the person in (guardAdmin), checks the permission in the store
// it touches (`?storeId=`, default the mother store), then calls @extas/inventory, which checks the permission again
// and writes the audit log. Answers are `{ ok: true, … }` or `{ ok: false, error: CODE, details }`.
//
//   GET         /api/admin/inventory/erp                     the store's ERP mode, mapping and connection state, and the
//                                                            sync's error surface (PR 194: states, last runs, last failure)
//   PUT         /api/admin/inventory/erp                     {mode?, integrationId?, erpCompanyId?, erpWarehouseId?}
//                                                            the mode switch (PR 497) and the mapping (PR 196)
//   POST        /api/admin/inventory/erp/verify              "which company is this key?" (PR 196)
//   GET         /api/admin/inventory/erp/warehouses          the ERP warehouses to link to (PR 196)
//   GET/POST    /api/admin/inventory/warehouses              list (?includeArchived=1) · add (default locations made)
//   GET/PATCH   /api/admin/inventory/warehouses/:id          one warehouse · rename, link to an ERP warehouse, archive
//   POST        /api/admin/inventory/warehouses/:id/locations  add a location (PR 201)
//   PATCH       /api/admin/inventory/locations/:id           change or archive a location (the last damaged bin stays)
//   GET         /api/admin/inventory/stock                   one SKU (?sku= or ?variantId=) or a product's grid (?productId=)
//
// The ERP's address and keys are typed in on the Keys & connections page (PR 500) and live in the vault (PR 493); with
// none, the connection runs on the practice ERP, which never changes real stock (PR 499).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { allAdapters, createConnections } from '@extas/adapters';
import * as inv from '@extas/inventory';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

export type InventoryPerm = 'inventory.read' | 'inventory.locations' | 'inventory.erp';

interface Ctx {
  deps: inv.InventoryDeps;
  who: inv.Who;
  url: URL;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The inventory's dependencies for one request: the connection layer reads the vault (none = the practice ERP). */
export async function inventoryDeps(deps: AdminDeps): Promise<inv.InventoryDeps> {
  const [testSeconds, cacheSeconds] = await Promise.all([
    deps.resolver.value('system.integrationTestTimeoutSeconds'),
    deps.resolver.value('system.integrationKeyCacheSeconds'),
  ]);
  const vault = deps.vault ?? { get: async () => null };
  const connections = createConnections({ db: deps.db, vault, adapters: allAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
  return { db: deps.db, settings: deps.resolver, connections, now: deps.now };
}

export async function handle(request: Request, deps: AdminDeps | null, permission: InventoryPerm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: await inventoryDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, url });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

const method = (request: Request) => request.method.toUpperCase();
const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const badId = () => fail(400, 'INVALID_INPUT', ['id']);
const withId = (id: string, fn: () => Promise<Record<string, unknown>>) => (isUuid(id) ? fn() : Promise.resolve(badId()));

/** The ERP panel: the store's setup, whether an ERP serves it now, and the sync's error surface. */
async function erpView(c: Ctx): Promise<Record<string, unknown>> {
  const [setup, status, link] = await Promise.all([inv.getErpSetup(c.deps, c.who), inv.erpSyncStatus(c.deps, c.who), inv.resolveErp(c.deps, c.who.storeId)]);
  const connection =
    link.state === 'none'
      ? { state: 'none' }
      : link.state === 'unavailable'
        ? { state: 'unavailable', code: link.code }
        : { state: link.state, provider: link.provider, adapterMode: link.adapterMode, stockEnabled: link.stockEnabled };
  return { setup, connection, sync: status };
}

export function erpHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = method(request);
  if (m === 'GET') return handle(request, deps, 'inventory.read', erpView);
  if (m !== 'PUT') return notAllowed();
  return handle(request, deps, 'inventory.erp', async (c) => {
    const b = await body(request);
    const { erpCompanyId, erpWarehouseId, ...rest } = b;
    if ('mode' in rest || 'integrationId' in rest) await inv.setErpMode(c.deps, c.who, rest as inv.ErpModeInput);
    if (erpCompanyId !== undefined || erpWarehouseId !== undefined) await inv.setErpMapping(c.deps, c.who, { erpCompanyId, erpWarehouseId } as inv.ErpMappingInput);
    return erpView(c);
  });
}

export function erpVerifyHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'inventory.erp', async (c) => ({ check: await inv.verifyErpCompany(c.deps, c.who) }));
}

export function erpWarehousesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'inventory.read', async (c) => inv.erpWarehouses(c.deps, c.who) as unknown as Promise<Record<string, unknown>>);
}

export function warehousesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = method(request);
  if (m === 'GET') return handle(request, deps, 'inventory.read', async (c) => ({ warehouses: await inv.listWarehouses(c.deps, c.who, { includeArchived: ['1', 'true'].includes(c.url.searchParams.get('includeArchived') ?? '') }) }));
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'inventory.locations', async (c) => ({ created: await inv.createWarehouse(c.deps, c.who, (await body(request)) as inv.WarehouseInput) }), 201);
}

export function warehouseHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const m = method(request);
  if (m === 'GET') return handle(request, deps, 'inventory.read', (c) => withId(id, async () => ({ item: await inv.getWarehouse(c.deps, c.who, id) })));
  if (m !== 'PATCH') return notAllowed();
  return handle(request, deps, 'inventory.locations', (c) => withId(id, async () => ({ item: await inv.updateWarehouse(c.deps, c.who, id, (await body(request)) as inv.WarehousePatch) })));
}

export function warehouseLocationsHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'inventory.locations', (c) => withId(id, async () => ({ item: await inv.createLocation(c.deps, c.who, id, (await body(request)) as inv.LocationInput) })), 201);
}

export function locationHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'PATCH') return notAllowed();
  return handle(request, deps, 'inventory.locations', (c) => withId(id, async () => ({ item: await inv.updateLocation(c.deps, c.who, id, (await body(request)) as inv.LocationPatch) })));
}

export function stockHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'inventory.read', async (c) => {
    const q = (k: string) => c.url.searchParams.get(k)?.trim() || undefined;
    const productId = q('productId');
    if (productId) return isUuid(productId) ? { grid: await inv.stockGrid(c.deps, c.who, productId) } : badId();
    const variantId = q('variantId');
    if (variantId && !isUuid(variantId)) return badId();
    const sku = q('sku');
    if (!variantId && !sku) return fail(400, 'INVALID_INPUT', ['sku', 'variantId', 'productId']);
    return { stock: await inv.variantStock(c.deps, c.who, { variantId, sku }) };
  });
}
