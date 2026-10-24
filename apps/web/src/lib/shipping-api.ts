// S08 · PR 175 — the courier admin API (BACKEND-ARCHITECTURE §5.6 DLV-03, DLV-05). The Delivery → Couriers pages (PR 554)
// and the screens still to come call these routes. Every route signs the person in
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
// PR 176 — booking (always a person's press, never automatic) and reading a parcel now:
//   GET   /api/admin/delivery/bookings?limit=               the orders ready to book (the order service's own view), the
//                                                          gifts still waiting for their day, the owner's "per press" (delivery.book)
//   POST  /api/admin/delivery/bookings                     {courierAccountId, orderIds: [...]} or {courierAccountId, all: true}
//                                                          each order its own outcome: booked, unknown, failed, skipped
//                                                          with the reason (IN_REVIEW, BOOKED, GIFT_DATE …) (delivery.book)
//   POST  /api/admin/delivery/parcels/:id/retry            a failed booking, or one without an answer: asks the courier
//                                                          for the shop's reference first, never books twice (delivery.book)
//   POST  /api/admin/delivery/parcels/:id/track            reads the parcel from its courier now (delivery.parcels)
// PR 554 — the courier zone sync (DLV-05 "Sync zones"):
//   GET   /api/admin/delivery/couriers/:id/zones?tab=&q=&page=&limit=
//                                                          the courier page: counts, the last run, one tab of rows —
//                                                          needed (areas parcels wait for), unmapped (with candidates),
//                                                          mapped, dropped (delivery.read)
//   POST  /api/admin/delivery/couriers/:id/zone-sync       "Read the list now": a practice courier is read at once, a real
//                                                          one by the worker's next turn (delivery.couriers)
//   GET   /api/admin/delivery/couriers/:id/places?q=&level=  the courier's places by name (delivery.read)
//   POST  /api/admin/delivery/couriers/:id/areas           {areaId, placeId} a person pairs an area (delivery.couriers)
//   POST  /api/admin/delivery/couriers/:id/areas/:areaId/unmap   takes a pair away: archived, never deleted (delivery.couriers)
// PR 184: the parcel list's `view=late` — still with the courier past the band's promise (SIM-F-018).
// PR 525 — the true-delivery check (a "Delivered" the shop's own records contradict; nothing moves money or COD):
//   GET   /api/admin/delivery/checks?view=open|resolved|all&orderId=&customerId=&cursor=&limit=
//                                                          the checks with their signs, the order and courier (delivery.parcels)
//   POST  /api/admin/delivery/checks/:id/resolve           {outcome: DELIVERED | CHARGE_PAID_RETURN | RETURNED, refusalKey?, note?}
//                                                          what really happened, through the order service (delivery.outcomes)
import { courierAdapters, createConnections } from '@extas/adapters';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

interface Ctx {
  deps: sh.ShippingDeps;
  who: sh.Who;
  url: URL;
}

export function storeIdOf(url: URL): number | null {
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
export function shippingFail(e: unknown): Response {
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
  if (!isUuid(id)) return Promise.resolve(fail(404, 'NOT_FOUND', ['courierAccountId']));
  if (rest.length) return courierZoneRoute(request, deps, id, rest);
  if (m !== 'PATCH') return notAllowed();
  return handle(request, deps, 'delivery.couriers', async (x) => ({ courier: await sh.updateCourier(x.deps, x.who, id, await body(request)) }));
}

/** PR 554: one courier's zone sync: `rest` is what comes after /api/admin/delivery/couriers/:id. */
function courierZoneRoute(request: Request, deps: AdminDeps | null, id: string, rest: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [what, areaId, action, ...more] = rest;
  if (more.length) return notFound();
  if (what === 'zones' && !areaId) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'delivery.read', async (x) => ({ ...(await sh.courierZones(x.deps, x.who, id, query(x.url, ['tab', 'q', 'page', 'limit']))) }));
  }
  if (what === 'zone-sync' && !areaId) {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'delivery.couriers', async (x) => ({ ...(await sh.readListNow(x.deps, x.who, id)) }));
  }
  if (what === 'places' && !areaId) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'delivery.read', async (x) => ({ places: await sh.searchCourierPlaces(x.deps, x.who, id, query(x.url, ['q', 'level', 'limit'])) }));
  }
  if (what === 'areas' && !areaId) {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'delivery.couriers', async (x) => ({ pair: await sh.mapArea(x.deps, x.who, id, await body(request)) }));
  }
  if (what === 'areas' && areaId && action === 'unmap') {
    if (!isUuid(areaId)) return Promise.resolve(fail(404, 'NOT_FOUND', ['areaId']));
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'delivery.couriers', async (x) => {
      await sh.unmapArea(x.deps, x.who, id, areaId);
      return {};
    });
  }
  return notFound();
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
  if (action === 'retry') {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'delivery.book', async (x) => ({ result: await sh.retryBooking(x.deps, x.who, id) }));
  }
  if (action === 'track') {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'delivery.parcels', async (x) => ({ result: await sh.trackParcel(x.deps, x.who, id) }));
  }
  return notFound();
}

/** PR 525 — the true-delivery checks: `path` is what comes after /api/admin/delivery/checks. */
export async function checksRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, action, ...rest] = path;
  if (!id) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'delivery.parcels', async (x) => ({ ...(await sh.listDeliveryChecks(x.deps, x.who, query(x.url, ['view', 'orderId', 'customerId', 'cursor', 'limit']))) }));
  }
  if (!isUuid(id)) return Promise.resolve(fail(404, 'NOT_FOUND', ['checkId']));
  if (rest.length || action !== 'resolve') return notFound();
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'delivery.outcomes', async (x) => ({ ...(await sh.resolveDeliveryCheck(x.deps, x.who, id, await body(request))) }));
}

/** Booking: the orders ready to book, and a press of "Book" or "Book all". */
export async function bookingsRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m === 'GET') return handle(request, deps, 'delivery.book', async (x) => ({ ...(await sh.readyToBook(x.deps, x.who, query(x.url, ['limit']))) }));
  if (m === 'POST') return handle(request, deps, 'delivery.book', async (x) => ({ ...(await sh.bookOrders(x.deps, x.who, await body(request))) }));
  return notAllowed();
}

/** The RTO cost book. */
export async function rtoCostRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return notAllowed();
  return handle(request, deps, 'delivery.parcels', async (x) => ({ ...(await sh.rtoBook(x.deps, x.who, query(x.url, ['from', 'to', 'practice', 'limit']))) }));
}
