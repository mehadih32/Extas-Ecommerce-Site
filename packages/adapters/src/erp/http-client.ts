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
import { z } from 'zod';
import { ErpError, erpCodeForStatus, type ErpApi, type ErpCallOptions, type ErpHealth, type ErpPage, type ErpStockRow, type ErpVariantRow } from './contract';

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
  updatedAt: dateText,
});

const variantSchema = z.object({
  sku: z.string().trim().min(1),
  barcode: optText,
  styleCode: optText,
  styleName: optText,
  color: optText,
  size: optText,
  retailPrice: decimalText.nullish().transform((v) => v ?? null),
  avgCost: decimalText.nullish().transform((v) => v ?? null),
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
  try {
    const b = (await res.json()) as { error?: { code?: unknown; message?: unknown; details?: unknown } };
    if (b?.error) {
      erpCode = clip(b.error.code);
      message = clip(b.error.message) ?? message;
      const d = b.error.details;
      if (Array.isArray(d)) details = d.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, MAX_TEXT)).slice(0, 50);
      else if (d && typeof d === 'object') details = [JSON.stringify(d).slice(0, MAX_TEXT)];
    }
  } catch {
    // Not JSON: the status alone tells the story.
  }
  return new ErpError(erpCodeForStatus(res.status), message, { status: res.status, erpCode, details, retryAfterMs: retryAfterMs(res.headers.get('retry-after')) });
}

export function createErpHttpClient(opts: ErpHttpOptions): ErpApi & { readonly baseUrl: string } {
  const base = opts.baseUrl.replace(/\/+$/, '') + ERP_API_BASE_PATH;

  async function get(path: string, query: Record<string, string | null | undefined>, o: ErpCallOptions = {}): Promise<unknown> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== '') qs.set(k, v);
    const url = `${base}${path}${qs.size ? `?${qs.toString()}` : ''}`;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = o.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, o.timeoutMs)
      : undefined;
    let res: Response;
    try {
      const f = opts.fetch ?? (globalThis.fetch as FetchLike);
      res = await f(url, { method: 'GET', headers: { authorization: `Bearer ${opts.apiKey}`, accept: 'application/json' }, signal: ctrl.signal });
      if (!res.ok) throw await failure(res);
      try {
        return await res.json();
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

  return {
    provider: opts.provider,
    baseUrl: opts.baseUrl,

    async health(o) {
      const r = healthSchema.safeParse(await get('/health', {}, o));
      if (!r.success) throw new ErpError('BAD_RESPONSE', 'the health answer has no company or integration name');
      return r.data satisfies ErpHealth;
    },

    async variants(q, o): Promise<ErpPage<ErpVariantRow>> {
      const page = pageOf(await get('/catalog/variants', { updatedSince: iso(q.updatedSince), cursor: q.cursor, limit: String(q.limit) }, o));
      const r = rows(page.items, variantSchema);
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
  };
}
