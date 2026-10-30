// PR 196 — the ERP → shop webhooks (docs/ERP-API-CONTRACT.md: `stock.changed`, `variant.changed`). Two halves:
//
// 1. `receiveErpWebhook` (the web route POST /api/erp/webhook): checks and stores, never applies.
//    - p3 review (owner rule: unsigned or stale ERP calls are refused before any database read; refusals are counted
//      and rate-limited). In this order: no or a malformed signature or timestamp → 401, reading nothing at all (the
//      route answers it before it builds anything, `erpWebhookRequestRefusal`); past `erp.siteApi.refusedPerMinute`
//      refusals this minute from the same address → 429, reading nothing, unless the body verifies with a secret the
//      last lookup found (erp-call-budget.ts: the real ERP is not locked out by others; round 2: after a secret change,
//      for at most `system.integrationKeyCacheSeconds`); then the settings only:
//      `erp.webhook.enabled` off → 503, a body over `erp.webhook.maxBodyKb` → 413, a timestamp older or newer than
//      `erp.webhook.maxAgeSeconds` → 401 STALE. Refusals are only counted (an `ErpSiteGuard` of its own, one summary
//      row `erp.webhook.refused` per `erp.siteApi.refusedLogMinutes`); the route answers every 401 with one code.
//    - The signature (X-Extas-Signature over the raw body) is then checked with the webhook secret of each ERP
//      connection a store uses (the vault's `extasErp.webhookSecret`, typed in by the owner on Keys & connections).
//      **No secret anywhere → every request is refused (401).** A wrong signature → 401. Nothing unsigned is ever
//      stored. p3 review: a body that verifies with the secrets of two connections is refused (401 SHARED_SECRET) for
//      every event type, v5 too: either store could have sent it.
//    - A verified event is logged once in WebhookEvent (source `erp`), RECEIVED, with the connection it came through.
//      An event id seen again within `erp.webhook.dedupeHours` through the same connection is the same event: answered
//      200, not stored again (the ERP retries for up to 24 h). p3 review: the key is the connection's
//      (`<integrationId>:<event id>`), so two stores' ERPs may use one id; a row kept before under the bare id still
//      counts for its own connection. Unknown event types are logged IGNORED; a broken event FAILED (both answered).
// 2. `processErpWebhook` (the background worker, PR 6 job `erp.webhook.process`): applies one RECEIVED event to every
//    store whose ERP link is that connection, then marks it PROCESSED, or IGNORED with the reason.
//    - stock.changed goes through the stock pull's own `applyPage`: a row older than what the shop holds is ignored
//      (out of order: a late "5" never overwrites a newer "3"), and the movement key comes from the ERP's state, so
//      the same row by webhook and again by the poll moves stock once. Low stock and the publish check follow.
//    - variant.changed refreshes the ERP mirror of the variant (barcode, the ERP's retail price and average cost,
//      `erpUpdatedAt`), never the shop's own sale price; an older change than the one held is ignored the same way.
//      PR 607: in `erp.model` v6 the ERP's retail price and average cost are never read (owner answer Q7).
//      PR 609: in v6 its shop price is the buying price ("bought from ERP at"): a change is kept and flagged for the
//      admin (shop-price.ts), never a change to the selling price.
//    - Processing an event twice changes nothing the second time (its status is checked first, and the stock path is
//      idempotent on its own).
// 3. PR 608 (CN-028): a v6 event (delivery.identified, return.*, order.line.*, exchange.*, summary.missing, account.*,
//    shop-price.changed, payment.recorded) signed with the webhook secret of a v6 store's OWN connection goes into that
//    store's permanent ERP event ledger instead (erp-events.ts: once by its eventId, forever, no 72-hour window), and
//    the job `inventory.erp.applyEvents` applies it. Otherwise it is logged IGNORED as before. CN-029 §16: the store is
//    the one whose secret verified the signature, never guessed from the event's content; a v6 event that verifies
//    with the secrets of two connections is refused (401 SHARED_SECRET: every store must have a secret of its own).
//    p3 review: its eventId is the signed body's own (`X-Extas-Delivery` may only repeat it, PR 607).
// The poll (`inventory.erp.pullStock`, every `erp.sync.stockPollMinutes`) stays the fallback: a missed webhook never
// leaves stock wrong for longer than one poll. On the practice ERP a webhook is applied only with
// `erp.mock.stockEnabled` (guard path `webhook.apply`), so test events never reach real stock by accident.
import type { Prisma } from '@extas/db/client';
import { erpSignatureShape, EXTAS_ERP_PROVIDER, parseErpV6Event, parseErpWebhookEvent, verifyErpSignature, type Connections, type ErpStockRow, type ErpVariantRow, type ErpWebhookParse } from '@extas/adapters';
import { nowOf, setting, type InventoryDeps } from './context';
import { admit, countRefusal, giveBack, overBudget, probeOpen, signedByKnown } from './erp-call-budget';
import { flushErpSiteRefusals, newErpSiteGuard, noteErpRefusal, type ErpSiteGuard } from './erp-site-calls';
import { storesWithErp } from './erp-mode';
import { currencyDigits } from './erp-push';
import { isV6 } from './erp-model';
import { decimalToMinor } from './money';
import { applyShopPrice } from './shop-price';
import { recordBrokenErpEvent, recordErpEvent } from './erp-events';
import { v6LinkFor } from './erp-link';
import { behaviourOf, resolveErp } from './guard';
import { sellableKinds } from './locations';
import { afterStockChange, applyPage, erpStockLocations } from './stock-pull';

export const ERP_WEBHOOK_SOURCE = 'erp';
/** The worker job that applies one stored event (packages/jobs catalogue). */
export const ERP_WEBHOOK_JOB = 'erp.webhook.process';

/** The receiver also reads the webhook secret of the connection (connections.secretOf). */
export interface WebhookDeps extends InventoryDeps {
  connections: Pick<Connections, 'use' | 'secretOf'>;
}

export interface WebhookRequest {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  /** The `Idempotency-Key` header: the event id when the body has none. */
  idempotencyKey: string | null;
  /** PR 608: the `X-Extas-Delivery` header of a v6 event (it may only repeat the body's eventId, PR 607). */
  deliveryId?: string | null;
  /** p3 review: the sender's address (CF-Connecting-IP, else the proxy's), for the per-address cut-off; null = shared. */
  address?: string | null;
}

export type WebhookCode =
  | 'ACCEPTED'
  | 'DUPLICATE'
  | 'IGNORED_TYPE'
  | 'OFF'
  | 'TOO_LARGE'
  | 'NO_SECRET'
  | 'UNSIGNED'
  | 'STALE'
  | 'BAD_SIGNATURE'
  /** CN-029 §16: an event that verifies with the secrets of two connections: no store can be told apart (p3 review: any type). */
  | 'SHARED_SECRET'
  /** p3 review: too many refusals this minute from this address (nothing was read). */
  | 'RATE_LIMITED'
  | 'BAD_JSON'
  | 'BAD_PAYLOAD'
  /** PR 608: a v6 event for a v6 store that does not read as v6: kept in the ledger as FAILED (health panel), 202. */
  | 'KEPT_FAILED'
  /** PR 608: a known eventId with another body: never applied, counted on the stored event (health panel), 202. */
  | 'BODY_CHANGED'
  | 'NO_EVENT_ID';

export interface WebhookAnswer {
  status: 200 | 202 | 400 | 401 | 413 | 429 | 503;
  code: WebhookCode;
  /** The stored event (WebhookEvent.id), when there is one. */
  eventId?: string;
}

/** What the stored payload holds: the connection the event came through, and the event exactly as sent. */
interface StoredPayload {
  integrationId: string;
  event: unknown;
}

interface Candidate {
  secret: string;
  integrationId: string;
  storeId: number | null;
}

/** The webhook secrets of the ERP connections the stores use, one per connection. */
async function candidates(deps: WebhookDeps): Promise<Candidate[]> {
  const out = new Map<string, Candidate>();
  for (const s of await storesWithErp(deps)) {
    const setup = await deps.db.storeErpMapping.findUnique({ where: { storeId: s.storeId }, select: { integrationId: true } });
    let provider = EXTAS_ERP_PROVIDER;
    if (setup?.integrationId) {
      const row = await deps.db.integration.findUnique({ where: { id: setup.integrationId }, select: { provider: true } });
      if (!row) continue;
      provider = row.provider;
    } else if (s.mode !== 'EXTAS_ERP') continue;
    const sec = await deps.connections.secretOf('ERP', 'webhookSecret', { storeId: s.storeId, provider }).catch(() => null);
    if (sec && !out.has(sec.integrationId)) out.set(sec.integrationId, { secret: sec.value, integrationId: sec.integrationId, storeId: sec.storeId });
  }
  return [...out.values()];
}

const REFUSAL: Record<'missing' | 'malformed' | 'stale' | 'mismatch', WebhookCode> = { missing: 'UNSIGNED', malformed: 'BAD_SIGNATURE', stale: 'STALE', mismatch: 'BAD_SIGNATURE' };

/** p3 review: the SecurityEvent kind of a summary of refused webhooks (no store: nobody proved who was sending). */
export const ERP_WEBHOOK_REFUSED_EVENT = 'erp.webhook.refused';
/** A refusal counter of the webhook's own (tests make their own; the app keeps one per process). */
export const newErpWebhookGuard = (): ErpSiteGuard => newErpSiteGuard(ERP_WEBHOOK_REFUSED_EVENT);
const holder = globalThis as unknown as { __erpWebhookGuard?: ErpSiteGuard };
/** This process's webhook guard. */
export const erpWebhookGuard = (): ErpSiteGuard => (holder.__erpWebhookGuard ??= newErpWebhookGuard());

/**
 * The refusal the request's two headers alone earn, counted and reading nothing (the route calls it before it builds
 * anything or reads the body), or null. 401 for no or a malformed signature or timestamp; 429 when this address is past
 * its refusals this minute, no secret is known yet that could let a signed body through (with one known, the body is
 * read and checked against it first: `receiveErpWebhook`) and the refresh call is not due (round 2, `probeOpen`).
 */
export function erpWebhookRequestRefusal(req: Pick<WebhookRequest, 'signature' | 'timestamp' | 'address'>, at: Date, guard: ErpSiteGuard = erpWebhookGuard()): WebhookAnswer | null {
  const now = at.getTime();
  const shape = erpSignatureShape(req.signature, req.timestamp);
  if (!shape.ok) {
    const code = REFUSAL[shape.reason];
    noteErpRefusal(guard, now, null, code);
    return { status: 401, code };
  }
  if (!guard.budget.known.length && overBudget(guard.budget, req.address, now, guard.perMinute) && !probeOpen(guard.budget, now, guard.refreshSeconds)) {
    noteErpRefusal(guard, now, null, 'RATE_LIMITED');
    return { status: 429, code: 'RATE_LIMITED' };
  }
  return null;
}

/** Checks, de-duplicates and stores one webhook request. Never applies it (the worker does). */
export async function receiveErpWebhook(deps: WebhookDeps, req: WebhookRequest, guard: ErpSiteGuard = erpWebhookGuard()): Promise<WebhookAnswer> {
  const now = nowOf(deps);
  const at = now.getTime();
  // From the request alone, reading nothing (p3 review): unsigned, malformed, or this address cut off.
  const early = erpWebhookRequestRefusal(req, now, guard);
  if (early) return early;
  const signedWith = (secret: string, maxAgeSeconds: number) => verifyErpSignature({ secret, rawBody: req.rawBody, signature: req.signature, timestamp: req.timestamp, maxAgeSeconds, now: at });
  const signedKnown = (s: string) => signedWith(s, Number.POSITIVE_INFINITY).ok;
  const rateLimited = (): WebhookAnswer => {
    noteErpRefusal(guard, at, null, 'RATE_LIMITED');
    return { status: 429, code: 'RATE_LIMITED' };
  };
  // Cut off already (the limits as last read): nothing is read at all.
  if (overBudget(guard.budget, req.address, at, guard.perMinute) && !signedByKnown(guard.budget, signedKnown) && !probeOpen(guard.budget, at, guard.refreshSeconds)) return rateLimited();
  const [enabled, maxKb, maxAge, dedupeHours, perMinute, logMinutes, refreshSeconds] = await Promise.all([
    setting(deps, null, 'erp.webhook.enabled'),
    setting(deps, null, 'erp.webhook.maxBodyKb'),
    setting(deps, null, 'erp.webhook.maxAgeSeconds'),
    setting(deps, null, 'erp.webhook.dedupeHours'),
    setting(deps, null, 'erp.siteApi.refusedPerMinute'),
    setting(deps, null, 'erp.siteApi.refusedLogMinutes'),
    setting(deps, null, 'system.integrationKeyCacheSeconds'),
  ]);
  Object.assign(guard, { perMinute, logMinutes, refreshSeconds });
  if (!enabled) return { status: 503, code: 'OFF' };
  if (Buffer.byteLength(req.rawBody, 'utf8') > maxKb * 1024) return { status: 413, code: 'TOO_LARGE' };
  /** A refusal after the request was looked at: counted by reason (its address's count is kept by the budget). */
  const refused = (code: WebhookCode): WebhookAnswer => {
    noteErpRefusal(guard, at, null, code);
    return { status: 401, code };
  };
  // Too old or too far ahead: refused before any store, connection or vault is read (the settings only; counted for
  // its address, and it never takes the refresh call, which only a call that reaches the lookup may use).
  if (!erpSignatureShape(req.signature, req.timestamp, { maxAgeSeconds: maxAge, now: at }).ok) {
    if (!overBudget(guard.budget, req.address, at, perMinute)) countRefusal(guard.budget, req.address, at);
    return refused('STALE');
  }
  // Round 2: the slot is taken now, with no await before it, so calls at the same moment cannot all pass the limit.
  const slot = admit(guard.budget, req.address, at, { perMinute, refreshSeconds }, signedKnown);
  if (!slot) return rateLimited();

  const keys = await candidates(deps);
  guard.budget.known = keys.map((k) => k.secret);
  const matches: Candidate[] = [];
  let refusal: WebhookCode = keys.length ? 'BAD_SIGNATURE' : 'NO_SECRET';
  for (const k of keys) {
    const r = signedWith(k.secret, maxAge);
    if (r.ok) matches.push(k);
    else refusal = REFUSAL[r.reason];
  }
  // p3 review: one secret, one connection, for every event type (CN-029 §16). Two connections with the same secret
  // could be either store: a stock or variant change would otherwise land in the first one's shop.
  const verdict = !matches.length ? refused(refusal) : matches.length > 1 ? refused('SHARED_SECRET') : null;
  // The lookup already read the database: the counted refusals may be written now (at most once a window).
  await flushErpSiteRefusals(deps.db, guard, now).catch(() => false);
  if (verdict) return verdict;
  // Verified: its slot is given back (it is not a refusal).
  giveBack(guard.budget, slot);
  const match = matches[0]!;

  let json: unknown;
  try {
    json = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, code: 'BAD_JSON' };
  }
  // PR 608: a v6 event through a connection a v6 store uses goes to the permanent ledger (no 72-hour window).
  // PR 607 · p3 review: the eventId is the signed body's; X-Extas-Delivery may only repeat it.
  const v6 = parseErpV6Event(json, req.deliveryId ?? null);
  if (!(!v6.ok && v6.reason === 'NOT_V6')) {
    const link = match.storeId != null ? await v6LinkFor(deps, match.storeId, match.integrationId) : null;
    if (link) {
      if (v6.ok) {
        const rec = await recordErpEvent(deps, { integrationId: match.integrationId, storeId: link.storeId, linkId: link.id, source: 'WEBHOOK', event: v6.event, rawBody: req.rawBody });
        if (rec.conflict) return { status: 202, code: 'BODY_CHANGED', eventId: rec.id };
        return rec.created ? { status: 202, code: 'ACCEPTED', eventId: rec.id } : { status: 200, code: 'DUPLICATE', eventId: rec.id };
      }
      // A broken v6 event from the store's own ERP company: kept as FAILED in the store's ledger (the health panel
      // shows it) and answered 2xx, so the ERP does not send it again and again.
      const bad = v6 as Extract<typeof v6, { reason: 'BAD_PAYLOAD' }>;
      const rec = await recordBrokenErpEvent(deps, {
        integrationId: match.integrationId,
        storeId: link.storeId,
        linkId: link.id,
        eventId: bad.eventId,
        type: bad.type ?? null,
        detail: bad.detail,
        rawBody: req.rawBody,
        body: json,
      });
      return { status: 202, code: 'KEPT_FAILED', eventId: rec.id };
    }
  }
  const parsed: ErpWebhookParse = parseErpWebhookEvent(json);
  // A v6 event that is not for a v6 ledger (v5, or a shared connection) is logged under its own eventId.
  const v6Id = v6.ok ? v6.event.eventId : v6.reason === 'BAD_PAYLOAD' ? v6.eventId : null;
  const id = (parsed.ok ? parsed.event.id : parsed.id) ?? v6Id ?? req.idempotencyKey?.trim().slice(0, 200) ?? null;
  if (!id) return { status: 400, code: 'NO_EVENT_ID' };
  const type = parsed.ok ? parsed.event.type : (parsed.type ?? 'unknown');

  // The same event again through the same connection (the ERP retries until it hears 2xx): answered, stored once.
  // p3 review: keyed per connection, so another store's ERP using the same id is its own event. A row kept before
  // under the bare id is still this connection's duplicate when its payload names this connection.
  const key = `${match.integrationId}:${id}`;
  const since = new Date(now.getTime() - dedupeHours * 3_600_000);
  const prior = await deps.db.webhookEvent.findFirst({
    where: {
      source: ERP_WEBHOOK_SOURCE,
      receivedAt: { gte: since },
      OR: [
        { idempotencyKey: key },
        { idempotencyKey: { startsWith: `${key}@` } },
        { AND: [{ OR: [{ idempotencyKey: id }, { idempotencyKey: { startsWith: `${id}@` } }] }, { payload: { path: ['integrationId'], equals: match.integrationId } }] },
      ],
    },
    orderBy: { receivedAt: 'desc' },
    select: { id: true },
  });
  if (prior) return { status: 200, code: 'DUPLICATE', eventId: prior.id };
  // An id last seen before the window is a new event that reuses it: kept under a key of its own (the old row stays).
  const taken = await deps.db.webhookEvent.count({ where: { source: ERP_WEBHOOK_SOURCE, idempotencyKey: key } });
  const idempotencyKey = taken ? `${key}@${now.toISOString()}` : key;

  const status = parsed.ok ? 'RECEIVED' : parsed.reason === 'UNKNOWN_TYPE' ? 'IGNORED' : 'FAILED';
  const error = parsed.ok ? null : parsed.reason === 'UNKNOWN_TYPE' ? `UNKNOWN_TYPE: ${type.slice(0, 100)}` : `BAD_PAYLOAD: ${parsed.detail}`;
  const payload: StoredPayload = { integrationId: match.integrationId, event: json };
  try {
    const row = await deps.db.webhookEvent.create({
      data: {
        storeId: match.storeId,
        source: ERP_WEBHOOK_SOURCE,
        eventType: type.slice(0, 100),
        idempotencyKey,
        signatureValid: true,
        payload: payload as unknown as Prisma.InputJsonValue,
        status,
        error,
        receivedAt: now,
        processedAt: status === 'RECEIVED' ? null : now,
      },
      select: { id: true },
    });
    if (status === 'FAILED') return { status: 400, code: 'BAD_PAYLOAD', eventId: row.id };
    return { status: 202, code: status === 'IGNORED' ? 'IGNORED_TYPE' : 'ACCEPTED', eventId: row.id };
  } catch (e) {
    // Two deliveries of one event at the same moment: the second finds the first's row.
    if ((e as { code?: string }).code === 'P2002') {
      const row = await deps.db.webhookEvent.findFirst({ where: { source: ERP_WEBHOOK_SOURCE, idempotencyKey }, select: { id: true } });
      return { status: 200, code: 'DUPLICATE', ...(row ? { eventId: row.id } : {}) };
    }
    throw e;
  }
}

export interface WebhookProcessResult {
  status: 'processed' | 'ignored' | 'failed' | 'already' | 'missing';
  reason: string | null;
  stores: number;
  applied: number;
  unchanged: number;
  stale: number;
  movements: number;
}

const zero = (): Omit<WebhookProcessResult, 'status' | 'reason'> => ({ stores: 0, applied: 0, unchanged: 0, stale: 0, movements: 0 });

/** An ERP decimal (text) in minor units of a currency (money.ts; kept exported here for PR 196's callers). */
export { decimalToMinor };

/** Applies one stored event (the worker's job). Safe to run again: a finished event is left as it is. */
export async function processErpWebhook(deps: InventoryDeps, eventId: string): Promise<WebhookProcessResult> {
  const ev = await deps.db.webhookEvent.findUnique({ where: { id: eventId } });
  if (!ev || ev.source !== ERP_WEBHOOK_SOURCE) return { status: 'missing', reason: null, ...zero() };
  if (ev.status !== 'RECEIVED') return { status: 'already', reason: ev.status, ...zero() };
  const stored = ev.payload as unknown as StoredPayload;
  const parsed = parseErpWebhookEvent(stored?.event);
  const finish = async (status: 'PROCESSED' | 'IGNORED' | 'FAILED', error: string | null) => {
    await deps.db.webhookEvent.updateMany({ where: { id: ev.id, status: 'RECEIVED' }, data: { status, error, processedAt: nowOf(deps) } });
  };
  if (!parsed.ok) {
    const reason = parsed.reason === 'UNKNOWN_TYPE' ? 'UNKNOWN_TYPE' : `BAD_PAYLOAD: ${parsed.detail}`;
    await finish('FAILED', reason);
    return { status: 'failed', reason, ...zero() };
  }

  // The stores this connection serves, where the guard lets a webhook through.
  const targets: number[] = [];
  const skipped = new Set<string>();
  for (const s of await storesWithErp(deps)) {
    const link = await resolveErp(deps, s.storeId);
    if (!('api' in link) || link.integrationId !== stored.integrationId) continue;
    if (behaviourOf('webhook.apply', link) === 'run') targets.push(s.storeId);
    else skipped.add(link.state === 'mock' ? 'ERP_ON_PRACTICE' : `ERP_${link.state.toUpperCase()}`);
  }
  if (!targets.length) {
    const reason = [...skipped][0] ?? 'NO_STORE';
    await finish('IGNORED', reason);
    return { status: 'ignored', reason, ...zero() };
  }

  const r = parsed.event.type === 'stock.changed'
    ? await applyStock(deps, ev.id, targets, parsed.event.data)
    : await applyVariant(deps, targets, parsed.event.data);
  const sku = parsed.event.data.sku;
  const reason = r.applied + r.unchanged > 0
    ? null
    : r.stale > 0
      ? `OUT_OF_ORDER: the shop already holds a newer change of ${sku}`
      : (r.why ?? 'NOTHING_TO_APPLY');
  await finish(reason ? 'IGNORED' : 'PROCESSED', reason);
  const { why: _why, ...counts } = r;
  return { status: reason ? 'ignored' : 'processed', reason, ...counts };
}

type ApplyCounts = Omit<WebhookProcessResult, 'status' | 'reason'> & { why: string | null };

async function applyStock(deps: InventoryDeps, eventId: string, stores: number[], row: ErpStockRow): Promise<ApplyCounts> {
  const [stockCode, kinds] = await Promise.all([setting(deps, null, 'inventory.erp.stockLocationCode'), sellableKinds(deps)]);
  const locations = await erpStockLocations(deps.db, stockCode);
  const out: ApplyCounts = { ...zero(), why: null };
  for (const storeId of stores) {
    const c = await applyPage(deps, storeId, { type: 'WebhookEvent', id: eventId }, [row], locations, kinds);
    out.stores++;
    out.applied += c.applied;
    out.unchanged += c.unchanged;
    out.stale += c.stale;
    out.movements += c.movements;
    if (!out.why) out.why = c.unmappedWarehouse ? 'UNMAPPED_WAREHOUSE' : c.retiredSku ? 'RETIRED_SKU' : c.unknownSku ? 'UNKNOWN_SKU' : null;
    if (c.touched.length) await afterStockChange(deps, storeId, c.touched);
  }
  return out;
}

async function applyVariant(deps: InventoryDeps, stores: number[], row: ErpVariantRow): Promise<ApplyCounts> {
  const out: ApplyCounts = { ...zero(), why: null };
  for (const storeId of stores) {
    out.stores++;
    const [v, store] = await Promise.all([
      deps.db.productVariant.findFirst({ where: { storeId, sku: row.sku.trim(), archivedAt: null }, select: { id: true, barcode: true, erpRetailPriceMinor: true, avgCostMinor: true, erpUpdatedAt: true } }),
      deps.db.store.findUnique({ where: { id: storeId }, select: { currency: true } }),
    ]);
    if (!v || !store) {
      out.why ??= 'UNKNOWN_SKU';
      continue;
    }
    if (v.erpUpdatedAt && v.erpUpdatedAt.getTime() > row.updatedAt.getTime()) {
      out.stale++;
      continue;
    }
    const digits = currencyDigits(store.currency);
    // PR 607: v6 sends only the shop price; whatever else a v6 store receives about money is not read.
    const v6 = await isV6(deps, storeId);
    const data = {
      barcode: row.barcode ?? v.barcode,
      erpRetailPriceMinor: v6 ? v.erpRetailPriceMinor : (decimalToMinor(row.retailPrice, digits) ?? v.erpRetailPriceMinor),
      avgCostMinor: v6 ? v.avgCostMinor : (decimalToMinor(row.avgCost, digits) ?? v.avgCostMinor),
      erpUpdatedAt: row.updatedAt,
    };
    const same = data.barcode === v.barcode && data.erpRetailPriceMinor === v.erpRetailPriceMinor && data.avgCostMinor === v.avgCostMinor && v.erpUpdatedAt?.getTime() === row.updatedAt.getTime();
    if (same) {
      // PR 609: the same row may still carry a new buying price.
      if (v6 && (await applyShopPrice(deps.db, storeId, row.sku, row.shopPrice ?? null, nowOf(deps))) === 'changed') out.applied++;
      else out.unchanged++;
      continue;
    }
    // Only if nothing newer landed meanwhile (two events of one variant handled at once).
    const done = await deps.db.productVariant.updateMany({ where: { id: v.id, OR: [{ erpUpdatedAt: null }, { erpUpdatedAt: { lte: row.updatedAt } }] }, data });
    if (done.count) {
      out.applied++;
      // PR 609: the buying price (v6 only).
      if (v6) await applyShopPrice(deps.db, storeId, row.sku, row.shopPrice ?? null, nowOf(deps));
    } else out.stale++;
  }
  return out;
}

/** The stored events waiting for the worker, oldest first (the PR 6 scheduler's planner reads this). */
export async function waitingErpWebhooks(deps: Pick<InventoryDeps, 'db' | 'settings' | 'now'>): Promise<string[]> {
  const [batch, hours] = await Promise.all([deps.settings.value('erp.webhook.batchSize'), deps.settings.value('erp.webhook.dedupeHours')]);
  const now = deps.now?.() ?? new Date();
  const rows = await deps.db.webhookEvent.findMany({
    where: { source: ERP_WEBHOOK_SOURCE, status: 'RECEIVED', receivedAt: { gte: new Date(now.getTime() - hours * 3_600_000) } },
    orderBy: { receivedAt: 'asc' },
    take: batch,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
