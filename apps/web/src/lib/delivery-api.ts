// S06 · PR 550 — the delivery bands' admin API. The delivery page (`/admin/delivery`) calls these routes. Every route
// signs the person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother
// store), then calls @extas/delivery, which checks the permission again and writes the audit log. Answers are
// `{ ok: true, … }` or `{ ok: false, error: CODE, details }`.
//
//   GET    /api/admin/delivery/bands               the three bands: charge, hours, on/off, sub-area mode, places listed
//   PATCH  /api/admin/delivery/bands/:id           {chargeMinor?, hoursMin?, hoursMax?, codLimitMinor?, enabled?, mode?}
//                                                  switching on needs the charge in the same change (CHARGE_REQUIRED)
//   GET    /api/admin/delivery/areas               the sub-area list (?includeArchived=1)
//   POST   /api/admin/delivery/areas               {areaId, bandId?} put a place on the list (the sub-area band by default)
//   PATCH  /api/admin/delivery/areas/:areaId       {archived: true} take it off (archived, never deleted) · {bandId} move
//   GET    /api/admin/delivery/places?q=           the place search: prefix matches, each with the band it sits in now
//   POST   /api/admin/delivery/resolve             {line, savedAreaId?, confirmed?} "Try an address": what checkout does
//   POST   /api/delivery/resolve                   the same read for the checkout (public: same-site, size-capped, reads
//                                                  only the gazetteer and the bands — never a customer)
//
// The charges, hours and the list are owner data (PR 509): the default pack ships the bands off with no charge.
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as del from '@extas/delivery';
import { body, errorResponse, fail, guardAdmin, isUuid, json, sameOrigin, type AdminDeps } from './admin-auth';

export type DeliveryPerm = del.DeliveryPermission;

interface Ctx {
  deps: del.DeliveryDeps;
  who: del.Who;
  url: URL;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The delivery services' dependencies for one request. */
export const deliveryDeps = (deps: AdminDeps): del.DeliveryDeps => ({ db: deps.db, settings: deps.resolver, now: deps.now });

async function handle(request: Request, deps: AdminDeps | null, permission: DeliveryPerm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: deliveryDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, url });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

const method = (request: Request) => request.method.toUpperCase();
const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const badId = (field: string) => Promise.resolve(fail(400, 'INVALID_INPUT', [field]));

export function bandsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'delivery.read', async (c) => ({ bands: await del.listBands(c.deps, c.who) }));
}

export function bandHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (method(request) !== 'PATCH') return notAllowed();
  if (!isUuid(id)) return badId('id');
  return handle(request, deps, 'delivery.charges', async (c) => ({ band: await del.updateBand(c.deps, c.who, id, await body(request)) }));
}

export function areasHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = method(request);
  if (m === 'GET') {
    return handle(request, deps, 'delivery.read', async (c) => ({ areas: await del.listSubAreas(c.deps, c.who, { includeArchived: ['1', 'true'].includes(c.url.searchParams.get('includeArchived') ?? '') }) }));
  }
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'delivery.areas', async (c) => ({ area: await del.setAreaBand(c.deps, c.who, await body(request)) }), 201);
}

export function areaHandler(request: Request, deps: AdminDeps | null, areaId: string): Promise<Response> {
  if (method(request) !== 'PATCH') return notAllowed();
  if (!isUuid(areaId)) return badId('areaId');
  return handle(request, deps, 'delivery.areas', async (c) => {
    const b = await body(request);
    if (b.archived === true && Object.keys(b).length === 1) return { area: await del.removeAreaBand(c.deps, c.who, areaId) };
    if ('bandId' in b && Object.keys(b).length === 1) return { area: await del.setAreaBand(c.deps, c.who, { areaId, bandId: b.bandId }) };
    return fail(400, 'INVALID_INPUT', ['(input)']);
  });
}

export function placesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'delivery.read', async (c) => ({ places: await del.searchPlaces(c.deps, c.who, c.url.searchParams.get('q') ?? '') }));
}

export function tryAddressHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'delivery.read', async (c) => ({ read: await del.tryAddress(c.deps, c.who, await body(request)) }));
}

/** Reads a JSON body, stopping as soon as it passes `max` bytes (a missing or wrong content-length cannot get past it). */
async function cappedBody(request: Request, max: number): Promise<Record<string, unknown> | 'too-large'> {
  if (Number(request.headers.get('content-length') ?? '0') > max) return 'too-large';
  const reader = request.body?.getReader();
  if (!reader) return {};
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return 'too-large';
    }
    parts.push(value);
  }
  try {
    const v = JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** A public delivery route's door: POST only, a database, the same site, and a body no bigger than the setting. */
async function publicDoor(request: Request, deps: AdminDeps | null): Promise<Response | { deps: del.DeliveryDeps; storeId: number; input: Record<string, unknown> }> {
  if (method(request) !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const d = deliveryDeps(deps);
  const input = await cappedBody(request, await d.settings.value('delivery.public.maxBodyBytes'));
  if (input === 'too-large') return fail(413, 'TOO_LARGE');
  return { deps: d, storeId, input };
}

/** POST /api/delivery/resolve {line, savedAreaId?, confirmed?} — the checkout's address read (PR 551). */
export async function publicResolveHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const door = await publicDoor(request, deps);
  if (door instanceof Response) return door;
  try {
    return json({ ok: true, read: await del.resolveLine(door.deps, door.storeId, door.input) });
  } catch (e) {
    return errorResponse(e);
  }
}
