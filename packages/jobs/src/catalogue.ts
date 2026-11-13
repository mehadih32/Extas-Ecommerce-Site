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
// PR 407 the invoice run (invoices.ts), PR 296 the points run (rewards.ts), PR 534 the grading run (grades.ts).
// PR 538 the support escalation sweep (support-escalation.ts). PR 153 (follow-up 192) the order timers (order-followups.ts).
// A later stage adds its job here with its key, queue and function.
import { ERP_WEBHOOK_JOB, INVENTORY_QUEUE, processErpWebhook, runInventoryJob, type InventoryJob } from '@extas/inventory';
import type { JobDeps } from './context';
import { runEmailSends, runJourneys, runWinbacks } from '@extas/customers';
import { runMessages } from '@extas/messages';
import { indexStore } from '@extas/search';
import { pollPayouts, sweepPending } from '@extas/payments';
import { MESSAGES_JOB, MESSAGES_QUEUE, messagesDeps } from './messages';
import { PII_PURGE_JOB, PII_QUEUE, runPiiPurge } from './pii';
import { INVOICE_ISSUE_JOB, INVOICE_QUEUE, runInvoiceIssue } from './invoices';
import { runSupportEscalation, SUPPORT_ESCALATE_JOB, SUPPORT_QUEUE } from './support-escalation';
import { PAYMENTS_QUEUE, PAYMENTS_SWEEP_JOB, paymentsDeps } from './payments';
import { expirePackingPhotos, trackParcels, zoneSyncTurn } from '@extas/shipping';
import { COURIER_PAYOUTS_JOB, COURIER_QUEUE, COURIER_TRACK_JOB, COURIER_ZONES_JOB, courierDeps, PACKING_PHOTOS_JOB, payoutDeps } from './courier';
import { SEARCH_INDEX_JOB, SEARCH_QUEUE, searchDeps } from './search';
import { RETURNS_ERP_JOB, RETURNS_ERP_QUEUE, runReturnsErp } from './returns-erp';
import { MONEY_REPORT_JOB, MONEY_REPORT_QUEUE, runMoneyReport, type MoneyReportPayload } from './money-report';
import { POINTS_JOB, POINTS_QUEUE, runPointsJob } from './rewards';
import { ORDER_FOLLOW_UPS_JOB, ORDER_FOLLOW_UPS_QUEUE, runOrderFollowUps } from './order-followups';
import { GRADES_JOB, GRADES_QUEUE, runGradesJob } from './grades';
import { REPORT_PACK_JOB, REPORT_PACK_QUEUE, runReportPack, type ReportPackPayload } from './report-packs';
import { RANKING_JOB, RANKING_QUEUE, runRankingJob } from './shop-ranking';
import { AUDIENCE_REFRESH_JOB, AUDIENCE_REFRESH_QUEUE, runAudienceRefresh, type AudienceRefreshPayload } from './audience-refresh';
import { AD_SPEND_IMPORT_JOB, AD_SPEND_IMPORT_QUEUE, runAdSpendImport, type AdSpendImportPayload } from './ad-spend-import';
import { runTrackingSweep, TRACKING_SWEEP_JOB, TRACKING_SWEEP_QUEUE, type TrackingSweepPayload } from './tracking-sweep';

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
    // PR 300: the win-back campaigns queue their next people at the throttle (nothing while `customers.winback` is off)
    const w = await runWinbacks({ db: deps.db, settings: deps.settings, now: deps.now }, p.storeId);
    const r = await runMessages(m, p.storeId);
    return { ok: true, stats: { ...(r ? compactStats(r) : { skipped: 'messages off' }), ...(j ? { journeys: `${j.enrolled}/${j.moved}/${j.queued}` } : {}), ...(e ? { email: `${e.started}/${e.queued}/${e.finished}` } : {}), ...(w ? { winback: `${w.started}/${w.queued}/${w.finished}` } : {}) } };
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
 * S28 · PR 671 — one store's open courier payout requests read back from the couriers, and the PAID ones settled in the name of
 * the person who asked (packages/payments `pollPayouts`; planned by courier.ts `courierPayoutsPlanner`). Safe to run twice: a
 * request already settled is left as it is, and a statement is imported once. A courier that does not answer is counted.
 */
const courierPayoutsJob: JobDefinition<{ storeId: number }> = {
  key: COURIER_PAYOUTS_JOB,
  queue: COURIER_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${COURIER_PAYOUTS_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => {
    const d = payoutDeps(deps);
    if (!d) return { ok: true, stats: { skipped: 'no couriers' } };
    return { ok: true, stats: compactStats(await pollPayouts(d, p.storeId)) };
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

/**
 * PR 296 — one store's points run (packages/customers `runPoints`; planned by rewards.ts `pointsPlanner` once an hour
 * while the owner's points give something). Safe to run twice: each order's points have the order as their key.
 */
const pointsJob: JobDefinition<{ storeId: number }> = {
  key: POINTS_JOB,
  queue: POINTS_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${POINTS_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runPointsJob(deps, p.storeId)) }),
};

/**
 * PR 534 — one store's grading run (packages/customers `runGrades`; planned by grades.ts `gradesPlanner` once a day while
 * the owner's grading is on). Safe to run twice: only changes are written.
 */
const gradesJob: JobDefinition<{ storeId: number }> = {
  key: GRADES_JOB,
  queue: GRADES_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${GRADES_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runGradesJob(deps, p.storeId)) }),
};

/**
 * S28 · PR 690 — one scheduled report pack for one store and period (planned by report-packs.ts): a short Telegram summary to the
 * owner, once per period. Switched off or no bot = nothing.
 */
const reportPackJob: JobDefinition<ReportPackPayload> = {
  key: REPORT_PACK_JOB,
  queue: REPORT_PACK_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown; pack?: unknown; period?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${REPORT_PACK_JOB}: storeId must be a positive integer`);
    if (typeof p.pack !== 'string' || !/^[a-z]{3,20}$/.test(p.pack)) throw new Error(`${REPORT_PACK_JOB}: pack must be a pack id`);
    if (typeof p.period !== 'string' || !/^(W:\d{4}-\d{2}-\d{2}|M:\d{4}-\d{2})$/.test(p.period)) throw new Error(`${REPORT_PACK_JOB}: period must be W:YYYY-MM-DD or M:YYYY-MM`);
    return { storeId: p.storeId as number, pack: p.pack, period: p.period };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runReportPack(deps, p)) }),
};

/**
 * S28 · PR 686 — one store's shop-ranking run (packages/catalogue `updateRankScores`; planned by shop-ranking.ts once a night).
 * Safe to run twice: only changed scores are written; the order goes on the shop only while `shop.ranking.autoApply` is on.
 */
const rankingJob: JobDefinition<{ storeId: number }> = {
  key: RANKING_JOB,
  queue: RANKING_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${RANKING_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runRankingJob(deps, p.storeId)) }),
};

/**
 * S13 · PR 264 — one store's daily audience refresh for one store day (audience-refresh.ts; planned only while it is due,
 * the day in the run key). Safe to run twice: a run that already succeeded is skipped by the run guard; off = nothing.
 */
const audienceRefreshJob: JobDefinition<AudienceRefreshPayload> = {
  key: AUDIENCE_REFRESH_JOB,
  queue: AUDIENCE_REFRESH_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown; day?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${AUDIENCE_REFRESH_JOB}: storeId must be a positive integer`);
    if (typeof p.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.day)) throw new Error(`${AUDIENCE_REFRESH_JOB}: day must be YYYY-MM-DD`);
    return { storeId: p.storeId as number, day: p.day };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runAudienceRefresh(deps, p)) }),
};

/**
 * PR 538 — one store's support escalation sweep (packages/support `sweepEscalations`; planned by support-escalation.ts
 * per store and minute while `support.escalation` is on): the owner told on Telegram once per customer wait nobody
 * answered. Safe to run twice: one row per wait, one sweep of a store at a time.
 */
const supportEscalateJob: JobDefinition<{ storeId: number }> = {
  key: SUPPORT_ESCALATE_JOB,
  queue: SUPPORT_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${SUPPORT_ESCALATE_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runSupportEscalation(deps, p.storeId)) }),
};

/**
 * S13 · PR 265 — one store's daily ad spend import for one store day (ad-spend-import.ts; planned only while it is due,
 * the day in the run key). Safe to run twice: each campaign day is replaced, never added; off = nothing.
 */
/**
 * PR 153 follow-up 192 — one store's order timers (packages/orders `orderFollowUps`; planned by order-followups.ts once
 * an hour while a timer is on): a call task for an order held too long or an advance past its deadline. Safe to run
 * twice: an order with an open task of the same reason gets no second one.
 */
const orderFollowUpsJob: JobDefinition<{ storeId: number }> = {
  key: ORDER_FOLLOW_UPS_JOB,
  queue: ORDER_FOLLOW_UPS_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${ORDER_FOLLOW_UPS_JOB}: storeId must be a positive integer`);
    return { storeId: p.storeId as number };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runOrderFollowUps(deps, p.storeId)) }),
};

const adSpendImportJob: JobDefinition<AdSpendImportPayload> = {
  key: AD_SPEND_IMPORT_JOB,
  queue: AD_SPEND_IMPORT_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown; day?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${AD_SPEND_IMPORT_JOB}: storeId must be a positive integer`);
    if (typeof p.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.day)) throw new Error(`${AD_SPEND_IMPORT_JOB}: day must be YYYY-MM-DD`);
    return { storeId: p.storeId as number, day: p.day };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runAdSpendImport(deps, p)) }),
};

/**
 * Follow-up 602 (PR 257) — one store's sweep of tracked events still waiting, for one UTC hour (tracking-sweep.ts;
 * planned only while tracking is on and an event waits). Safe to run twice: each row is claimed before it is sent.
 */
const trackingSweepJob: JobDefinition<TrackingSweepPayload> = {
  key: TRACKING_SWEEP_JOB,
  queue: TRACKING_SWEEP_QUEUE,
  parse(payload) {
    const p = (payload ?? {}) as { storeId?: unknown; hour?: unknown };
    if (!Number.isInteger(p.storeId) || (p.storeId as number) < 1) throw new Error(`${TRACKING_SWEEP_JOB}: storeId must be a positive integer`);
    if (typeof p.hour !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(p.hour)) throw new Error(`${TRACKING_SWEEP_JOB}: hour must be YYYY-MM-DDTHH`);
    return { storeId: p.storeId as number, hour: p.hour };
  },
  storeOf: (p) => p.storeId,
  run: async (deps, p) => ({ ok: true, stats: compactStats(await runTrackingSweep(deps, p)) }),
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
  courierPayoutsJob as unknown as JobDefinition<never>,
  packingPhotosJob as unknown as JobDefinition<never>,
  invoiceIssueJob as unknown as JobDefinition<never>,
  returnsErpJob as unknown as JobDefinition<never>,
  moneyReportJob as unknown as JobDefinition<never>,
  pointsJob as unknown as JobDefinition<never>,
  gradesJob as unknown as JobDefinition<never>,
  rankingJob as unknown as JobDefinition<never>,
  reportPackJob as unknown as JobDefinition<never>,
  audienceRefreshJob as unknown as JobDefinition<never>,
  supportEscalateJob as unknown as JobDefinition<never>,
  adSpendImportJob as unknown as JobDefinition<never>,
  orderFollowUpsJob as unknown as JobDefinition<never>,
  trackingSweepJob as unknown as JobDefinition<never>,
];

/** Every job by key. */
export const JOBS: ReadonlyMap<string, JobDefinition<unknown>> = new Map(definitions.map((d) => [d.key, d as unknown as JobDefinition<unknown>]));

/** Every queue the worker listens on. */
export const QUEUES: readonly string[] = [...new Set(definitions.map((d) => d.queue))];

export function jobDefinition(key: string): JobDefinition<unknown> | null {
  return JOBS.get(key) ?? null;
}
