// S09 · PR 497, 498, 499, 194–207 — the inventory's admin API. The stock page (`/admin/stock`, PR 205) and its count
// and movement pages call these routes. Every route signs the person in (guardAdmin), checks the permission in the store
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
//   GET         /api/admin/inventory/health                  the sync health panel: verdict, last runs, documents, holds,
//                                                            low stock, open counts (PR 205; never calls the ERP)
//   POST        /api/admin/inventory/resync                  {full?} all stock now · {productId} or {sku} one product (PR 206)
//   GET         /api/admin/inventory/pushes                  documents to the ERP (?status=FAILED,DEAD) with counts (PR 199/200)
//   POST        /api/admin/inventory/pushes/retry            {ids} or {all: true} — send failed / dead / skipped again (PR 206)
//   GET         /api/admin/inventory/low-stock               open low-stock alerts on the shared number (PR 202)
//   GET/POST    /api/admin/inventory/audits                  stock counts · start one {locationId} (PR 203)
//   GET/POST    /api/admin/inventory/audits/:id              one count · {action: scan (code, quantity?) | review |
//                                                            complete | cancel}
//   PATCH       /api/admin/inventory/audit-lines/:id         {reason} the reason of a counted difference
//   GET         /api/admin/inventory/publish-queue           the publish queue with each product's real stock (PR 204)
//   GET         /api/admin/inventory/erp/styles              ERP styles the shop does not have yet (PR 204)
//   GET         /api/admin/inventory/movements               ?from=&to=&sku=&locationId= the movement report (PR 207)
//   POST        /api/admin/inventory/reconcile               check every stock number against the ERP (PR 207)
//
// The ERP's address and keys are typed in on the Keys & connections page (PR 500) and live in the vault (PR 493); with
// none, the connection runs on the practice ERP, which never changes real stock (PR 499).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { allAdapters, createConnections } from '@extas/adapters';
import * as inv from '@extas/inventory';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

export type InventoryPerm = 'inventory.read' | 'inventory.locations' | 'inventory.erp' | 'inventory.sync' | 'inventory.audit';

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
const withId = (id: string, fn: () => Promise<Record<string, unknown> | Response>): Promise<Record<string, unknown> | Response> => (isUuid(id) ? fn() : Promise.resolve(badId()));

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

// ---- PR 202–207 · the stock page ------------------------------------------------------------------------------------

export function healthHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'inventory.read', async (c) => ({ health: await inv.syncHealth(c.deps, c.who) }));
}

/** PR 206 — all stock (`{full?}`) or one product (`{productId}` / `{sku}`). */
export function resyncHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'inventory.sync', async (c) => {
    const b = await body(request);
    if ('productId' in b || 'sku' in b) return { product: await inv.resyncProduct(c.deps, c.who, b as inv.ResyncProductInput) };
    return { stock: await inv.resyncStock(c.deps, c.who, b as inv.ResyncInput) };
  });
}

const PUSH_STATUSES: readonly inv.PushStatusName[] = ['PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED_NO_ERP', 'RETIRED', 'HELD'];

export function pushesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'inventory.read', async (c) => {
    const raw = (c.url.searchParams.get('status') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const bad = raw.filter((s) => !PUSH_STATUSES.includes(s as inv.PushStatusName));
    if (bad.length) return fail(400, 'INVALID_INPUT', bad.map((s) => `status:${s}`));
    return inv.listErpPushes(c.deps, c.who, { status: raw as inv.PushStatusName[] }) as unknown as Promise<Record<string, unknown>>;
  });
}

export function pushesRetryHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'inventory.sync', async (c) => inv.retryErpPushes(c.deps, c.who, (await body(request)) as inv.RetryInput) as unknown as Promise<Record<string, unknown>>);
}

export function lowStockHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'inventory.read', async (c) => inv.listLowStock(c.deps, c.who) as unknown as Promise<Record<string, unknown>>);
}

export function auditsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = method(request);
  if (m === 'GET') return handle(request, deps, 'inventory.read', async (c) => ({ audits: await inv.listStockAudits(c.deps, c.who) }));
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'inventory.audit', async (c) => ({ audit: await inv.startStockAudit(c.deps, c.who, (await body(request)) as { locationId: string }) }), 201);
}

const AUDIT_ACTIONS = ['scan', 'review', 'complete', 'cancel'] as const;

export function auditHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const m = method(request);
  if (m === 'GET') return handle(request, deps, 'inventory.read', (c) => withId(id, async () => ({ audit: await inv.getStockAudit(c.deps, c.who, id) })));
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'inventory.audit', (c) =>
    withId(id, async () => {
      const { action, ...rest } = await body(request);
      if (!AUDIT_ACTIONS.includes(action as (typeof AUDIT_ACTIONS)[number])) return fail(400, 'INVALID_INPUT', ['action']);
      if (action === 'scan') return { ...(await inv.scanStockAudit(c.deps, c.who, id, rest as inv.ScanInput)) };
      if (action === 'review') return { audit: await inv.reviewStockAudit(c.deps, c.who, id) };
      if (action === 'complete') return { audit: await inv.completeStockAudit(c.deps, c.who, id) };
      return { audit: await inv.cancelStockAudit(c.deps, c.who, id) };
    }),
  );
}

export function auditLineHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'PATCH') return notAllowed();
  return handle(request, deps, 'inventory.audit', (c) => withId(id, async () => ({ audit: await inv.setAuditLineReason(c.deps, c.who, id, (await body(request)) as inv.ReasonInput) })));
}

export function publishQueueHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'inventory.read', async (c) => ({ queue: await inv.stockQueue(c.deps, c.who) }));
}

export function erpStylesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'inventory.read', async (c) => ({ styles: await inv.newErpStyles(c.deps, c.who) }));
}

export function movementsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'inventory.read', async (c) => {
    const q = (k: string) => c.url.searchParams.get(k)?.trim() || undefined;
    return { report: await inv.stockMovementReport(c.deps, c.who, { from: q('from') ?? '', to: q('to') ?? '', sku: q('sku'), locationId: q('locationId') }) };
  });
}

export function reconcileHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'inventory.sync', async (c) => ({ reconcile: await inv.reconcileWithErp(c.deps, c.who) }));
}
