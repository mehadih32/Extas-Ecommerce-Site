// PR 6 — every job the worker knows, by its key (the queue job's name and the ScheduledJob / JobRun `jobKey`). A job
// is a small JSON payload and a function; the function does the work and is itself safe to run twice (each domain
// keeps its own idempotency: stock movements by the ERP's state, ERP documents by their Idempotency-Key, holds by
// their row state). The worker adds the run-level guard on top (runs.ts): an attempt whose run already succeeded is
// skipped and never calls the function again.
//
// The inventory jobs (S09) were shaped for this worker from the start (`@extas/inventory` jobs.ts): the stock pull,
// the cart-hold expiry, the ERP document relay (the outbox), the low-stock check, the reconcile with the ERP and the
// default locations. PR 196 adds the ERP webhook job (one stored event applied), PR 72 the search index job
// (search.ts), PR 148 the message engine's run (messages.ts), PR 170 the sweep of open online payments (payments.ts),
// PR 407 the invoice run (invoices.ts).
// A later stage adds its job here with its key, queue and function.
import { ERP_WEBHOOK_JOB, INVENTORY_QUEUE, processErpWebhook, runInventoryJob, type InventoryJob } from '@extas/inventory';
import type { JobDeps } from './context';
import { runEmailSends, runJourneys } from '@extas/customers';
import { runMessages } from '@extas/messages';
import { indexStore } from '@extas/search';
import { sweepPending } from '@extas/payments';
import { MESSAGES_JOB, MESSAGES_QUEUE, messagesDeps } from './messages';
import { PII_PURGE_JOB, PII_QUEUE, runPiiPurge } from './pii';
import { INVOICE_ISSUE_JOB, INVOICE_QUEUE, runInvoiceIssue } from './invoices';
import { PAYMENTS_QUEUE, PAYMENTS_SWEEP_JOB, paymentsDeps } from './payments';
import { expirePackingPhotos, trackParcels, zoneSyncTurn } from '@extas/shipping';
import { COURIER_QUEUE, COURIER_TRACK_JOB, COURIER_ZONES_JOB, courierDeps, PACKING_PHOTOS_JOB } from './courier';
import { SEARCH_INDEX_JOB, SEARCH_QUEUE, searchDeps } from './search';
import { RETURNS_ERP_JOB, RETURNS_ERP_QUEUE, runReturnsErp } from './returns-erp';
import { MONEY_REPORT_JOB, MONEY_REPORT_QUEUE, runMoneyReport, type MoneyReportPayload } from './money-report';

/** What a job's function reports: ok with a short summary, or a failure with its reason (the job is tried again). */
export type JobOutcome = { ok: true; stats: Record<string, unknown> } | { ok: false; error: string; stats: Record<string, unknown> };

export interface JobDefinition<P = unknown> {
  key: string;
  queue: string;
  /** Checks the payload read back from the queue; throws on a payload that is not this job's. */
  parse(payload: unknown): P;
  /** The store a run belongs to (null = every store / the installation). */
  storeOf(payload: P): number | null;
  run(deps: JobDeps, payload: P): Promise<JobOutcome>;
}

/** A job's result, made small for the JobRun row: numbers, words and flags stay; lists become their length. */
export function compactStats(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (Array.isArray(v)) out[k] = v.length;
    else if (typeof v === 'object') {
      const inner = Object.entries(v as Record<string, unknown>).filter(([, x]) => x === null || ['number', 'string', 'boolean'].includes(typeof x));
      if (inner.length) out[k] = Object.fromEntries(inner.map(([ik, x]) => [ik, typeof x === 'string' ? x.slice(0, 200) : x]));
    }
  }
  return out;
}

/** A job result that says it failed (`status: 'failed'`, with an error) becomes a failed outcome, so it is retried. */
export function outcomeOf(result: unknown): JobOutcome {
  const stats = compactStats(result);
  const r = (result ?? {}) as { status?: unknown; error?: unknown };
  if (r.status === 'failed') {
    const err = r.error as { code?: string; text?: string } | string | null | undefined;
    const text = typeof err === 'string' ? err : err?.text ?? err?.code ?? 'the job reported a failure';
    return { ok: false, error: text, stats };
  }
  return { ok: true, stats };
}

const INVENTORY_JOBS = [
  'inventory.erp.pullStock',
  'inventory.locations.ensureDefaults',
  'inventory.reservations.release',
  'inventory.erp.pushDocuments',
  'inventory.lowStock.evaluate',
  'inventory.erp.reconcile',
  'inventory.erp.pullEvents',
  'inventory.erp.applyEvents',
  // PR 610: the account, the held orders and the catch-up of open orders, per v6 store.
  'inventory.erp.checkOrders',
  // PR 615: Retail's ERP account check.
  'inventory.books.checkAccount',
  // PR 616: the nightly books match and day close.
  'inventory.books.close',
  // PR 617, 618: the daily summary and fixed costs to the ERP.
  'inventory.books.summaryTick',
  'inventory.books.summaryCheck',
] as const satisfies readonly InventoryJob['name'][];

function inventoryJob(name: InventoryJob['name']): JobDefinition<InventoryJob> {
  return {
    key: name,
    queue: INVENTORY_QUEUE,
    parse(payload) {
      const p = (payload ?? {}) as Record<string, unknown>;
      const storeId = p.storeId;
      if (storeId !== undefined && (!Number.isInteger(storeId) || (storeId as number) < 1)) throw new Error(`${name}: storeId must be a positive integer`);
      const needsStore = name === 'inventory.erp.pullStock' || name === 'inventory.erp.reconcile' || name === 'inventory.erp.pullEvents' || name === 'inventory.erp.checkOrders' || name === 'inventory.books.checkAccount' || name === 'inventory.books.close' || name === 'inventory.books.summaryTick' || name === 'inventory.books.summaryCheck';
      if (needsStore && storeId === undefined) throw new Error(`${name}: storeId is required`);
      return { ...p, name } as InventoryJob;
    },
    storeOf: (p) => ('storeId' in p && typeof p.storeId === 'number' ? p.storeId : null),
    run: async (deps, p) => outcomeOf(await runInventoryJob(deps.inventory, p)),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PR 196 — one verified ERP webhook (WebhookEvent, stored by POST /api/erp/webhook) applied to the shop's copy. Its
 * run key is the event: planned again and again until it is handled, it runs once. An event that cannot be applied
 * (practice ERP, unknown SKU, out of order) is marked IGNORED with the reason: that is a finished job, not a failure.
 */
const webhookJob: JobDefinition<{ eventId: string }> = {
  key: ERP_WEBHOOK_JOB,
  queue: INVENTORY_QUEUE,
  parse(payload) {
    const id = (payload as { eventId?: unknown } | null)?.eventId;
    if (typeof id !== 'string' || !UUID.test(id)) throw new Error(`${ERP_WEBHOOK_JOB}: eventId must be a uuid`);
    return { eventId: id };
  },
  storeOf: () => null,
  run: async (deps, p) => {
    const r = await processErpWebhook(deps.inventory, p.eventId);
    return { ok: true, stats: compactStats(r) };
  },
};

/**
 * PR 72 — one store's search index brought to its catalogue's version (packages/search indexer.ts; planned by
 * search.ts `searchPlanner` only for a store whose index is behind). A version already indexed is "unchanged".
 */
const searchIndexJob: JobDefinition<{ storeId: number; version?: string }> = {
  key: SEARCH_INDEX_JOB,
  queue: SEARCH_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown; version?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${SEARCH_INDEX_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number, ...(typeof p.version === 'string' ? { version: p.version } : {}) };
  },
  storeOf: (p) => p.storeId,
  // the job indexes whatever the catalogue holds when it runs (a newer version than planned is fine: it is current)
  run: async (deps, p) => outcomeOf(await indexStore(searchDeps(deps), p.storeId)),
};

/**
 * PR 148 — one store's message run (packages/messages `runMessages`; planned by messages.ts `messagesPlanner` once per
 * slot of `messages.engine.everySeconds`). Safe to run twice: a message's key is its order, step and channel.
 */
const messagesJob: JobDefinition<{ storeId: number }> = {
  key: MESSAGES_JOB,
  queue: MESSAGES_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${MESSAGES_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => {
    const m = messagesDeps(deps);
    if (!m) return { ok: true, stats: { skipped: 'no senders' } };
    // PR 289: the automations queue their due messages first (nothing while `customers.journeys` is off)
    const j = await runJourneys({ db: deps.db, settings: deps.settings, now: deps.now }, p.storeId);
    // PR 290: the e-mail sends queue their next people at the throttle (nothing while `customers.email` is off)
    const e = await runEmailSends({ db: deps.db, settings: deps.settings, now: deps.now }, p.storeId);
    const r = await runMessages(m, p.storeId);
    return { ok: true, stats: { ...(r ? compactStats(r) : { skipped: 'messages off' }), ...(j ? { journeys: `${j.enrolled}/${j.moved}/${j.queued}` } : {}), ...(e ? { email: `${e.started}/${e.queued}/${e.finished}` } : {}) } };
  },
};

/**
 * PR 159 — one store's purge of the IP, device id and shared location its orders kept for the risk checks, once the
 * owner's `risk.capture.retentionDays` have passed (pii.ts; planned per store and slot of `purgeEveryMinutes`). Safe to
 * run twice: a cleared order matches no more.
 */
const piiPurgeJob: JobDefinition<{ storeId: number }> = {
  key: PII_PURGE_JOB,
  queue: PII_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${PII_PURGE_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runPiiPurge(deps, p.storeId)) }),
};

/**
 * PR 170 — one store's open online payments (packages/payments `sweepPending`; planned by payments.ts
 * `paymentsPlanner` once per slot of `payments.pending.everyMinutes`): recovered by the gateway's answer or, when the
 * owner set it, given up as abandoned. Safe to run twice.
 */
const paymentsSweepJob: JobDefinition<{ storeId: number }> = {
  key: PAYMENTS_SWEEP_JOB,
  queue: PAYMENTS_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${PAYMENTS_SWEEP_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => {
    const d = paymentsDeps(deps);
    if (!d) return { ok: true, stats: { skipped: 'no gateways' } };
    const r = await sweepPending(d, p.storeId);
    return r.errors > 0 && r.errors === r.checked ? { ok: false, error: 'no open payment could be checked', stats: compactStats(r) } : { ok: true, stats: compactStats(r) };
  },
};

// PR 72: the search index (search.ts), planned by its own planner when a store's index is behind its catalogue
// PR 148: the message engine (messages.ts), planned per store and slot
// PR 159: the purge of the kept IP, device id and location (pii.ts), planned per store and slot
/**
 * PR 176 — one store's parcels read from their couriers (packages/shipping `trackParcels`; planned by courier.ts
 * `courierPlanner` per store and slot of `delivery.courier.tracking.everyMinutes`). Safe to run twice: a parcel's events
 * are stored once each. A courier that cannot be reached for a parcel is counted, not a failed run (it is read again).
 */
const courierTrackJob: JobDefinition<{ storeId: number }> = {
  key: COURIER_TRACK_JOB,
  queue: COURIER_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${COURIER_TRACK_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => {
    const c = courierDeps(deps);
    if (!c) return { ok: true, stats: { skipped: 'no couriers' } };
    return { ok: true, stats: compactStats(await trackParcels(c, p.storeId)) };
  },
};

/**
 * PR 554 — one store's courier zone sync turn (packages/shipping `zoneSyncTurn`; planned by courier.ts
 * `courierZonesPlanner` per hour slot). Safe to run twice: a run carries on from its cursor, and a place or a pair is
 * written once. A courier that did not answer fails its own run (nothing archived), not the job.
 */
const courierZonesJob: JobDefinition<{ storeId: number }> = {
  key: COURIER_ZONES_JOB,
  queue: COURIER_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${COURIER_ZONES_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => {
    const c = courierDeps(deps);
    if (!c) return { ok: true, stats: { skipped: 'no couriers' } };
    return { ok: true, stats: compactStats(await zoneSyncTurn(c, p.storeId)) };
  },
};

/**
 * PR 182 — one store's packing photos past the owner's days to keep, archived (packages/shipping `expirePackingPhotos`;
 * planned by courier.ts `packingPhotosPlanner` once per day slot). Safe to run twice: an archived photo is left as it is.
 * Nothing is deleted: the file stays in the media library.
 */
const packingPhotosJob: JobDefinition<{ storeId: number }> = {
  key: PACKING_PHOTOS_JOB,
  queue: COURIER_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${PACKING_PHOTOS_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await expirePackingPhotos({ db: deps.db, now: deps.now }, p.storeId)) }),
};

/**
 * PR 407 — one store's invoice run (packages/orders `issueDueInvoices`; planned by invoices.ts `invoicePlanner` per
 * store and slot of `documents.invoice.issue.everyMinutes`): every placed order gets its invoice, an edited one its next
 * version (same number). Safe to run twice: an order already compared is not taken again.
 */
const invoiceIssueJob: JobDefinition<{ storeId: number }> = {
  key: INVOICE_ISSUE_JOB,
  queue: INVOICE_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${INVOICE_ISSUE_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runInvoiceIssue(deps, p.storeId)) }),
};

/**
 * CN-028 · PR 612–614 — one v6 store's turn of returns and exchanges with its own ERP (returns-erp.ts; planned per v6
 * store and slot of `erp.events.pullMinutes`). Safe to run twice: each step keeps its own idempotency.
 */
const returnsErpJob: JobDefinition<{ storeId: number }> = {
  key: RETURNS_ERP_JOB,
  queue: RETURNS_ERP_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${RETURNS_ERP_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => outcomeOf(await runReturnsErp(deps, p.storeId)),
};

/**
 * S16 · PR 351 — one store's money report for one period (money-report.ts; planned only while it is due, the period in
 * the run key). Safe to run twice: a run that already succeeded is skipped by the run guard; switched off = nothing.
 */
const moneyReportJob: JobDefinition<MoneyReportPayload> = {
  key: MONEY_REPORT_JOB,
  queue: MONEY_REPORT_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown; period?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${MONEY_REPORT_JOB}: storeId must be a positive integer`);
    if (typeof p.period !== 'string' || !/^(D:\d{4}-\d{2}-\d{2}|W:\d{4}-\d{2}-\d{2}|M:\d{4}-\d{2})$/.test(p.period)) throw new Error(`${MONEY_REPORT_JOB}: period must be D:/W:YYYY-MM-DD or M:YYYY-MM`);
    return { storeId: p.storeId as number, period: p.period };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runMoneyReport(deps, p)) }),
};

const definitions: JobDefinition<never>[] = [
  ...INVENTORY_JOBS.map((n) => inventoryJob(n) as unknown as JobDefinition<never>),
  webhookJob as unknown as JobDefinition<never>,
  searchIndexJob as unknown as JobDefinition<never>,
  messagesJob as unknown as JobDefinition<never>,
  piiPurgeJob as unknown as JobDefinition<never>,
  paymentsSweepJob as unknown as JobDefinition<never>,
  courierTrackJob as unknown as JobDefinition<never>,
  courierZonesJob as unknown as JobDefinition<never>,
  packingPhotosJob as unknown as JobDefinition<never>,
  invoiceIssueJob as unknown as JobDefinition<never>,
  returnsErpJob as unknown as JobDefinition<never>,
  moneyReportJob as unknown as JobDefinition<never>,
];

/** Every job by key. */
export const JOBS: ReadonlyMap<string, JobDefinition<unknown>> = new Map(definitions.map((d) => [d.key, d as unknown as JobDefinition<unknown>]));

/** Every queue the worker listens on. */
export const QUEUES: readonly string[] = [...new Set(definitions.map((d) => d.queue))];

export function jobDefinition(key: string): JobDefinition<unknown> | null {
  return JOBS.get(key) ?? null;
}
