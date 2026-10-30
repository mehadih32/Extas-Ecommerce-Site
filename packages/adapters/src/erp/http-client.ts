// PR 194, 498 — the HTTP client for the ERP ↔ shop API contract (docs/ERP-API-CONTRACT.md, CN-005). One client serves
// all three modes: LIVE and SANDBOX talk to the address the owner typed in, MOCK talks to the in-process practice ERP
// (mock-erp.ts) through the same code, so authentication, paging, error mapping and timeouts are exercised from day
// one, before any key exists (A1.3).
//
// - Authentication: `Authorization: Bearer <key>`. The key is never put into a message, a URL or a log line.
// - Errors: the ERP answers `{ error: { code, message, details } }`; the client turns every failure into an ErpError
//   with a stable code and says whether another try may help. Trying again is the sync layer's job (it reads the
//   attempts and backoff from settings), so one call here is exactly one request.
// - Answers are checked against the contract row by row: a broken row is reported back (`rejected`), it never stops
//   the good rows of the same page.
// - Documents (PR 199, 200): `push` sends one business document (POST /orders, PATCH /orders/{id}) with its
//   Idempotency-Key header; a repeat with the same key gets the ERP's first answer and changes nothing there.
import { z } from 'zod';
import {
  ErpError,
  erpCodeForStatus,
  type ErpApi,
  type ErpCallOptions,
  type ErpDocument,
  type ErpHealth,
  type ErpPage,
  type ErpPushResult,
  type ErpStockRow,
  type ErpVariantRow,
} from './contract';
import {
  erpAccountSchema,
  erpClaimSchema,
  erpCostOfGoodsSchema,
  erpSwitchOverSchema,
  erpExchangeSchema,
  erpFixedCostMonthSchema,
  erpOrderAnswerSchema,
  erpReturnItemSchema,
  erpReturnsSummarySchema,
  erpStoredSummarySchema,
  ERP_GRADES,
  type ErpV6Reads,
} from './v6';

/** The contract's base path on the ERP. Part of the API contract, like a route. */
export const ERP_API_BASE_PATH = '/api/v1/ecommerce';

/** Longest ERP-provided text kept in an error (the health panel shows it). */
const MAX_TEXT = 300;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ErpHttpOptions {
  /** The ERP's address (scheme + host, optionally a path prefix). */
  baseUrl: string;
  apiKey: string;
  provider: string;
  /** Defaults to the global fetch, looked up on every call. */
  fetch?: FetchLike;
}

const idText = z.union([z.string().min(1), z.number()]).transform(String);
const dateText = z.union([z.string(), z.date()]).transform((v, c) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) {
    c.addIssue({ code: 'custom', message: 'not a date' });
    return z.NEVER;
  }
  return d;
});
const decimalText = z.union([z.string().regex(/^-?\d+(\.\d+)?$/), z.number()]).transform(String);
const optText = z.string().nullish().transform((v) => v ?? null);

const healthSchema = z.object({
  companyName: z.string().min(1),
  integrationName: z.string().min(1),
  companyId: idText.nullish().transform((v) => v ?? null),
  warehouseId: idText.nullish().transform((v) => v ?? null),
});

export const erpStockRowSchema = z.object({
  sku: z.string().trim().min(1),
  warehouseId: idText,
  onHand: z.int(),
  reserved: z.int().min(0),
  available: z.int(),
  // PR 607 (v6): grade and the unchecked returned pieces inside `available`; v5 answers have neither.
  grade: z.enum(ERP_GRADES).default('A'),
  fromReturnStock: z.int().min(0).default(0),
  updatedAt: dateText,
});

export const erpVariantRowSchema = z.object({
  sku: z.string().trim().min(1),
  barcode: optText,
  styleCode: optText,
  styleName: optText,
  color: optText,
  size: optText,
  retailPrice: decimalText.nullish().transform((v) => v ?? null),
  avgCost: decimalText.nullish().transform((v) => v ?? null),
  // PR 607 (v6): the shop price ("bought from ERP at") and the grade; v5 answers have neither.
  shopPrice: decimalText.nullish().transform((v) => v ?? null),
  grade: z.enum(ERP_GRADES).default('A'),
  active: z.boolean().default(true),
  updatedAt: dateText,
});

/** A page: `{ items | data, nextCursor | cursor }`, or a bare array (one page). */
function pageOf(body: unknown): { items: unknown[]; nextCursor: string | null } {
  if (Array.isArray(body)) return { items: body, nextCursor: null };
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const items = Array.isArray(o.items) ? o.items : Array.isArray(o.data) ? o.data : null;
    const next = o.nextCursor ?? o.cursor ?? null;
    if (items && (next === null || typeof next === 'string')) return { items, nextCursor: next || null };
  }
  throw new ErpError('BAD_RESPONSE', 'the ERP did not answer with a page of items');
}

function rows<T>(items: unknown[], schema: z.ZodType<T>): { items: T[]; rejected: { index: number; reason: string }[] } {
  const ok: T[] = [];
  const rejected: { index: number; reason: string }[] = [];
  items.forEach((raw, index) => {
    const r = schema.safeParse(raw);
    if (r.success) ok.push(r.data);
    else rejected.push({ index, reason: r.error.issues.map((i) => `${i.path.join('.') || '(row)'}: ${i.message}`).join('; ').slice(0, MAX_TEXT) });
  });
  return { items: ok, rejected };
}

/** Seconds or an HTTP date → milliseconds from now. */
export function retryAfterMs(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const s = Number(header);
  if (Number.isFinite(s) && s >= 0) return Math.round(s * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

const clip = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : null);

async function failure(res: Response): Promise<ErpError> {
  let erpCode: string | null = null;
  let message = `the ERP answered ${res.status}`;
  let details: string[] = [];
  let detailsBody: unknown = null;
  try {
    const b = (await res.json()) as { error?: { code?: unknown; message?: unknown; details?: unknown } };
    if (b?.error) {
      erpCode = clip(b.error.code);
      message = clip(b.error.message) ?? message;
      const d = b.error.details;
      detailsBody = d ?? null;
      if (Array.isArray(d)) details = d.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, MAX_TEXT)).slice(0, 50);
      else if (d && typeof d === 'object') details = [JSON.stringify(d).slice(0, MAX_TEXT)];
    }
  } catch {
    // Not JSON: the status alone tells the story.
  }
  return new ErpError(erpCodeForStatus(res.status), message, { status: res.status, erpCode, details, detailsBody, retryAfterMs: retryAfterMs(res.headers.get('retry-after')) });
}

/** The contract's method and path for each document kind (PR 199). */
export function documentRoute(doc: ErpDocument): { method: 'POST' | 'PATCH' | 'PUT'; path: string; body: unknown } {
  const id = encodeURIComponent;
  switch (doc.type) {
    case 'order.create':
      return { method: 'POST', path: '/orders', body: doc.body };
    case 'order.status':
      return { method: 'PATCH', path: `/orders/${encodeURIComponent(doc.externalOrderId)}`, body: doc.body };
    case 'return.create':
      return { method: 'POST', path: '/returns', body: doc.body };
    // PR 607 — contract v6 (§2.12 "New calls").
    case 'shipment.create':
      return { method: 'POST', path: '/shipments', body: doc.body };
    case 'order.delivery':
      return { method: 'PUT', path: `/orders/${id(doc.externalOrderId)}/delivery`, body: doc.body };
    case 'order.line':
      return { method: 'PATCH', path: `/orders/${id(doc.externalOrderId)}/lines/${id(doc.lineId)}`, body: doc.body };
    case 'returnList.create':
      return { method: 'POST', path: '/return-lists', body: doc.body };
    case 'exchange.lateReturn':
      return { method: 'POST', path: `/exchanges/${id(doc.exchangeId)}/late-return`, body: doc.body };
    case 'dailySummary.put':
      return { method: 'PUT', path: `/daily-summaries/${id(doc.date)}`, body: doc.body };
    case 'fixedCosts.put':
      return { method: 'PUT', path: `/fixed-costs/${id(doc.month)}`, body: doc.body };
  }
}

/** Reads an answer with a schema; a broken answer is BAD_RESPONSE with the first problems named. */
function answer<T>(body: unknown, schema: z.ZodType<T>, what: string): T {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  throw new ErpError('BAD_RESPONSE', `the ${what} answer is not what the contract says`, { details: r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(answer)'}: ${i.message}`.slice(0, MAX_TEXT)) });
}

/** A list answer: `{ items }`, a bare array, or one named array (`claims`, `days`, …). */
function listOf(body: unknown, key: string): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    for (const k of [key, 'items', 'data']) if (Array.isArray(o[k])) return o[k] as unknown[];
  }
  throw new ErpError('BAD_RESPONSE', `the ERP did not answer with a list of ${key}`);
}

/** The header an ERP sets when it answers a repeated Idempotency-Key from its record (common practice). */
export const IDEMPOTENT_REPLAY_HEADER = 'idempotent-replayed';

function erpIdOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  for (const k of ['erpOrderId', 'erpReturnId', 'erpId', 'id']) {
    const v = o[k];
    if ((typeof v === 'string' && v) || typeof v === 'number') return String(v).slice(0, MAX_TEXT);
  }
  return null;
}

export function createErpHttpClient(opts: ErpHttpOptions): ErpApi & { readonly baseUrl: string } {
  const base = opts.baseUrl.replace(/\/+$/, '') + ERP_API_BASE_PATH;

  async function get(path: string, query: Record<string, string | null | undefined>, o: ErpCallOptions = {}): Promise<unknown> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== '') qs.set(k, v);
    return (await call('GET', `${path}${qs.size ? `?${qs.toString()}` : ''}`, undefined, o)).body;
  }

  /** One request. A document carries its Idempotency-Key; the key itself is never put into a message. */
  async function call(method: string, pathAndQuery: string, payload: unknown, o: ErpCallOptions & { idempotencyKey?: string } = {}): Promise<{ status: number; body: unknown; replayed: boolean }> {
    const url = `${base}${pathAndQuery}`;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = o.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, o.timeoutMs)
      : undefined;
    let res: Response;
    const headers: Record<string, string> = { authorization: `Bearer ${opts.apiKey}`, accept: 'application/json' };
    if (payload !== undefined) headers['content-type'] = 'application/json';
    if (o.idempotencyKey) headers['idempotency-key'] = o.idempotencyKey;
    try {
      const f = opts.fetch ?? (globalThis.fetch as FetchLike);
      res = await f(url, { method, headers, signal: ctrl.signal, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
      if (!res.ok) throw await failure(res);
      const replayed = res.headers.get(IDEMPOTENT_REPLAY_HEADER) === 'true';
      if (res.status === 204) return { status: res.status, body: null, replayed };
      try {
        return { status: res.status, body: await res.json(), replayed };
      } catch {
        throw new ErpError('BAD_RESPONSE', 'the ERP answer is not JSON', { status: res.status });
      }
    } catch (e) {
      if (e instanceof ErpError) throw e;
      if (timedOut) throw new ErpError('TIMEOUT', `no answer within ${Math.round((o.timeoutMs ?? 0) / 1000)} s`);
      // The cause text of a network failure never carries the key (it is only in a header).
      throw new ErpError('NETWORK', e instanceof Error ? e.message.slice(0, MAX_TEXT) : 'the ERP could not be reached');
    } finally {
      clearTimeout(timer);
    }
  }

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

  // PR 607 — the v6 reads. A page that breaks the contract row by row reports the row (`rejected`); a whole answer that
  // breaks it is BAD_RESPONSE.
  const v6: ErpV6Reads = {
    async variantsByStyle(styleCode, o) {
      const out: ErpVariantRow[] = [];
      let cursor: string | null = null;
      const bad: string[] = [];
      for (let pages = 0; pages < 1000; pages++) {
        const page = pageOf(await get('/catalog/variants', { styleCode, cursor, limit: '1000' }, o));
        const r = rows(page.items, erpVariantRowSchema);
        out.push(...r.items);
        bad.push(...r.rejected.map((x) => x.reason));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      if (bad.length) throw new ErpError('BAD_RESPONSE', `${bad.length} SKU row(s) of the style break the contract`, { details: bad.slice(0, 20) });
      // The filter is the ERP's; a row of another style is never taken.
      return out.filter((v) => (v.styleCode ?? '').trim().toUpperCase() === styleCode.trim().toUpperCase());
    },
    async account(q = {}, o) {
      return answer(await get('/account', { from: q.from, to: q.to }, o), erpAccountSchema, 'account');
    },
    async returns(q, o) {
      const page = pageOf(await get('/returns', { updatedSince: iso(q.updatedSince), cursor: q.cursor, limit: String(q.limit) }, o));
      const r = rows(page.items, erpReturnItemSchema);
      return { items: r.items, rejected: r.rejected, nextCursor: page.nextCursor };
    },
    async returnsSummary(date, o) {
      return answer(await get('/returns/summary', { date }, o), erpReturnsSummarySchema, 'returns summary');
    },
    async returnClaims(q, o) {
      const r = rows(listOf(await get('/returns/claims', { from: q.from, to: q.to }, o), 'claims'), erpClaimSchema);
      if (r.rejected.length) throw new ErpError('BAD_RESPONSE', `${r.rejected.length} claim row(s) break the contract`, { details: r.rejected.map((x) => x.reason) });
      return r.items;
    },
    async exchanges(q, o) {
      const body = await get('/exchanges', { status: q.status, updatedSince: iso(q.updatedSince), cursor: q.cursor, limit: String(q.limit) }, o);
      const page = pageOf(body);
      const r = rows(page.items, erpExchangeSchema);
      const total = body && typeof body === 'object' && !Array.isArray(body) ? (body as { totalAtRisk?: unknown }).totalAtRisk : undefined;
      return { items: r.items, rejected: r.rejected, nextCursor: page.nextCursor, totalAtRisk: total === undefined || total === null ? '0' : String(total) };
    },
    async dailySummaries(q, o) {
      const r = rows(listOf(await get('/daily-summaries', { from: q.from, to: q.to }, o), 'days'), erpStoredSummarySchema);
      if (r.rejected.length) throw new ErpError('BAD_RESPONSE', `${r.rejected.length} stored day(s) break the contract`, { details: r.rejected.map((x) => x.reason) });
      return r.items;
    },
    async fixedCosts(o) {
      const r = rows(listOf(await get('/fixed-costs', {}, o), 'months'), erpFixedCostMonthSchema);
      if (r.rejected.length) throw new ErpError('BAD_RESPONSE', `${r.rejected.length} month(s) break the contract`, { details: r.rejected.map((x) => x.reason) });
      return r.items;
    },
    async costOfGoods(q, o) {
      const r = rows(listOf(await get('/cost-of-goods', { from: q.from, to: q.to }, o), 'rows'), erpCostOfGoodsSchema);
      if (r.rejected.length) throw new ErpError('BAD_RESPONSE', `${r.rejected.length} cost row(s) break the contract`, { details: r.rejected.map((x) => x.reason) });
      return r.items;
    },
    async switchOver(o) {
      return answer(await get('/switch-over', {}, o), erpSwitchOverSchema, 'switch-over');
    },
    async order(externalOrderId, o) {
      return answer(await get(`/orders/${encodeURIComponent(externalOrderId)}`, {}, o), erpOrderAnswerSchema, 'order');
    },
  };

  return {
    v6,
    provider: opts.provider,
    baseUrl: opts.baseUrl,

    async health(o) {
      const r = healthSchema.safeParse(await get('/health', {}, o));
      if (!r.success) throw new ErpError('BAD_RESPONSE', 'the health answer has no company or integration name');
      return r.data satisfies ErpHealth;
    },

    async variants(q, o): Promise<ErpPage<ErpVariantRow>> {
      const page = pageOf(await get('/catalog/variants', { updatedSince: iso(q.updatedSince), cursor: q.cursor, limit: String(q.limit), styleCode: q.styleCode }, o));
      const r = rows(page.items, erpVariantRowSchema);
      return { items: r.items, rejected: r.rejected, nextCursor: page.nextCursor };
    },

    async stock(q, o): Promise<ErpPage<ErpStockRow>> {
      const page = pageOf(await get('/stock', { updatedSince: iso(q.updatedSince), cursor: q.cursor, limit: String(q.limit), warehouseId: q.warehouseId }, o));
      const r = rows(page.items, erpStockRowSchema);
      return { items: r.items, rejected: r.rejected, nextCursor: page.nextCursor };
    },

    async stockForSku(sku, o) {
      const body = await get(`/stock/${encodeURIComponent(sku)}`, {}, o);
      let list: unknown[];
      if (Array.isArray(body)) list = body;
      else if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) list = (body as { items: unknown[] }).items;
      else if (body && typeof body === 'object' && Array.isArray((body as { warehouses?: unknown }).warehouses)) {
        const b = body as { sku?: unknown; warehouses: Record<string, unknown>[] };
        list = b.warehouses.map((w) => ({ sku: b.sku ?? sku, ...w }));
      } else list = [body];
      const r = rows(list, erpStockRowSchema);
      if (r.rejected.length) throw new ErpError('BAD_RESPONSE', `the stock answer for one SKU has ${r.rejected.length} broken row(s)`, { details: r.rejected.map((x) => x.reason) });
      return r.items;
    },

    async push(doc, o): Promise<ErpPushResult> {
      if (!o?.idempotencyKey) throw new ErpError('INVALID_REQUEST', 'every document needs an Idempotency-Key');
      const route = documentRoute(doc);
      const r = await call(route.method, route.path, route.body, o);
      return { erpId: erpIdOf(r.body), status: r.status, body: r.body, replayed: r.replayed };
    },
  };
}
