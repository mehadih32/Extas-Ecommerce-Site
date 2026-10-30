// PR 620 (CN-028, docs/erp/site-changes-v6.md §2.7) — the ERP's own calls to the shop: `GET /erp-api/top-products` and
// `GET /erp-api/customers`, made when the owner clicks "Top products" or "Customers" in the ERP. This file decides who
// is asking and keeps the log; the answers themselves are read through @extas/metrics and @extas/customers by the web
// route (apps/web lib/erp-site-api.ts).
//
// - Who is asking is the store whose secret verifies the signature (`X-Extas-Signature: sha256=<hex>` over
//   `METHOD\nPATH?QUERY\nTIMESTAMP`, @extas/adapters `verifyErpRequest`), never anything in the request. The secret is the
//   store's own signing secret (`extasErp.signingSecret`, the optional third key, PR 620), or, while that is empty, its
//   webhook secret (the contract: "the same webhook secret as its webhooks"). Only a store that speaks contract v6 with
//   its own ERP connection (CN-029 §16, `v6LinkFor`) and has switched the calls on (`erp.siteApi.enabled`, off by
//   default) is asked; in v5 nothing changes. A secret that verifies for two stores is refused (SHARED_SECRET).
// - Refusals, in this order. From the request alone, touching no database, setting or vault (qa-gate 30 Oct): 404
//   another path, 405 another method, 401 unsigned, 401 a signature or timestamp that can never verify. Then 429 when
//   `erp.siteApi.refusedPerMinute` calls were already refused this minute (nothing is looked up either). Then 401 STALE,
//   a well-formed timestamp older or newer than `erp.siteApi.maxAgeSeconds` from the shop's clock (only that setting is
//   read; qa-gate re-check). Then, after the store lookup: 503 no store has the calls on, 401 no secret / bad signature / older or newer than
//   `erp.siteApi.maxAgeSeconds` (the contract's 5 minutes) from the shop's clock / a secret two stores share.
// - Only a verified caller's call gets its own row: a SecurityEvent (`erp.site-call`, append-only) with the store and its
//   link, the call, the answer's status and code, how many rows went out and whether a search was given; never a
//   customer, a number, a search text or a secret. A refused call writes nothing of its own: the running app counts
//   refusals by address and reason (a fixed, small set of counters, `ErpSiteGuard`) and keeps them as one summary row
//   (`erp.site-call.refused`) at most every `erp.siteApi.refusedLogMinutes`, written when a call reaches the store
//   lookup or the admin opens the card. So nobody on the internet can fill the table or push a store's real calls out
//   of its list.
import type { Prisma } from '@extas/db/client';
import { erpSignatureShape, EXTAS_ERP_PROVIDER, verifyErpRequest, type SignatureCheck } from '@extas/adapters';
import { nowOf, setting, type Db } from './context';
import { v6LinkFor } from './erp-link';
import { isV6 } from './erp-model';
import { storesWithErp } from './erp-mode';
import type { WebhookDeps } from './webhook';

/** The two calls, by their path under the shop's own address. */
export const ERP_SITE_PATHS = { '/erp-api/top-products': 'top-products', '/erp-api/customers': 'customers' } as const;
export type ErpSiteEndpoint = (typeof ERP_SITE_PATHS)[keyof typeof ERP_SITE_PATHS];
/** Where the ERP's shop settings point: the shop's address plus this. */
export const ERP_SITE_BASE_PATH = '/erp-api';

export type ErpSiteCode =
  | 'OK'
  | 'OFF'
  | 'NOT_FOUND'
  | 'METHOD'
  | 'NO_SECRET'
  | 'UNSIGNED'
  | 'BAD_SIGNATURE'
  | 'STALE'
  | 'SHARED_SECRET'
  | 'RATE_LIMITED'
  | 'BAD_QUERY'
  | 'SERVER_ERROR';

/** The SecurityEvent kind of a verified caller's call. */
export const ERP_SITE_CALL_EVENT = 'erp.site-call';
/** The SecurityEvent kind of a summary of refused calls (no store: nobody proved who was asking). */
export const ERP_SITE_REFUSED_EVENT = 'erp.site-call.refused';

/**
 * The running app's own record of refused calls (one per process; tests make their own): a counter per address and
 * reason (at most 3 × 12 keys, so it cannot grow), when they were last written, and how many calls were refused after
 * a store lookup this minute. The two limits are the settings as last read (null until a call first reaches the lookup).
 */
export interface ErpSiteGuard {
  pending: Map<string, number>;
  pendingFrom: number | null;
  flushedAt: number;
  minuteStart: number;
  refusedThisMinute: number;
  perMinute: number | null;
  logMinutes: number | null;
}

export const newErpSiteGuard = (): ErpSiteGuard => ({ pending: new Map(), pendingFrom: null, flushedAt: 0, minuteStart: 0, refusedThisMinute: 0, perMinute: null, logMinutes: null });

const holder = globalThis as unknown as { __erpSiteGuard?: ErpSiteGuard };
/** This process's guard. */
export const erpSiteGuard = (): ErpSiteGuard => (holder.__erpSiteGuard ??= newErpSiteGuard());

const MINUTE_MS = 60_000;

export interface ErpSiteCall {
  method: string;
  /** The path, without the query. */
  path: string;
  /** The query exactly as sent, without the `?` ('' when none). */
  query: string;
  signature: string | null;
  timestamp: string | null;
}

export type ErpSiteCaller =
  | { ok: true; endpoint: ErpSiteEndpoint; storeId: number; linkId: string; integrationId: string }
  | { ok: false; endpoint: ErpSiteEndpoint | null; status: number; code: ErpSiteCode };

const endpointOf = (path: string): ErpSiteEndpoint | null => (Object.hasOwn(ERP_SITE_PATHS, path) ? ERP_SITE_PATHS[path as keyof typeof ERP_SITE_PATHS] : null);

const REFUSAL: Record<Extract<SignatureCheck, { ok: false }>['reason'], ErpSiteCode> = { missing: 'UNSIGNED', malformed: 'BAD_SIGNATURE', stale: 'STALE', mismatch: 'BAD_SIGNATURE' };

interface Candidate {
  storeId: number;
  secret: string;
  integrationId: string;
}

/** The stores that may be asked (v6, their own connection, the calls on) with the secret each one's calls are signed with. */
async function candidates(deps: WebhookDeps): Promise<{ on: number; keys: Candidate[] }> {
  let on = 0;
  const keys: Candidate[] = [];
  for (const s of await storesWithErp(deps)) {
    if (!(await isV6(deps, s.storeId)) || !(await setting(deps, s.storeId, 'erp.siteApi.enabled'))) continue;
    on += 1;
    const where = { storeId: s.storeId, provider: EXTAS_ERP_PROVIDER };
    const sec = (await deps.connections.secretOf('ERP', 'signingSecret', where).catch(() => null)) ?? (await deps.connections.secretOf('ERP', 'webhookSecret', where).catch(() => null));
    // §16: only the store's own connection, never an installation-wide one.
    if (!sec || sec.storeId !== s.storeId) continue;
    keys.push({ storeId: s.storeId, secret: sec.value, integrationId: sec.integrationId });
  }
  return { on, keys };
}

/** Counts one refusal in the guard (never written by itself). */
function refuse(guard: ErpSiteGuard, now: number, endpoint: ErpSiteEndpoint | null, status: number, code: ErpSiteCode): ErpSiteCaller {
  const key = `${endpoint ?? 'other'} ${code}`;
  guard.pending.set(key, (guard.pending.get(key) ?? 0) + 1);
  guard.pendingFrom ??= now;
  return { ok: false, endpoint, status, code };
}

/** What the request alone says, reading nothing: null when it may go on to the store lookup. */
function fromRequest(call: ErpSiteCall): { endpoint: ErpSiteEndpoint | null; status: number; code: ErpSiteCode } | null {
  const endpoint = endpointOf(call.path);
  if (!endpoint) return { endpoint, status: 404, code: 'NOT_FOUND' };
  if (call.method !== 'GET') return { endpoint, status: 405, code: 'METHOD' };
  const shape = erpSignatureShape(call.signature, call.timestamp);
  if (!shape.ok) return { endpoint, status: 401, code: REFUSAL[shape.reason] };
  return null;
}

/**
 * The refusal the request alone earns (counted in the guard; nothing is read), or null: lets a route answer before it
 * builds any connection or reads any setting.
 */
export function erpSiteRequestRefusal(call: ErpSiteCall, at: Date, guard: ErpSiteGuard = erpSiteGuard()): Extract<ErpSiteCaller, { ok: false }> | null {
  const early = fromRequest(call);
  return early ? (refuse(guard, at.getTime(), early.endpoint, early.status, early.code) as Extract<ErpSiteCaller, { ok: false }>) : null;
}

/**
 * Who is asking (see the file header). Reads no customer and no figure. Refusals from the request alone, and the
 * cut-off after too many refusals this minute, read nothing at all.
 */
export async function checkErpSiteCall(deps: WebhookDeps, call: ErpSiteCall, guard: ErpSiteGuard = erpSiteGuard()): Promise<ErpSiteCaller> {
  const now = nowOf(deps).getTime();
  const early = fromRequest(call);
  if (early) return refuse(guard, now, early.endpoint, early.status, early.code);
  const endpoint = endpointOf(call.path)!;
  if (now - guard.minuteStart >= MINUTE_MS || now < guard.minuteStart) {
    guard.minuteStart = now;
    guard.refusedThisMinute = 0;
  }
  if (guard.perMinute !== null && guard.refusedThisMinute >= guard.perMinute) return refuse(guard, now, endpoint, 429, 'RATE_LIMITED');
  // A signature too old or too far ahead is refused before any store, connection or vault is read.
  const maxAge = await setting(deps, null, 'erp.siteApi.maxAgeSeconds');
  if (!erpSignatureShape(call.signature, call.timestamp, { maxAgeSeconds: maxAge, now }).ok) {
    guard.refusedThisMinute += 1;
    return refuse(guard, now, endpoint, 401, 'STALE');
  }
  const [{ on, keys }, perMinute, logMinutes] = await Promise.all([candidates(deps), setting(deps, null, 'erp.siteApi.refusedPerMinute'), setting(deps, null, 'erp.siteApi.refusedLogMinutes')]);
  guard.perMinute = perMinute;
  guard.logMinutes = logMinutes;
  const verdict = await (async (): Promise<ErpSiteCaller> => {
    if (!on) return { ok: false, endpoint, status: 503, code: 'OFF' };
    if (!keys.length) return { ok: false, endpoint, status: 401, code: 'NO_SECRET' };
    const pathAndQuery = call.query ? `${call.path}?${call.query}` : call.path;
    const matches: Candidate[] = [];
    let refusal: ErpSiteCode = 'BAD_SIGNATURE';
    for (const k of keys) {
      const r = verifyErpRequest({ secret: k.secret, method: 'GET', pathAndQuery, signature: call.signature, timestamp: call.timestamp, maxAgeSeconds: maxAge, now });
      if (r.ok) matches.push(k);
      else refusal = REFUSAL[r.reason];
    }
    if (matches.length > 1) return { ok: false, endpoint, status: 401, code: 'SHARED_SECRET' };
    const match = matches[0];
    if (!match) return { ok: false, endpoint, status: 401, code: refusal };
    const link = await v6LinkFor(deps, match.storeId, match.integrationId);
    if (!link) return { ok: false, endpoint, status: 401, code: 'NO_SECRET' };
    return { ok: true, endpoint, storeId: match.storeId, linkId: link.id, integrationId: match.integrationId };
  })();
  if (!verdict.ok) {
    guard.refusedThisMinute += 1;
    refuse(guard, now, verdict.endpoint, verdict.status, verdict.code);
  }
  // The store lookup already read the database: the counted refusals may be written now (at most once a window).
  await flushErpSiteRefusals(deps.db, guard, new Date(now)).catch(() => false);
  return verdict;
}

/**
 * Writes the counted refusals as one summary row (`erp.site-call.refused`), when there are any and the last one is at
 * least `erp.siteApi.refusedLogMinutes` old (or `force`: the admin opened the card). Returns whether it wrote.
 */
export async function flushErpSiteRefusals(db: Db, guard: ErpSiteGuard, at: Date, opts: { force?: boolean } = {}): Promise<boolean> {
  if (!guard.pending.size) return false;
  const now = at.getTime();
  if (!opts.force && guard.logMinutes !== null && guard.flushedAt && now - guard.flushedAt < guard.logMinutes * MINUTE_MS) return false;
  const counts = [...guard.pending.entries()].map(([k, n]) => {
    const [endpoint, code] = k.split(' ');
    return { endpoint: endpoint === 'other' ? null : endpoint!, code: code!, n };
  });
  const from = new Date(guard.pendingFrom ?? now);
  guard.pending = new Map();
  guard.pendingFrom = null;
  guard.flushedAt = now;
  const details: Prisma.InputJsonObject = { from: from.toISOString(), to: at.toISOString(), counts };
  await db.securityEvent.create({ data: { storeId: null, kind: ERP_SITE_REFUSED_EVENT, severity: 'warning', details, createdAt: at } });
  return true;
}

export interface ErpSiteRefusalSum {
  total: number;
  byCode: Partial<Record<ErpSiteCode, number>>;
  /** The newest summary's end, null when none. */
  lastAt: Date | null;
}

/** The refused calls summed since a moment (from the summary rows; no store: nobody proved who was asking). */
export async function erpSiteRefusals(db: Db, since: Date): Promise<ErpSiteRefusalSum> {
  const rows = await db.securityEvent.findMany({ where: { kind: ERP_SITE_REFUSED_EVENT, createdAt: { gte: since } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { details: true, createdAt: true } });
  const out: ErpSiteRefusalSum = { total: 0, byCode: {}, lastAt: rows[0]?.createdAt ?? null };
  for (const r of rows) {
    const counts = ((r.details ?? {}) as { counts?: unknown }).counts;
    if (!Array.isArray(counts)) continue;
    for (const c of counts as { code?: unknown; n?: unknown }[]) {
      if (typeof c.code !== 'string' || typeof c.n !== 'number' || !Number.isSafeInteger(c.n) || c.n < 0) continue;
      out.total += c.n;
      const code = c.code as ErpSiteCode;
      out.byCode[code] = (out.byCode[code] ?? 0) + c.n;
    }
  }
  return out;
}

export interface ErpSiteCallEntry {
  /** The verified caller's store (refused calls are only counted: `ErpSiteGuard`). */
  storeId: number;
  linkId?: string | null;
  endpoint: ErpSiteEndpoint | null;
  status: number;
  code: ErpSiteCode | string;
  /** Rows that went out (products or customers). */
  rows?: number | null;
  /** A search was given (never the text). */
  searched?: boolean;
  at: Date;
}

/** Logs one verified caller's call (append-only). */
export async function logErpSiteCall(db: Db, e: ErpSiteCallEntry): Promise<void> {
  const details: Prisma.InputJsonObject = { linkId: e.linkId ?? null, endpoint: e.endpoint, status: e.status, code: e.code, rows: e.rows ?? null, searched: e.searched ?? false };
  await db.securityEvent.create({ data: { storeId: e.storeId, kind: ERP_SITE_CALL_EVENT, severity: e.status < 300 ? 'info' : 'warning', details, createdAt: e.at } });
}

export interface ErpSiteCallView {
  at: Date;
  storeId: number | null;
  endpoint: string | null;
  status: number;
  code: string;
  rows: number | null;
  searched: boolean;
}

/** The latest calls a store's admin sees: its own verified callers' calls only (refusals are summed apart). Newest first. */
export async function erpSiteCalls(db: Db, storeId: number, limit: number): Promise<ErpSiteCallView[]> {
  const rows = await db.securityEvent.findMany({
    where: { kind: ERP_SITE_CALL_EVENT, storeId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { storeId: true, details: true, createdAt: true },
  });
  return rows.map((r) => {
    const d = (r.details ?? {}) as Record<string, unknown>;
    return {
      at: r.createdAt,
      storeId: r.storeId,
      endpoint: typeof d.endpoint === 'string' ? d.endpoint : null,
      status: typeof d.status === 'number' ? d.status : 0,
      code: typeof d.code === 'string' ? d.code : '',
      rows: typeof d.rows === 'number' ? d.rows : null,
      searched: d.searched === true,
    };
  });
}
