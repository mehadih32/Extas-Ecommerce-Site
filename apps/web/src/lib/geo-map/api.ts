// S29 · PR 752 (CN-054) — Reports › Geography map: the routes, the setting card and the access rules, all checked again on
// the server (hiding a button is never enough). The figures are @extas/metrics `geoByArea` / `geoAreaDetail` (PR 751).
//   GET /api/admin/reports/geo-map          the map's figures as JSON      (`reports.read`; Sales only with `books.read`)
//   GET /api/admin/reports/geo-map/csv      the same table as a CSV file   (the same rules)
//   GET /api/admin/reports/geo-map/area     one area's panel (?area=<id>)  (the same rules)
//   GET|PUT /api/admin/reports/geo-map/setting   the card `reports.geoMap`  (read: `reports.read`; change: `settings.write`, audited)
// There is no on/off switch (owner's decision, 16 Nov 2026): the map and every slice are there for everyone with the permission. No new permission key.
// A heavy figure is remembered for `cacheSeconds` (0 = never). Counts only: no customer name or phone is ever answered.
import { audit, can } from "@extas/auth";
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import {
  geoAreaDetail,
  geoByArea,
  geoSliceBreakdown,
  SLICE_DIMENSIONS,
  ymdIn,
  type SliceBreakdown,
  type SliceDimension,
} from "@extas/metrics";
import type {
  GeoAreaDetail,
  GeoByArea,
  GeoMapApiResponse,
  GeoMapAreaApiResponse,
  GeoMapSetting,
  GeoSlices,
} from "@extas/metrics/geo-types";
import {
  GEO_MAP_DEFAULT,
  geoMapSchema,
  storeTarget,
  type GeoMapSettings,
} from "@extas/settings";
import {
  body as readBody,
  fail,
  guardAdmin,
  isUuid,
  json,
  type AdminDeps,
  type Guarded,
} from "../admin-auth";
import { JournalError, answer, versionOf } from "../journal/journal";
import { issuesOf } from "../journal/model";
import { geoMapCsv, geoMapFileName } from "./csv";
import { parseGeoMapQuery, type GeoMapQuery } from "./query";

const KEY = "reports.geoMap";

/** The setting as the page and the figures read it. */
export type GeoMapCard = { key: string; value: GeoMapSettings; version: string };

// ---- the remembered figures ------------------------------------------------------------------------------------------

const CACHE_MAX = 200; // hardcode-ok: a size guard for the in-process memory, not a business number
const cache = new Map<string, { at: number; value: unknown }>();

/** Forgets every remembered figure (after the setting changes). */
export function clearGeoMapCache(): void {
  cache.clear();
}

async function remembered<T>(seconds: number, key: string, now: number, make: () => Promise<T>): Promise<T> {
  if (seconds > 0) {
    const hit = cache.get(key);
    if (hit && now - hit.at < seconds * 1000) return hit.value as T;
  }
  const value = await make();
  if (seconds > 0) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: now, value });
  }
  return value;
}

// ---- the common front part -------------------------------------------------------------------------------------------

interface Ready {
  g: Guarded;
  storeId: number;
  setting: GeoMapSettings;
  money: boolean;
  today: string;
  timeZone: string;
  currency: string;
  query: GeoMapQuery;
  url: URL;
  now: Date;
}

/** The refusal to send, or everything a figure route needs. */
async function ready(request: Request, deps: AdminDeps | null): Promise<Ready | Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const at = { storeId };
    const setting = await d.resolver.value(KEY, at);
    const [money, timeZone, currency, limits] = await Promise.all([
      can(d.db, g.actor, "books.read", at),
      d.resolver.value("store.timeZone", at),
      d.resolver.value("store.currency", at),
      d.resolver.value("costs.report", at),
    ]);
    const now = d.now?.() ?? new Date();
    const today = ymdIn(now, timeZone);
    const query = parseGeoMapQuery(Object.fromEntries(url.searchParams), today, limits, setting);
    return { g, storeId, setting, money, today, timeZone, currency, query, url, now };
  } catch (e) {
    return answer(e);
  }
}

/** The category and product of the query as this store has them (another store's id is dropped). */
async function ownIds(
  db: PrismaClient,
  storeId: number,
  q: GeoMapQuery,
): Promise<GeoSlices> {
  const slices = q.slices;
  const [category, product, courier] = await Promise.all([
    q.categoryId
      ? db.category.findFirst({
          where: { storeId, id: q.categoryId },
          select: { id: true },
        })
      : null,
    q.productId
      ? db.product.findFirst({
          where: { storeId, id: q.productId },
          select: { id: true },
        })
      : null,
    slices.courierId
      ? db.courierAccount.findFirst({
          where: { storeId, id: slices.courierId },
          select: { id: true },
        })
      : null,
  ]);
  const out: GeoSlices = {
    categoryId: category?.id ?? null,
    productId: product?.id ?? null,
  };
  if (slices.channel) out.channel = slices.channel;
  if (slices.paymentType) out.paymentType = slices.paymentType;
  if (slices.customerType) out.customerType = slices.customerType;
  if (courier) out.courierId = courier.id;
  return out;
}

async function figures(d: AdminDeps, r: Ready): Promise<GeoByArea> {
  const own = await ownIds(d.db, r.storeId, r.query);
  const key = JSON.stringify(['map', r.storeId, r.money, r.setting.minOrders, r.query, own]);
  return remembered(r.setting.cacheSeconds, key, r.now.getTime(), () =>
    geoByArea(d.db, {
      storeId: r.storeId,
      timeZone: r.timeZone,
      days: r.query.days,
      level: r.query.level,
      parentAreaId: r.query.parentAreaId,
      compare: r.query.compare,
      compareDays: r.query.compareDays,
      includeMoney: r.money,
      minOrders: r.setting.minOrders,
      ...own,
    }),
  );
}

// ---- the routes ------------------------------------------------------------------------------------------------------

/** GET /api/admin/reports/geo-map */
export async function geoMapHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const r = await ready(request, deps);
  if (r instanceof Response) return r;
  try {
    const data = await figures(deps!, r);
    return json({ ok: true, setting: r.setting as GeoMapSetting, data, moneyHidden: !r.money } satisfies GeoMapApiResponse);
  } catch (e) {
    return answer(e);
  }
}

/** GET /api/admin/reports/geo-map/csv */
export async function geoMapCsvHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const r = await ready(request, deps);
  if (r instanceof Response) return r;
  try {
    const data = await figures(deps!, r);
    return new Response(geoMapCsv(data, r.currency, r.money), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${geoMapFileName(data)}"`, 'cache-control': 'no-store' },
    });
  } catch (e) {
    return answer(e);
  }
}

/** GET /api/admin/reports/geo-map/area?area=<id> */
export async function geoMapAreaHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const r = await ready(request, deps);
  if (r instanceof Response) return r;
  const areaId = r.url.searchParams.get('area');
  if (!isUuid(areaId)) return json({ ok: false, error: 'bad_query', message: 'An area id is needed.' } satisfies GeoMapAreaApiResponse, { status: 400 });
  try {
    const d = deps!;
    const own = await ownIds(d.db, r.storeId, r.query);
    const key = JSON.stringify(['area', r.storeId, r.money, r.setting.topProducts, r.query, own, areaId.toLowerCase()]);
    const detail = await remembered<GeoAreaDetail | null>(r.setting.cacheSeconds, key, r.now.getTime(), async () => {
      try {
        return await geoAreaDetail(d.db, {
          storeId: r.storeId,
          timeZone: r.timeZone,
          days: r.query.days,
          level: r.query.level,
          compare: r.query.compare,
          compareDays: r.query.compareDays,
          includeMoney: r.money,
          areaId: areaId.toLowerCase(),
          topProducts: r.setting.topProducts,
          ...own,
        });
      } catch (e) {
        if (e instanceof RangeError && /no such area/.test(e.message)) return null;
        throw e;
      }
    });
    if (!detail) return json({ ok: false, error: 'not_found', message: 'No such area.' } satisfies GeoMapAreaApiResponse, { status: 404 });
    return json({ ok: true, detail, moneyHidden: !r.money } satisfies GeoMapAreaApiResponse);
  } catch (e) {
    return answer(e);
  }
}

/** The slice a dimension of "Orders by …" belongs to (the table leaves that slice out so it does not collapse to one value). */
const DIMENSION_SLICE = {
  channel: "channel",
  paymentType: "paymentType",
  courier: "courierId",
  customerType: "customerType",
} as const satisfies Record<SliceDimension, keyof GeoSlices>;

export type GeoSlicesApiResponse =
  | {
      ok: true;
      data: SliceBreakdown;
      couriers: { id: string; name: string }[];
      moneyHidden: boolean;
    }
  | { ok: false; error: "bad_query"; message: string };

/** GET /api/admin/reports/geo-map/slices?by=channel|paymentType|courier|customerType — "Orders by …": the period's orders cut by one dimension. */
export async function geoMapSlicesHandler(
  request: Request,
  deps: AdminDeps | null,
): Promise<Response> {
  const r = await ready(request, deps);
  if (r instanceof Response) return r;
  const by = SLICE_DIMENSIONS.find((x) => x === r.url.searchParams.get("by"));
  if (!by)
    return json(
      {
        ok: false,
        error: "bad_query",
        message: "A dimension is needed.",
      } satisfies GeoSlicesApiResponse,
      { status: 400 },
    );
  try {
    const d = deps!;
    // the other slices narrow the orders first; the dimension's own slice would collapse the table to one value
    const own = await ownIds(d.db, r.storeId, r.query);
    const orderLevel: GeoSlices = { ...own, categoryId: null, productId: null };
    delete orderLevel[DIMENSION_SLICE[by]];
    const key = JSON.stringify([
      "slices",
      r.storeId,
      r.money,
      by,
      r.query.days,
      orderLevel,
    ]);
    const data = await remembered(
      r.setting.cacheSeconds,
      key,
      r.now.getTime(),
      () =>
        geoSliceBreakdown(d.db, {
          storeId: r.storeId,
          timeZone: r.timeZone,
          days: r.query.days,
          dimension: by,
          slices: orderLevel,
          includeMoney: r.money,
        }),
    );
    const couriers = await d.db.courierAccount.findMany({
      where: { storeId: r.storeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return json({
      ok: true,
      data,
      couriers,
      moneyHidden: !r.money,
    } satisfies GeoSlicesApiResponse);
  } catch (e) {
    return answer(e);
  }
}

// ---- the setting card ------------------------------------------------------------------------------------------------

/** The card: its key, the value and the version the page sends back when it saves. */
export async function geoMapCard(resolver: AdminDeps['resolver'], storeId: number): Promise<GeoMapCard> {
  const value = (await resolver.value(KEY, { storeId })) as GeoMapSettings;
  return { key: KEY, value, version: versionOf(value) };
}

/**
 * Saves the card (`settings.write`, audited). The body is `{ values?: {…} }`; what is not named stays as it
 * was, the whole value is checked again, and a save that changes nothing writes nothing.
 */
export async function saveGeoMapSettings(db: PrismaClient, resolver: AdminDeps['resolver'], who: Pick<Guarded, 'actor' | 'ctx'>, input: unknown, storeId: number = MOTHER_STORE_ID): Promise<GeoMapCard> {
  if (!(await can(db, who.actor, 'settings.write', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['settings.write']);
  const before = (await resolver.value(KEY, { storeId })) as GeoMapSettings;
  const o = (input ?? {}) as { values?: unknown; version?: unknown };
  if (typeof o.version === "string" && o.version !== versionOf(before))
    throw new JournalError("STALE", 409);
  const values =
    o.values && typeof o.values === "object" && !Array.isArray(o.values)
      ? (o.values as Record<string, unknown>)
      : {};
  const merged = { ...before, ...values };
  const ok = geoMapSchema.safeParse(merged);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) !== versionOf(before)) {
    await resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Geography map' });
    await audit(db, who.actor, { storeId, action: 'reports.geoMap.settings', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
    clearGeoMapCache();
  }
  return { key: KEY, value: ok.data, version: versionOf(ok.data) };
}

/** GET|PUT /api/admin/reports/geo-map/setting — the numbers of the map. */
export async function geoMapSettingHandler(
  request: Request,
  deps: AdminDeps | null,
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = MOTHER_STORE_ID;
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'reports.read' : 'settings.write', storeId });
  if (g instanceof Response) return g;
  try {
    const card = method === 'PUT' ? await saveGeoMapSettings(deps!.db, deps!.resolver, g, await readBody(request), storeId) : await geoMapCard(deps!.resolver, storeId);
    return json({ ok: true, card, defaults: GEO_MAP_DEFAULT });
  } catch (e) {
    return answer(e);
  }
}
