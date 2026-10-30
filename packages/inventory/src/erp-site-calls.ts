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
//   `erp.siteApi.refusedPerMinute` calls were already refused this minute from the same address (nothing is looked up
//   either), unless the call verifies with a secret the last lookup found (p3 review: the real ERP is not locked out by
//   others' refusals; round 2: after a secret change, for at most `system.integrationKeyCacheSeconds`; erp-call-budget.ts).
//   Then 401 STALE,
//   a well-formed timestamp older or newer than `erp.siteApi.maxAgeSeconds` from the shop's clock (only that setting is
//   read; qa-gate re-check). Then, after the store lookup: 503 no store has the calls on, 401 no secret / bad signature / older or newer than
//   `erp.siteApi.maxAgeSeconds` (the contract's 5 minutes) from the shop's clock / a secret two stores share.
// - Only a verified caller's call gets its own row: a SecurityEvent (`erp.site-call`, append-only) with the store and its
//   link, the call, the answer's status and code, how many rows went out and whether a search was given; never a
//   customer, a number, a search text or a secret. A refused call writes nothing of its own: the running app counts
//   refusals by endpoint and reason (a fixed, small set of counters, `ErpSiteGuard`), and per client address for the
//   cut-off (bounded, `RefusalBudget`), and keeps the counts by reason as one summary row
//   (`erp.site-call.refused`) at most every `erp.siteApi.refusedLogMinutes`, written when a call reaches the store
//   lookup or the admin opens the card. So nobody on the internet can fill the table or push a store's real calls out
//   of its list.
import type { Prisma } from '@extas/db/client';
import { erpSignatureShape, EXTAS_ERP_PROVIDER, verifyErpRequest, type SignatureCheck } from '@extas/adapters';
import { admit, countRefusal, giveBack, newRefusalBudget, overBudget, probeOpen, rememberVerified, signedByKnown, type RefusalBudget } from './erp-call-budget';
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
 * The running app's own record of refused calls (one per process; tests make their own): a counter per endpoint and
 * reason (at most 3 × 12 keys, so it cannot grow) and when they were last written; and (p3 review) the refusals after a
 * store lookup this minute per client address, with the secrets that lookup found (`budget`, erp-call-budget.ts). The
 * two limits are the settings as last read (null until a call first reaches the lookup).
 */
export interface ErpSiteGuard {
  /** The SecurityEvent kind its summary rows are written as (PR 608 · p3 review: the webhook keeps a guard of its own). */
  kind: string;
  pending: Map<string, number>;
  pendingFrom: number | null;
  flushedAt: number;
  budget: RefusalBudget;
  perMinute: number | null;
  logMinutes: number | null;
  /** Round 2: `system.integrationKeyCacheSeconds` as last read (how often an over-limit call may refresh the secrets). */
  refreshSeconds: number | null;
}

export const newErpSiteGuard = (kind: string = ERP_SITE_REFUSED_EVENT): ErpSiteGuard => ({ kind, pending: new Map(), pendingFrom: null, flushedAt: 0, budget: newRefusalBudget(), perMinute: null, logMinutes: null, refreshSeconds: null });

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
  /** p3 review: the client's address (CF-Connecting-IP, else the proxy's), for the per-address cut-off; null = shared. */
  address?: string | null;
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

/** Counts one refusal by endpoint and reason in the guard (never written by itself; a fixed, small set of keys). */
export function noteErpRefusal(guard: ErpSiteGuard, now: number, endpoint: string | null, code: string): void {
  const key = `${endpoint ?? 'other'} ${code}`;
  guard.pending.set(key, (guard.pending.get(key) ?? 0) + 1);
  guard.pendingFrom ??= now;
}

function refuse(guard: ErpSiteGuard, now: number, endpoint: ErpSiteEndpoint | null, status: number, code: ErpSiteCode): ErpSiteCaller {
  noteErpRefusal(guard, now, endpoint, code);
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
  const address = call.address ?? null;
  const pathAndQuery = call.query ? `${call.path}?${call.query}` : call.path;
  // p3 review: the cut-off is this address's own, and a call signed with a secret the last lookup found passes it (the
  // HMAC only, in memory; its age and its store are checked below as for every call).
  const signedKnown = (secret: string) => verifyErpRequest({ secret, method: 'GET', pathAndQuery, signature: call.signature, timestamp: call.timestamp, maxAgeSeconds: Number.POSITIVE_INFINITY, now }).ok;
  // Cut off already (the limits as last read): nothing is read at all.
  if (overBudget(guard.budget, address, now, guard.perMinute) && !signedByKnown(guard.budget, signedKnown) && !probeOpen(guard.budget, now, guard.refreshSeconds)) return refuse(guard, now, endpoint, 429, 'RATE_LIMITED');
  // The limits and the allowed age: settings only, before any store, connection or vault is read.
  const [maxAge, perMinute, logMinutes, refreshSeconds] = await Promise.all([
    setting(deps, null, 'erp.siteApi.maxAgeSeconds'),
    setting(deps, null, 'erp.siteApi.refusedPerMinute'),
    setting(deps, null, 'erp.siteApi.refusedLogMinutes'),
    setting(deps, null, 'system.integrationKeyCacheSeconds'),
  ]);
  Object.assign(guard, { perMinute, logMinutes, refreshSeconds });
  // A signature too old or too far ahead is refused before any store, connection or vault is read (counted for its
  // address; it never takes the refresh call, which only a call that reaches the lookup may use).
  if (!erpSignatureShape(call.signature, call.timestamp, { maxAgeSeconds: maxAge, now }).ok) {
    if (!overBudget(guard.budget, address, now, perMinute)) countRefusal(guard.budget, address, now);
    return refuse(guard, now, endpoint, 401, 'STALE');
  }
  // Round 2: the slot is taken now, with no await before it, so calls at the same moment cannot all pass the limit.
  const slot = admit(guard.budget, address, now, { perMinute, refreshSeconds }, signedKnown);
  if (!slot) return refuse(guard, now, endpoint, 429, 'RATE_LIMITED');
  const lookup = async (): Promise<ErpSiteCaller> => {
    const { on, keys } = await candidates(deps);
    guard.budget.known = keys.map((k) => k.secret);
    if (!on) return { ok: false, endpoint, status: 503, code: 'OFF' };
    if (!keys.length) return { ok: false, endpoint, status: 401, code: 'NO_SECRET' };
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
  };
  let verdict: ErpSiteCaller;
  try {
    verdict = await lookup();
  } catch (e) {
    // Round 3: a lookup that throws (say, a short database outage) proved nothing about the caller: its slot is given
    // back, so an outage never uses up an address's budget.
    giveBack(guard.budget, slot);
    throw e;
  }
  // A verified call gives its slot back; a refused one keeps it (it was counted when it was taken).
  if (verdict.ok) {
    giveBack(guard.budget, slot);
    rememberVerified(guard.budget, slot);
  } else refuse(guard, now, verdict.endpoint, verdict.status, verdict.code);
  // The store lookup already read the database: the counted refusals may be written now (at most once a window).
  await flushErpSiteRefusals(deps.db, guard, new Date(now)).catch(() => false);
  return verdict;
}

/**
 * Writes the counted refusals as one summary row (the guard's kind: `erp.site-call.refused`, or the webhook's
 * `erp.webhook.refused`), when there are any and the last one is at least `erp.siteApi.refusedLogMinutes` old (or
 * `force`: the admin opened the card). Returns whether it wrote.
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
  await db.securityEvent.create({ data: { storeId: null, kind: guard.kind, severity: 'warning', details, createdAt: at } });
  return true;
}

export interface ErpSiteRefusalSum {
  total: number;
  byCode: Partial<Record<ErpSiteCode, number>>;
  /** The newest summary's end, null when none. */
  lastAt: Date | null;
}

/**
 * The refused calls summed since a moment (from the summary rows; no store: nobody proved who was asking). `kind` picks
 * the summaries (p3 review round 2: the webhook's `erp.webhook.refused` too, shown apart on the same card).
 */
export async function erpSiteRefusals(db: Db, since: Date, kind: string = ERP_SITE_REFUSED_EVENT): Promise<ErpSiteRefusalSum> {
  const rows = await db.securityEvent.findMany({ where: { kind, createdAt: { gte: since } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { details: true, createdAt: true } });
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
