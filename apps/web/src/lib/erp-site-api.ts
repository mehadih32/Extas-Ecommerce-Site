// PR 620 (CN-028, docs/erp/site-changes-v6.md §2.7) — the two calls the ERP makes to the shop, live, when the owner
// clicks "Top products" or "Customers" in the ERP (routes app/erp-api/top-products and app/erp-api/customers):
//
//   GET /erp-api/top-products?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=20
//     → { ok, from, to, currency, items: [{ sku, name, pieces, netSales, profit }] }
//   GET /erp-api/customers?page=1&pageSize=50&search=
//     → { ok, page, pageSize, total, items: [{ name, address, phone, totalSpent, lastPurchaseDate, orders, firstOrderDate }] }
//
// - No session and no cookie: the call proves itself with its signature over `METHOD\nPATH?QUERY\nTIMESTAMP`, made with
//   the asking store's own secret (@extas/inventory `checkErpSiteCall`: CN-029 §16, v6 only, off until the owner switches
//   `erp.siteApi.enabled` on). The preview gate lets exactly these two GET paths through, matched on the raw request
//   (infra/stack/caddy).
// - PATH?QUERY is the path and query as the URL standard reads the request: the ERP percent-encodes its query (RFC 3986,
//   as every HTTP client does) and signs exactly what it sends. A query sent with raw spaces, quotes or letters outside
//   ASCII would be read differently and is refused BAD_SIGNATURE (docs/admin-guide/integrations.md).
// - Round 2 (p3 review): every 401 answers one code, UNAUTHORIZED; the reasons are only counted on the shop.
// - qa-gate (30 Oct): a call refused from the request alone (another method, no or a broken signature) is answered by
//   `erpSiteRoute` before any connection is made or setting read; refused calls are only counted (a bounded summary,
//   @extas/inventory `ErpSiteGuard`), and only a verified caller's call gets its own log row. p3 review: the cut-off
//   after too many refusals is per client address, and a call signed with a known store secret is never cut off.
// - Top products are Sales by SKU (@extas/metrics `salesBySku`: delivered orders on the day they were delivered, the
//   store's own days in its time zone, both days included); customers are @extas/customers `erpCustomerPage` (one row per
//   person who ordered, total spent = Sales). Amounts are decimals in the store's currency, as the ERP contract writes
//   them; dates are the store's days.
// - The row counts are settings: the default when the call does not say (`erp.siteApi.topProductsLimit` 20,
//   `erp.siteApi.customersPageSize` 50), the most one call gets (`erp.siteApi.maxRows`), and the longest span of days
//   (`erp.siteApi.maxRangeDays`). A broken query is BAD_QUERY (400).
// - Every verified call is logged (SecurityEvent `erp.site-call`), never with a customer in it. The answer is never
//   cached anywhere and never indexed. Nothing is pushed: the ERP shows the list and does not keep it.
import { allAdapters, createConnections, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, type Connections } from '@extas/adapters';
import { erpCustomerPage } from '@extas/customers';
import type { PrismaClient } from '@extas/db/client';
import {
  checkErpSiteCall,
  currencyDigits,
  erpSiteGuard,
  erpSiteRequestRefusal,
  logErpSiteCall,
  minorToDecimal,
  type ErpSiteCall,
  type ErpSiteCode,
  type ErpSiteEndpoint,
  type ErpSiteGuard,
  type SettingsReader,
  type WebhookDeps,
} from '@extas/inventory';
import { daysPeriod, salesBySku, ymdIn } from '@extas/metrics';
import { adminDeps, requestContext } from './admin-auth';

export interface ErpSiteDeps {
  db: PrismaClient;
  settings: SettingsReader;
  connections: WebhookDeps['connections'];
  now?: () => Date;
  /** The refusal counters (this process's own unless a test gives one). */
  guard?: ErpSiteGuard;
}

const HEADERS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } as const;
const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: HEADERS });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (s: string | null): s is string => !!s && DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const wholeFrom = (s: string | null, min: number): number | null | undefined => {
  if (s === null || s === '') return undefined;
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n >= min ? n : null;
};
const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

class BadQuery extends Error {}

const holder = globalThis as unknown as { __erpSiteConnections?: { connections: Connections; at: number; ttlMs: number } };

/** The app's own deps for the two routes: one connection layer per process, the vault read once per cache period. */
export async function erpSiteDeps(): Promise<ErpSiteDeps | null> {
  const deps = adminDeps();
  if (!deps) return null;
  const now = Date.now();
  let hit = holder.__erpSiteConnections;
  if (!hit || now - hit.at >= hit.ttlMs) {
    const [testSeconds, cacheSeconds] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: allAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
    hit = holder.__erpSiteConnections = { connections, at: now, ttlMs: cacheSeconds * 1000 };
  }
  return { db: deps.db, settings: deps.resolver, connections: hit.connections, now: deps.now };
}

/**
 * A refused call as the sender sees it (round 2): every 401 is UNAUTHORIZED, whatever the reason (no secret yet,
 * unsigned, wrong, stale, a secret two stores share), so a sender learns nothing about the shop's secrets. The reason is
 * counted on the shop only (`ErpSiteGuard`, the card's refused calls).
 */
export const refusal = (r: { status: number; code: ErpSiteCode }): Response => answer(r.status, { ok: false, code: r.status === 401 ? 'UNAUTHORIZED' : r.code });

/** The answer when the app has no database (the route cannot ask anything). */
export const erpSiteUnavailable = () => answer(503, { ok: false, code: 'UNAVAILABLE' });

const serverError = (e: unknown) => {
  // The database or the vault did not answer: a plain refusal, never the framework's error page.
  console.error(`[erp-api] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  return answer(500, { ok: false, code: 'SERVER_ERROR' });
};

/**
 * The call as the shop reads it: the path, the query as the URL standard reads it, the two headers, and (p3 review) the
 * client's address for the per-address cut-off (Cloudflare's CF-Connecting-IP, then the proxy's).
 */
function callOf(request: Request): ErpSiteCall {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    query: url.search.replace(/^\?/, ''),
    signature: request.headers.get(ERP_SIGNATURE_HEADER),
    timestamp: request.headers.get(ERP_TIMESTAMP_HEADER),
    address: requestContext(request).ip,
  };
}

/**
 * Both routes: a call the request alone refuses is answered at once (nothing built, nothing read); otherwise the deps
 * are made inside the same try, so a failure still answers no-store, never the framework's error page.
 */
export async function erpSiteRoute(request: Request): Promise<Response> {
  const early = erpSiteRequestRefusal(callOf(request), new Date());
  if (early) return refusal(early);
  try {
    const deps = await erpSiteDeps();
    return deps ? await erpSiteApiHandler(request, deps) : erpSiteUnavailable();
  } catch (e) {
    return serverError(e);
  }
}

/** The handler of both routes, once the deps are made. */
export async function erpSiteApiHandler(request: Request, deps: ErpSiteDeps): Promise<Response> {
  const url = new URL(request.url);
  const now = deps.now?.() ?? new Date();
  let caller: Awaited<ReturnType<typeof checkErpSiteCall>>;
  try {
    caller = await checkErpSiteCall({ db: deps.db, settings: deps.settings, connections: deps.connections, now: deps.now }, callOf(request), deps.guard ?? erpSiteGuard());
  } catch (e) {
    return serverError(e);
  }
  // A refusal is only counted (checkErpSiteCall): nobody proved who was asking, so it gets no row of its own.
  if (!caller.ok) return refusal(caller);
  const { storeId, linkId, endpoint } = caller;
  const log = (status: number, code: ErpSiteCode, rows: number | null, searched = false) =>
    logErpSiteCall(deps.db, { storeId, linkId, endpoint, status, code, rows, searched, at: now }).catch(() => {});
  const q = url.searchParams;
  try {
    const body = await (endpoint === 'top-products' ? topProducts(deps, storeId, q) : customers(deps, storeId, q));
    await log(200, 'OK', body.items.length, endpoint === 'customers' && !!q.get('search')?.trim());
    return answer(200, { ok: true, ...body });
  } catch (e) {
    if (e instanceof BadQuery) {
      await log(400, 'BAD_QUERY', null);
      return answer(400, { ok: false, code: 'BAD_QUERY' });
    }
    console.error(`[erp-api ${endpoint satisfies ErpSiteEndpoint}] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    await log(500, 'SERVER_ERROR', null);
    return answer(500, { ok: false, code: 'SERVER_ERROR' });
  }
}

const set = <K extends Parameters<SettingsReader['value']>[0]>(deps: ErpSiteDeps, key: K, storeId?: number) => deps.settings.value(key, storeId === undefined ? undefined : { storeId });

async function storeMoney(deps: ErpSiteDeps, storeId: number) {
  const [store, timeZone] = await Promise.all([deps.db.store.findUniqueOrThrow({ where: { id: storeId }, select: { currency: true } }), set(deps, 'store.timeZone', storeId)]);
  const digits = currencyDigits(store.currency);
  return { currency: store.currency, timeZone, money: (minor: number) => minorToDecimal(minor, digits) };
}

async function topProducts(deps: ErpSiteDeps, storeId: number, q: URLSearchParams) {
  const from = q.get('from');
  const to = q.get('to');
  const [defLimit, maxRows, maxDays] = await Promise.all([set(deps, 'erp.siteApi.topProductsLimit'), set(deps, 'erp.siteApi.maxRows'), set(deps, 'erp.siteApi.maxRangeDays')]);
  const limit = wholeFrom(q.get('limit'), 1);
  if (!realDay(from) || !realDay(to) || to < from || spanDays(from, to) > maxDays || limit === null) throw new BadQuery();
  const { currency, timeZone, money } = await storeMoney(deps, storeId);
  const rows = await salesBySku(deps.db, storeId, daysPeriod(from, to, timeZone), Math.min(limit ?? defLimit, maxRows));
  return { from, to, currency, items: rows.map((r) => ({ sku: r.sku, name: r.name, pieces: r.pieces, netSales: money(r.salesMinor), profit: r.profitMinor === null ? null : money(r.profitMinor) })) };
}

async function customers(deps: ErpSiteDeps, storeId: number, q: URLSearchParams) {
  const [defSize, maxRows, searchMax] = await Promise.all([set(deps, 'erp.siteApi.customersPageSize'), set(deps, 'erp.siteApi.maxRows'), set(deps, 'erp.siteApi.searchMaxChars')]);
  const page = wholeFrom(q.get('page'), 1);
  const size = wholeFrom(q.get('pageSize'), 1);
  const search = (q.get('search') ?? '').trim();
  if (page === null || size === null || search.length > searchMax) throw new BadQuery();
  const pageSize = Math.min(size ?? defSize, maxRows);
  const { timeZone, money } = await storeMoney(deps, storeId);
  const p = await erpCustomerPage(deps.db, storeId, { page: page ?? 1, pageSize, search });
  const day = (d: Date | null) => (d ? ymdIn(d, timeZone) : null);
  return {
    page: page ?? 1,
    pageSize,
    total: p.total,
    items: p.rows.map((r) => ({ name: r.name, address: r.address, phone: r.phone, totalSpent: money(r.salesMinor), lastPurchaseDate: day(r.lastOrderAt), orders: r.orders, firstOrderDate: day(r.firstOrderAt) })),
  };
}
