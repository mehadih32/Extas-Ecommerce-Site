// S08 · PR 175 — the courier admin API (BACKEND-ARCHITECTURE §5.6 DLV-03, DLV-05). No admin pages yet: the Delivery
// screens come with the new admin shell; these routes are what they call. Every route signs the person in
// (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then calls
// @extas/shipping, which checks the permission again and writes the audit log in the same transaction. Answers are
// `{ ok: true, … }` or `{ ok: false, error: CODE, details, data }`.
//
//   GET   /api/admin/delivery/couriers?includeArchived=1   the courier accounts, each with its mode (MOCK until the
//                                                          courier's keys pass the Test in Keys & connections) (delivery.read)
//   POST  /api/admin/delivery/couriers                     {providerKey, name} add an account (delivery.couriers)
//   PATCH /api/admin/delivery/couriers/:id                 {name?, enabled?, archived?} never deleted (delivery.couriers)
//   GET   /api/admin/delivery/parcels?view=&courierAccountId=&orderId=&cursor=&limit=
//                                                          the parcels by view: active, exceptions, failed, finished, all
//                                                          (delivery.parcels)
//   GET   /api/admin/delivery/parcels/:id                  one parcel with every courier event, newest first
//   POST  /api/admin/delivery/parcels/:id/exception        {status, reasonKey, note?} what the courier said on the phone:
//                                                          a failed try, an address problem, lost, damaged (delivery.exceptions)
//   GET   /api/admin/delivery/rto-cost?from=&to=&practice=1
//                                                          the RTO cost book: real returned parcels only, both courier
//                                                          legs, every part not entered named (delivery.parcels)
import { courierAdapters, createConnections } from '@extas/adapters';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

interface Ctx {
  deps: sh.ShippingDeps;
  who: sh.Who;
  url: URL;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The shipping service's dependencies for one request: the courier connections with the vault's keys. */
export async function shippingDeps(deps: AdminDeps): Promise<sh.ShippingDeps> {
  const [testSeconds, cacheSeconds] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const vault = deps.vault ?? { get: async () => null };
  const connections = createConnections({ db: deps.db, vault, adapters: courierAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
  return { db: deps.db, settings: deps.resolver, connections, now: deps.now };
}

/** A refusal of the shipping service with what the screen needs. */
function shippingFail(e: unknown): Response {
  if (sh.isShippingError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

async function handle(request: Request, deps: AdminDeps | null, permission: sh.ShippingPermission | 'delivery.read', fn: (c: Ctx) => Promise<Record<string, unknown>>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: await shippingDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, url });
    return json({ ok: true, ...out }, { status });
  } catch (e) {
    return shippingFail(e);
  }
}

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));
const query = (url: URL, keys: string[]) => Object.fromEntries(keys.flatMap((k) => (url.searchParams.has(k) ? [[k, url.searchParams.get(k)!]] : [])));

/** The courier accounts: `path` is what comes after /api/admin/delivery/couriers. */
export async function couriersRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, ...rest] = path;
  if (!id) {
    if (m === 'GET') return handle(request, deps, 'delivery.read', async (x) => ({ ...(await sh.listCouriers(x.deps, x.who, { includeArchived: x.url.searchParams.get('includeArchived') === '1' })) }));
    if (m === 'POST') return handle(request, deps, 'delivery.couriers', async (x) => ({ courier: await sh.addCourier(x.deps, x.who, await body(request)) }), 201);
    return notAllowed();
  }
  if (rest.length) return notFound();
  if (!isUuid(id)) return Promise.resolve(fail(404, 'NOT_FOUND', ['courierAccountId']));
  if (m !== 'PATCH') return notAllowed();
  return handle(request, deps, 'delivery.couriers', async (x) => ({ courier: await sh.updateCourier(x.deps, x.who, id, await body(request)) }));
}

/** The parcels: `path` is what comes after /api/admin/delivery/parcels. */
export async function parcelsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, action, ...rest] = path;
  if (!id) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'delivery.parcels', async (x) => ({ ...(await sh.listParcels(x.deps, x.who, query(x.url, ['view', 'courierAccountId', 'orderId', 'cursor', 'limit']))) }));
  }
  if (!isUuid(id)) return Promise.resolve(fail(404, 'NOT_FOUND', ['shipmentId']));
  if (rest.length) return notFound();
  if (!action) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'delivery.parcels', async (x) => ({ parcel: await sh.getParcel(x.deps, x.who, id) }));
  }
  if (action === 'exception') {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'delivery.exceptions', async (x) => ({ result: await sh.recordException(x.deps, x.who, id, await body(request)) }));
  }
  return notFound();
}

/** The RTO cost book. */
export async function rtoCostRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return notAllowed();
  return handle(request, deps, 'delivery.parcels', async (x) => ({ ...(await sh.rtoBook(x.deps, x.who, query(x.url, ['from', 'to', 'practice', 'limit']))) }));
}
