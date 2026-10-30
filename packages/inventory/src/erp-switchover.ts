// CN-028 · PR 619 (CN-029 Phase 2) — the switch-over of one store to ERP contract v6 (docs/erp/site-changes-v6.md §3,
// docs/RETAIL-ERP-MODEL.md §9 and §16). Per store and per ERP link: store A's switch never reads or writes store B.
//
// What the ERP does (§3): it announces a store's switch date; on that date it moves the store's open old orders to the
// new rules and answers `GET /switch-over` with the final list (NOT_OUT, OUT, ADVANCE, UNPAID), the one transfer and
// the opening balance. What the shop does, in this order, each step safe to run again:
//   1. the v5 order documents still waiting are taken out of the v5 relay (follow-up 530) — while still v5, so none goes
//      out in the old form;
//   2. the ERP's switch date is kept on the store's link;
//   3. the moved list is kept as the opening items (ErpSwitchOrder); NOT_OUT and OUT orders become v6 orders of the link
//      (ErpOrder with the ERP's lines at their shop prices; OUT billed on the switch date), so their delivery results
//      and returns use the new calls at the same buying price (§9.6);
//   4. `erp.model` = v6 — with the owner's written OK (`requiresOwnerOk`): only an owner, with his books PIN, the switch
//      date typed back and a clean dry run that saw the same list, ever gets here;
//   5. the old shop QC, restock, write-off and credit-due paths (`returns.legacy.*`) turn OFF for this store — switches,
//      never deleted (CLAUDE.md rule 3; Pherot follow-up 545);
//   6. the opening balance (what Retail owed before the switch date, at the buying price: owner's answer "ক") is
//      imported once for the link; the lifetime check starts there;
//   7. the one transfer (+ unpaid amounts moved, − customer advances credited) is booked once (SWITCH_TRANSFER);
//   8. the bills of the OUT orders and their pieces enter the account and the pipeline;
//   9. the month before the switch is filled backwards: one summary per day from the 1st, `costs.goods` from
//      `GET /cost-of-goods`, everything the shop never recorded listed in `incomplete` (§3.5); the summary tick sends them;
//  10. the waiting v5 orders go again as v6 orders (`erp.switchOver.queuedV5Orders` = resend) or wait for a person;
//  11. the link is marked switched, and the run is kept (ErpSwitchRun, never changed).
// From then the retired v5 calls (customer payments, ad spend, returns, shipment events, a delivered or returned status)
// are never sent (PR 607, `retiredInV6`).
//
// A dry run does steps' reading only and keeps its report; nothing else changes. A new link epoch (a handover to a new
// owner, or a wrong opening balance: follow-up 555) ends the open link — owner and PIN — and the next switch-over books
// the new opening items on the new link. No secret is read, written or logged here (the web layer revokes a handover's
// keys in the vault).
import { createHash } from 'node:crypto';
import type { Prisma } from '@extas/db/client';
import { isOwner, requirePermission } from '@extas/auth';
import { minorOf, type ErpSummaryIncompleteKey, type ErpSwitchOrderKind, type ErpSwitchOver } from '@extas/erp-types';
import { toErpError, type ErpApi, type ErpDocument } from '@extas/adapters';
import { logChange, nowOf, setting, TX, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';
import { erpModelOf } from './erp-model';
import { companyHeldElsewhere, openErpLink } from './erp-link';
import { resolveErp } from './guard';
import { currencyDigits } from './erp-push';
import { erpPieces, isV6OrderDoc } from './erp-orders-v6';
import { addDay, dayText, dateOfDay, importOpeningBalance, ledgerBalance, lockLink, moneyMinor, recordSwitchTransfer, storeErpLink, syncBills } from './erp-account';
import { syncPipeline } from './erp-pipeline';
import { checkBooksPin, needPin } from './books-close';
import { assembleSummary, minorPerUnit, stableJson } from './books-rules';
import { booksTarget, dayFigures, localNow, pendingVersions, type BooksTarget } from './books-summary';

// ---- errors ---------------------------------------------------------------------------------------------------------

export type SwitchErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  /** Only an owner switches a store, or starts its ERP link again (CLAUDE.md rule 6). */
  | 'OWNER_ONLY'
  /** The dry run's blockers (in `details`) stand: the switch cannot go. */
  | 'SWITCH_BLOCKED'
  /** The switch date typed back is not the ERP's. */
  | 'CONFIRM_DATE'
  /** No clean dry run on this link within `erp.switchOver.dryRunMaxHours`. */
  | 'DRY_RUN_NEEDED'
  /** The ERP's list changed after the last dry run: look again before switching. */
  | 'DRY_RUN_STALE'
  /** The store does not speak v6 (yet). */
  | 'NOT_V6'
  /** The store has no ERP link of its own yet. */
  | 'NO_LINK'
  /** The app gave no way to send an order again (a test or a job without the orders package). */
  | 'NOT_AVAILABLE';

export class SwitchError extends Error {
  readonly code: SwitchErrorCode;
  readonly details: string[];
  constructor(code: SwitchErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'SwitchError';
    this.code = code;
    this.details = details;
  }
  /** HTTP status for the admin API. */
  get status(): number {
    if (this.code === 'NOT_FOUND') return 404;
    if (this.code === 'OWNER_ONLY') return 403;
    if (this.code === 'INVALID_INPUT' || this.code === 'CONFIRM_DATE') return 400;
    return 409;
  }
}
export const isSwitchError = (e: unknown): e is SwitchError => e instanceof SwitchError;

// ---- dependencies ---------------------------------------------------------------------------------------------------

/** Writes a store setting (the app passes its SettingsResolver; `ownerApproved` is the owner's written OK). */
export interface SettingsWriter {
  set(key: string, value: unknown, target: { level: 'store'; storeId: number }, opts: { actorId?: string | null; reason?: string | null; ownerApproved?: boolean }): Promise<unknown>;
}

export interface SwitchOverDeps extends InventoryDeps {
  writer: SettingsWriter;
  /** Sends a shop order again as a v6 order (the orders package's `resendOrderAsV6`; follow-up 530). */
  resendV5Order?: (storeId: number, orderId: string) => Promise<void>;
}

// ---- the plan (what the switch would do) ------------------------------------------------------------------------------

export const SWITCH_BLOCKERS = [
  /** The store has no ERP connection of its own (its own key and secrets, §16): typed on the ERP link page. */
  'NO_OWN_CONNECTION',
  /** The ERP could not be asked (`detail` says why). */
  'ERP_UNREACHABLE',
  /** The key's ERP company is linked to another store (one store = one ERP company). */
  'SHARED_COMPANY',
  'NOT_ANNOUNCED',
  /** The ERP announced the date but has not moved the old orders yet (its list is not final). */
  'ERP_NOT_DONE',
  'BEFORE_SWITCH_DATE',
  /** The ADVANCE and UNPAID amounts do not add up to the ERP's one transfer. */
  'TRANSFER_MISMATCH',
  'OPENING_BALANCE_MISSING',
  /** An amount is not exact in the store's currency. */
  'BAD_AMOUNT',
  /** A NOT_OUT or OUT order on the ERP's list is not one of this store's orders. */
  'ORDER_UNKNOWN',
  /** A NOT_OUT or OUT order's lines do not add up to its amount (or it has none). */
  'LINES_MISMATCH',
  'ALREADY_SWITCHED',
  /** The ERP's date is not the one already kept on this link. */
  'SWITCH_DATE_CHANGED',
  /** The opening balance kept on this link is not the ERP's: a new link epoch puts it right (follow-up 555). */
  'OPENING_DIFFERS',
] as const;
export type SwitchBlocker = (typeof SWITCH_BLOCKERS)[number];

const LEGACY_KEYS = ['returns.legacy.shopQc', 'returns.legacy.restock', 'returns.legacy.writeOff', 'returns.legacy.creditDue'] as const;
/** What a backfilled day (before the switch) never recorded in the shop's v6 books (§3.5). */
const BACKFILL_UNKNOWN: readonly ErpSummaryIncompleteKey[] = ['sales', 'income', 'deliveries', 'returnLosses'];
/** A v5 order document taken out of the relay at the switch (follow-up 530): kept FAILED with this text, never sent. */
export const SWITCH_V5_ORDER = 'SWITCH_V5_ORDER';

export interface SwitchOrderPlan {
  externalOrderId: string;
  kind: ErpSwitchOrderKind;
  /** Signed minor units: + Retail owes more (an OUT bill, an UNPAID amount), − less (an ADVANCE credited). */
  amountMinor: number;
  consignmentId: string | null;
  lines: { lineId: string; sku: string; quantity: number; shopPriceMinor: number }[];
  /** The shop's own order of that number in this store, or null. */
  orderId: string | null;
}

export interface SwitchPlan {
  storeId: number;
  model: 'v5' | 'v6';
  today: string;
  /** The store's own ERP connection (Integration.storeId = the store), or null. */
  integrationId: string | null;
  erpCompanyId: string | null;
  practice: boolean;
  link: { id: string; epoch: number; switchedAt: string | null } | null;
  status: ErpSwitchOver['status'] | null;
  switchDate: string | null;
  openingBalanceMinor: number | null;
  transferMinor: number;
  transferReference: string | null;
  orders: SwitchOrderPlan[];
  /** The days of the switch month before the switch date, with their goods at the shop price (`GET /cost-of-goods`). */
  backfill: { from: string; to: string; goodsMinor: Record<string, number> } | null;
  queuedV5: { count: number; orderIds: string[]; action: 'resend' | 'hold' };
  /** The `returns.legacy.*` switches still on (they turn off at the switch). */
  legacyOn: string[];
  blockers: SwitchBlocker[];
  /** Why the ERP could not be asked, when it could not. */
  detail: string | null;
  /** The hash of what the ERP said (switch date, list, transfer, opening, cost of goods). */
  fingerprint: string;
}

const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;

function fingerprintOf(p: Pick<SwitchPlan, 'switchDate' | 'status' | 'openingBalanceMinor' | 'transferMinor' | 'transferReference' | 'orders' | 'backfill'>): string {
  const body = { s: p.status, d: p.switchDate, o: p.openingBalanceMinor, t: p.transferMinor, r: p.transferReference, b: p.backfill, l: p.orders.map((x) => ({ ...x, orderId: null })) };
  return createHash('sha256').update(stableJson(body)).digest('hex');
}

/** The store's own ERP connection and its API (read-only), or why there is none. */
async function ownErp(deps: InventoryDeps, storeId: number): Promise<{ api: ErpApi; integrationId: string; practice: boolean } | null> {
  const erp = await resolveErp(deps, storeId);
  if ((erp.state !== 'connected' && erp.state !== 'mock') || !erp.integrationId || !erp.api.v6) return null;
  const row = await deps.db.integration.findUnique({ where: { id: erp.integrationId }, select: { storeId: true } });
  if (row?.storeId !== storeId) return null;
  return { api: erp.api, integrationId: erp.integrationId, practice: erp.state === 'mock' };
}

const errText = (e: unknown) => {
  const x = toErpError(e);
  return `${x.code}${x.erpCode ? ` ${x.erpCode}` : ''}`.slice(0, 200);
};

/** What the switch of this store would do now (reads the ERP and the shop; changes nothing). */
export async function switchOverPlan(deps: InventoryDeps, storeId: number): Promise<SwitchPlan> {
  const db = deps.db;
  const [model, timeZone, store, queuedAction, legacy] = await Promise.all([
    erpModelOf(deps, storeId),
    setting(deps, storeId, 'store.timeZone'),
    db.store.findUnique({ where: { id: storeId }, select: { currency: true, archivedAt: true } }),
    setting(deps, storeId, 'erp.switchOver.queuedV5Orders'),
    Promise.all(LEGACY_KEYS.map(async (k) => [k, await setting(deps, storeId, k)] as const)),
  ]);
  if (!store || store.archivedAt) throw new SwitchError('NOT_FOUND', 'no such store', ['storeId']);
  const digits = currencyDigits(store.currency);
  const today = localNow(nowOf(deps), timeZone).day;
  const blockers = new Set<SwitchBlocker>();
  let detail: string | null = null;
  const linkRow = await db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' }, select: { id: true, epoch: true, switchDate: true, switchedAt: true, openingBalanceMinor: true, openingImportedAt: true } });

  // The v5 order documents still waiting (never at the ERP): they are taken out of the v5 relay at the switch.
  const waiting = await db.erpPush.findMany({ where: { storeId, documentType: 'order.create', status: { in: ['PENDING', 'HELD', 'DEAD'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { referenceId: true, requestBody: true } });
  const queued = [...new Set(waiting.filter((r) => !isV6OrderDoc(r.requestBody as unknown as ErpDocument)).map((r) => r.referenceId))];

  const plan: SwitchPlan = {
    storeId,
    model,
    today,
    integrationId: null,
    erpCompanyId: null,
    practice: false,
    link: linkRow ? { id: linkRow.id, epoch: linkRow.epoch, switchedAt: linkRow.switchedAt?.toISOString() ?? null } : null,
    status: null,
    switchDate: null,
    openingBalanceMinor: null,
    transferMinor: 0,
    transferReference: null,
    orders: [],
    backfill: null,
    queuedV5: { count: queued.length, orderIds: queued, action: queuedAction },
    legacyOn: legacy.filter(([, on]) => on).map(([k]) => k),
    blockers: [],
    detail: null,
    fingerprint: '',
  };
  if (linkRow?.switchedAt) blockers.add('ALREADY_SWITCHED');

  const own = await ownErp(deps, storeId);
  if (!own) {
    blockers.add('NO_OWN_CONNECTION');
  } else {
    plan.integrationId = own.integrationId;
    plan.practice = own.practice;
    let answer: ErpSwitchOver | null = null;
    try {
      const health = await own.api.health();
      plan.erpCompanyId = health.companyId ?? null;
      if (plan.erpCompanyId && (await companyHeldElsewhere(db, storeId, plan.erpCompanyId)) != null) blockers.add('SHARED_COMPANY');
      answer = await own.api.v6!.switchOver();
    } catch (e) {
      blockers.add('ERP_UNREACHABLE');
      detail = errText(e);
    }
    if (answer) {
      plan.status = answer.status;
      plan.switchDate = answer.switchDate;
      if (answer.status === 'NONE' || !answer.switchDate) blockers.add('NOT_ANNOUNCED');
      else if (answer.status === 'ANNOUNCED') blockers.add('ERP_NOT_DONE');
      if (answer.switchDate && today < answer.switchDate) blockers.add('BEFORE_SWITCH_DATE');
      if (answer.switchDate && linkRow?.switchDate && dayText(linkRow.switchDate) !== answer.switchDate) blockers.add('SWITCH_DATE_CHANGED');
      // The opening balance: what Retail owed before the switch date.
      if (answer.openingBalance != null) {
        plan.openingBalanceMinor = moneyMinor(answer.openingBalance, digits);
        if (plan.openingBalanceMinor == null) blockers.add('BAD_AMOUNT');
      } else if (answer.status === 'DONE') blockers.add('OPENING_BALANCE_MISSING');
      if (linkRow?.openingImportedAt && plan.openingBalanceMinor != null && minorOf(linkRow.openingBalanceMinor ?? 0n) !== plan.openingBalanceMinor) blockers.add('OPENING_DIFFERS');
      // The moved orders, each matched to the shop's own order of that number in this store only.
      const numbers = [...new Set(answer.orders.map((o) => o.externalOrderId))];
      const shopOrders = numbers.length ? await db.order.findMany({ where: { storeId, number: { in: numbers } }, select: { id: true, number: true } }) : [];
      const byNumber = new Map(shopOrders.map((o) => [o.number, o.id]));
      let net = 0;
      for (const o of answer.orders) {
        const raw = moneyMinor(o.amount, digits);
        const lines = o.lines.map((l) => ({ lineId: l.lineId, sku: l.sku, quantity: l.quantity, shopPriceMinor: moneyMinor(l.shopPrice, digits) }));
        if (raw == null || lines.some((l) => l.shopPriceMinor == null)) {
          blockers.add('BAD_AMOUNT');
          continue;
        }
        const amountMinor = o.kind === 'ADVANCE' ? -Math.abs(raw) : Math.abs(raw);
        const priced = lines.map((l) => ({ ...l, shopPriceMinor: l.shopPriceMinor! }));
        const orderId = byNumber.get(o.externalOrderId) ?? null;
        if (o.kind === 'NOT_OUT' || o.kind === 'OUT') {
          if (!orderId) blockers.add('ORDER_UNKNOWN');
          if (!priced.length || priced.reduce((s, l) => s + l.shopPriceMinor * l.quantity, 0) !== amountMinor) blockers.add('LINES_MISMATCH');
        } else net += amountMinor;
        plan.orders.push({ externalOrderId: o.externalOrderId, kind: o.kind, amountMinor, consignmentId: o.consignmentId, lines: priced, orderId });
      }
      plan.orders.sort((a, b) => a.externalOrderId.localeCompare(b.externalOrderId));
      const transfer = answer.transfer ? moneyMinor(answer.transfer.amount, digits) : 0;
      if (transfer == null) blockers.add('BAD_AMOUNT');
      else {
        plan.transferMinor = transfer;
        plan.transferReference = answer.transfer?.reference ?? null;
        if (transfer !== net) blockers.add('TRANSFER_MISMATCH');
      }
      // The month before the switch (§3.5): the goods of each day at the shop price, from the ERP.
      if (answer.switchDate && firstOfMonth(answer.switchDate) < answer.switchDate) {
        const from = firstOfMonth(answer.switchDate);
        const to = addDay(answer.switchDate, -1);
        const goodsMinor: Record<string, number> = {};
        for (let d = from; d <= to; d = addDay(d, 1)) goodsMinor[d] = 0;
        try {
          for (const r of await own.api.v6!.costOfGoods({ from, to })) {
            const v = moneyMinor(r.value, digits);
            if (v == null) blockers.add('BAD_AMOUNT');
            else if (r.date in goodsMinor) goodsMinor[r.date]! += v;
          }
          plan.backfill = { from, to, goodsMinor };
        } catch (e) {
          blockers.add('ERP_UNREACHABLE');
          detail ??= errText(e);
        }
      }
    }
  }
  plan.blockers = SWITCH_BLOCKERS.filter((b) => blockers.has(b));
  plan.detail = detail;
  plan.fingerprint = fingerprintOf(plan);
  return plan;
}

// ---- the runs ---------------------------------------------------------------------------------------------------------

export interface SwitchRunView {
  id: string | null;
  kind: 'DRY_RUN' | 'SWITCH' | 'NEW_LINK';
  ok: boolean;
  blockers: string[];
  switchDate: string | null;
  createdAt: Date;
  actorId: string | null;
}

const runView = (r: { id: string; kind: SwitchRunView['kind']; ok: boolean; blockers: string[]; switchDate: Date | null; createdAt: Date; actorId: string | null }): SwitchRunView => ({
  id: r.id,
  kind: r.kind,
  ok: r.ok,
  blockers: r.blockers,
  switchDate: r.switchDate ? dayText(r.switchDate) : null,
  createdAt: r.createdAt,
  actorId: r.actorId,
});

const toJson = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

/** The store's open link for a run: its own connection, the ERP company the key belongs to (made on first use). */
async function linkForRun(deps: InventoryDeps, plan: SwitchPlan): Promise<{ id: string; epoch: number } | null> {
  if (!plan.integrationId) return plan.link;
  try {
    const l = await openErpLink(deps.db, plan.storeId, plan.integrationId, { erpCompanyId: plan.erpCompanyId });
    return { id: l.id, epoch: l.epoch };
  } catch (e) {
    if (e instanceof InventoryError) return plan.link;
    throw e;
  }
}

/**
 * A dry run (`vault.write`, the person who connects the ERP): what the switch would do, read from the ERP's list and the
 * shop's records, kept as a report on the store's link. Nothing else changes: no setting, no entry, no order, no summary.
 */
export async function dryRunSwitchOver(deps: InventoryDeps, who: Who): Promise<SwitchRunView & { plan: SwitchPlan }> {
  await requirePermission(deps.db, who.actor, 'vault.write', { storeId: who.storeId });
  const plan = await switchOverPlan(deps, who.storeId);
  const link = await linkForRun(deps, plan);
  const now = nowOf(deps);
  const ok = plan.blockers.length === 0;
  if (!link) return { id: null, kind: 'DRY_RUN', ok, blockers: plan.blockers, switchDate: plan.switchDate, createdAt: now, actorId: who.actor.staffUserId ?? null, plan };
  plan.link = { id: link.id, epoch: link.epoch, switchedAt: plan.link?.id === link.id ? plan.link.switchedAt : null };
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.erpSwitchRun.create({
      data: { storeId: who.storeId, linkId: link.id, kind: 'DRY_RUN', switchDate: plan.switchDate ? dateOfDay(plan.switchDate) : null, ok, blockers: plan.blockers, fingerprint: plan.fingerprint, report: toJson(plan), actorId: who.actor.staffUserId ?? null, createdAt: now },
    });
    await tx.erpStoreLink.update({ where: { id: link.id }, data: { dryRunAt: now } });
    await logChange(tx, who, { action: 'erp.switchOver.dryRun', entityType: 'ErpStoreLink', entityId: link.id, before: null, after: { ok, blockers: plan.blockers, switchDate: plan.switchDate, orders: plan.orders.length }, storeId: who.storeId });
    return r;
  }, TX);
  return { ...runView(row), plan };
}

async function requireOwner(deps: InventoryDeps, who: Who): Promise<void> {
  if (!who.actor.staffUserId || !(await isOwner(deps.db, who.actor.staffUserId))) throw new SwitchError('OWNER_ONLY', 'only an owner switches a store or starts its ERP link again');
}

/** A moment on the store's day `day` (its local noon), so the store's date of it is `day` in any time zone. */
function onDay(day: string, timeZone: string): Date {
  let t = Date.parse(`${day}T12:00:00Z`);
  for (let i = 0; i < 3; i++) {
    const local = localNow(new Date(t), timeZone);
    if (local.day === day) {
      const [h, m] = local.time.split(':').map(Number) as [number, number];
      return new Date(t + (12 - h) * 3_600_000 - m * 60_000);
    }
    t += local.day < day ? 12 * 3_600_000 : -12 * 3_600_000;
  }
  return new Date(t);
}

/** The NOT_OUT and OUT orders as v6 orders of the link (once each), their pieces at the customer's price from the shop. */
async function bookMovedOrders(deps: InventoryDeps, plan: SwitchPlan, linkId: string, timeZone: string, digits: number): Promise<number> {
  const db = deps.db;
  const switchDate = plan.switchDate!;
  let made = 0;
  await db.$transaction(async (tx) => {
    await tx.erpSwitchOrder.createMany({
      data: plan.orders.map((o) => ({
        storeId: plan.storeId,
        linkId,
        switchDate: dateOfDay(switchDate),
        externalOrderId: o.externalOrderId,
        kind: o.kind,
        amountMinor: BigInt(o.amountMinor),
        consignmentId: o.consignmentId,
        lines: toJson(o.lines),
        orderId: o.orderId,
      })),
      skipDuplicates: true,
    });
    for (const o of plan.orders) {
      if ((o.kind !== 'OUT' && o.kind !== 'NOT_OUT') || !o.orderId) continue;
      const exists = await tx.erpOrder.findFirst({ where: { linkId, OR: [{ externalOrderId: o.externalOrderId }, { orderId: o.orderId }] }, select: { id: true } });
      if (exists) continue;
      // The customer's price of each piece from the shop's own order (the same split as a v6 order, PR 610).
      const [items, money] = await Promise.all([
        tx.orderItem.findMany({ where: { storeId: plan.storeId, orderId: o.orderId, status: 'ACTIVE' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, sku: true, quantity: true, unitPriceMinor: true, lineTotalMinor: true, comboId: true, comboGroupKey: true } }),
        tx.order.findUnique({ where: { id: o.orderId }, select: { discountMinor: true } }),
      ]);
      const pieces = erpPieces(items.map((i) => ({ orderItemId: i.id, sku: i.sku, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, lineTotalMinor: Math.max(0, i.lineTotalMinor), comboId: i.comboId, comboGroupKey: i.comboGroupKey })), Math.max(0, money?.discountMinor ?? 0), digits);
      const order = await tx.erpOrder.create({
        data: {
          storeId: plan.storeId,
          linkId,
          orderId: o.orderId,
          externalOrderId: o.externalOrderId,
          erpTotalMinor: BigInt(o.amountMinor),
          acceptedAt: nowOf(deps),
          consignmentId: o.consignmentId,
          ...(o.kind === 'OUT' ? { billedAt: onDay(switchDate, timeZone), pickedUpAt: onDay(switchDate, timeZone) } : {}),
        },
      });
      for (const l of o.lines) {
        for (let n = 1; n <= l.quantity; n++) {
          const i = pieces.findIndex((p) => p.sku === l.sku);
          const piece = i >= 0 ? pieces.splice(i, 1)[0]! : null;
          await tx.erpOrderLine.create({
            data: {
              storeId: plan.storeId,
              erpOrderId: order.id,
              orderItemId: piece?.orderItemId ?? null,
              piece: piece?.piece ?? n,
              lineId: l.quantity > 1 ? `${l.lineId}-${n}` : l.lineId,
              sku: l.sku,
              customerPriceMinor: piece?.customerPriceMinor ?? l.shopPriceMinor,
              shopPriceMinor: l.shopPriceMinor,
            },
          });
        }
      }
      made++;
    }
  }, TX);
  return made;
}

/** One day before the switch, kept as a summary version (BACKFILL): goods from the ERP, the rest as the shop knows it. */
async function recordBackfillDay(deps: InventoryDeps, t: BooksTarget, day: string, goodsMinor: number): Promise<boolean> {
  const [figures, noCostLines] = await Promise.all([dayFigures(deps.db, { storeId: t.link.storeId, linkId: t.link.id, day, timeZone: t.timeZone, currency: t.currency }), setting(deps, t.link.storeId, 'erp.summary.noCostLines')]);
  figures.goods = { piecesMinor: goodsMinor, exchangeMinor: 0, unpricedDeliveries: 0 }; // hardcode-ok: backfilled days have no exchange or unpriced pieces (goods come from GET /cost-of-goods)
  figures.sales.unlinkedPieces = 0;
  const s = assembleSummary(figures, { perUnit: minorPerUnit(t.currency), noCostLines, unknown: BACKFILL_UNKNOWN });
  return deps.db.$transaction(async (tx) => {
    await lockLink(tx, t.link);
    const latest = await tx.erpDailySummary.findFirst({ where: { linkId: t.link.id, date: dateOfDay(day) }, orderBy: { version: 'desc' }, select: { version: true, bodyHash: true, minorLines: true } });
    if (latest && latest.bodyHash === s.bodyHash && stableJson(latest.minorLines) === stableJson(s.minor)) return false;
    await tx.erpDailySummary.create({
      data: {
        storeId: t.link.storeId,
        linkId: t.link.id,
        date: dateOfDay(day),
        version: (latest?.version ?? 0) + 1,
        body: s.body as unknown as Prisma.InputJsonValue,
        bodyHash: s.bodyHash,
        incomplete: s.incomplete,
        netProfitMinor: BigInt(s.netProfitMinor),
        minorLines: s.minor as unknown as Prisma.InputJsonValue,
        reason: 'BACKFILL',
      },
    });
    return true;
  }, TX);
}

export interface SwitchStep {
  step: string;
  done: number | boolean | string | null;
}

/**
 * The switch (an owner with his books PIN; see the file header for the steps). Refused when the plan has blockers, the
 * date typed back is not the ERP's, or there is no clean dry run within `erp.switchOver.dryRunMaxHours` that saw the
 * same list. Pressed again after a step failed, it finishes what is left and books nothing twice.
 */
export async function runSwitchOver(deps: SwitchOverDeps, who: Who, input: { pin: unknown; confirmDate: unknown }): Promise<SwitchRunView & { steps: SwitchStep[] }> {
  await requireOwner(deps, who);
  needPin(input.pin);
  await checkBooksPin(deps, who, input.pin as string, 'erp.switchOver');
  const storeId = who.storeId;
  const plan = await switchOverPlan(deps, storeId);
  if (plan.blockers.length) throw new SwitchError('SWITCH_BLOCKED', 'the switch cannot go yet', plan.blockers);
  if (input.confirmDate !== plan.switchDate) throw new SwitchError('CONFIRM_DATE', "type the ERP's switch date to switch", [plan.switchDate ?? '']);
  const link = await linkForRun(deps, plan);
  if (!link) throw new SwitchError('NO_LINK', 'the store has no ERP link of its own yet');
  const now = nowOf(deps);
  const maxHours = await setting(deps, null, 'erp.switchOver.dryRunMaxHours');
  const dry = await deps.db.erpSwitchRun.findFirst({ where: { linkId: link.id, storeId, kind: 'DRY_RUN', ok: true }, orderBy: { createdAt: 'desc' }, select: { fingerprint: true, createdAt: true } });
  if (!dry || now.getTime() - dry.createdAt.getTime() > maxHours * 3_600_000) throw new SwitchError('DRY_RUN_NEEDED', 'run the dry run first');
  if (dry.fingerprint !== plan.fingerprint) throw new SwitchError('DRY_RUN_STALE', "the ERP's list changed since the dry run: run it again");

  const switchDate = plan.switchDate!;
  const [timeZone, store] = await Promise.all([setting(deps, storeId, 'store.timeZone'), deps.db.store.findUniqueOrThrow({ where: { id: storeId }, select: { currency: true } })]);
  const digits = currencyDigits(store.currency);
  const actorId = who.actor.staffUserId ?? null;
  const reason = `PR 619 switch-over to ERP contract v6 on ${switchDate}`;
  const steps: SwitchStep[] = [];
  const step = (name: string, done: SwitchStep['done']) => steps.push({ step: name, done });

  // 1. The waiting v5 order documents out of the v5 relay (while still v5: none goes out in the old form).
  const held = plan.queuedV5.orderIds.length
    ? (await deps.db.erpPush.updateMany({ where: { storeId, documentType: 'order.create', referenceId: { in: plan.queuedV5.orderIds }, status: { in: ['PENDING', 'HELD', 'DEAD'] } }, data: { status: 'FAILED', lastError: SWITCH_V5_ORDER, nextAttemptAt: null } })).count
    : 0;
  step('queuedV5.held', held);
  // 2. The switch date on the link.
  step('link.switchDate', (await deps.db.erpStoreLink.updateMany({ where: { id: link.id, storeId, switchDate: null }, data: { switchDate: dateOfDay(switchDate) } })).count > 0);
  // 3. The moved orders.
  step('movedOrders', await bookMovedOrders(deps, plan, link.id, timeZone, digits));
  // 4. The contract: v6, with the owner's written OK (he is here, with his PIN).
  if (plan.model !== 'v6') await deps.writer.set('erp.model', 'v6', { level: 'store', storeId }, { actorId, reason, ownerApproved: true });
  step('erp.model', plan.model === 'v6' ? 'already v6' : 'v6');
  // 5. The old shop-side return paths off for this store (switches, never deleted).
  for (const key of plan.legacyOn) await deps.writer.set(key, false, { level: 'store', storeId }, { actorId, reason });
  step('returns.legacy.off', plan.legacyOn.length);
  // 6. The opening balance, once for the link.
  const linkRow = await deps.db.erpStoreLink.findUniqueOrThrow({ where: { id: link.id }, select: { openingImportedAt: true } });
  if (!linkRow.openingImportedAt) await importOpeningBalance(deps, { storeId, amountMinor: plan.openingBalanceMinor ?? 0, date: switchDate });
  step('openingBalance', plan.openingBalanceMinor ?? 0);
  // 7. The one transfer.
  if (plan.transferMinor !== 0) await recordSwitchTransfer(deps, { storeId, switchDate, amountMinor: plan.transferMinor, reference: plan.transferReference });
  step('switchTransfer', plan.transferMinor);
  // 8. The OUT bills and their pieces.
  const books = await storeErpLink(deps.db, storeId);
  if (!books || books.id !== link.id) throw new SwitchError('NO_LINK', "the store's ERP link changed during the switch");
  step('bills', await syncBills(deps, books, timeZone));
  step('pipeline', (await syncPipeline(deps, books, timeZone)).pieces);
  // 9. The month before the switch, filled backwards.
  let filled = 0;
  const target = await booksTarget(deps, storeId);
  if (plan.backfill && target && target.link.id === link.id) {
    for (const [day, goods] of Object.entries(plan.backfill.goodsMinor)) if (await recordBackfillDay(deps, target, day, goods)) filled++;
  }
  step('backfill', filled);
  // 10. The waiting v5 orders: sent again as v6 orders, or kept for a person.
  let resent = 0;
  const failed: string[] = [];
  if (plan.queuedV5.action === 'resend' && deps.resendV5Order) {
    for (const orderId of plan.queuedV5.orderIds) {
      try {
        await deps.resendV5Order(storeId, orderId);
        resent++;
      } catch {
        failed.push(orderId);
      }
    }
  }
  step('queuedV5.resent', resent);
  if (failed.length) step('queuedV5.failed', failed.join(','));
  // 11. Switched; the run kept.
  await deps.db.erpStoreLink.updateMany({ where: { id: link.id, storeId, switchedAt: null }, data: { switchedAt: now } });
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.erpSwitchRun.create({
      data: { storeId, linkId: link.id, kind: 'SWITCH', switchDate: dateOfDay(switchDate), ok: true, blockers: [], fingerprint: plan.fingerprint, report: toJson({ plan, steps }), actorId, createdAt: now },
    });
    await logChange(tx, who, { action: 'erp.switchOver.switch', entityType: 'ErpStoreLink', entityId: link.id, before: { model: plan.model }, after: { model: 'v6', switchDate, steps }, storeId });
    return r;
  }, TX);
  return { ...runView(row), steps };
}

/**
 * Ends the store's open ERP link (an owner with his PIN): a handover to a new owner (HANDOVER: the web layer revokes the
 * store's three keys; the new owner types his own) or a wrong opening balance (OPENING_WRONG, follow-up 555: the next
 * switch-over books the ERP's opening items again on the new link). The old link's history stays, unreachable from the
 * new keys; the next link (epoch + 1) opens on first use.
 */
export async function startNewErpLink(
  deps: InventoryDeps,
  who: Who,
  input: { pin: unknown; reason: unknown; note: unknown },
  opts: { revokeKeys?: (storeId: number) => Promise<string[]> } = {},
): Promise<{ kind: 'NEW_LINK'; ended: { id: string; epoch: number }; revoked: string[] }> {
  await requireOwner(deps, who);
  needPin(input.pin);
  if (input.reason !== 'HANDOVER' && input.reason !== 'OPENING_WRONG') throw new SwitchError('INVALID_INPUT', 'the reason is HANDOVER or OPENING_WRONG', ['reason']);
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length < 3 || note.length > 500) throw new SwitchError('INVALID_INPUT', 'say in a few words why', ['note']);
  await checkBooksPin(deps, who, input.pin as string, 'erp.link.new');
  const storeId = who.storeId;
  const open = await deps.db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' }, select: { id: true, epoch: true, switchDate: true } });
  if (!open) throw new SwitchError('NO_LINK', 'the store has no open ERP link');
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const n = await tx.erpStoreLink.updateMany({ where: { id: open.id, storeId, endedAt: null }, data: { endedAt: now, endedReason: input.reason as string } });
    if (!n.count) throw new SwitchError('NO_LINK', 'the link was ended at the same moment');
    await tx.erpSwitchRun.create({ data: { storeId, linkId: open.id, kind: 'NEW_LINK', switchDate: open.switchDate, ok: true, blockers: [], report: toJson({ reason: input.reason, note, epoch: open.epoch }), actorId: who.actor.staffUserId ?? null, createdAt: now } });
    await logChange(tx, who, { action: 'erp.link.new', entityType: 'ErpStoreLink', entityId: open.id, before: { epoch: open.epoch }, after: { endedReason: input.reason, note }, storeId });
  }, TX);
  const revoked = input.reason === 'HANDOVER' && opts.revokeKeys ? await opts.revokeKeys(storeId) : [];
  return { kind: 'NEW_LINK', ended: { id: open.id, epoch: open.epoch }, revoked };
}

/** A v5 order kept for a person at the switch (`hold`), sent now as a v6 order (`vault.write`; v6 stores only). */
export async function sendHeldV5Order(deps: SwitchOverDeps, who: Who, orderId: unknown): Promise<{ sent: true }> {
  await requirePermission(deps.db, who.actor, 'vault.write', { storeId: who.storeId });
  if (typeof orderId !== 'string' || !orderId) throw new SwitchError('INVALID_INPUT', 'which order', ['orderId']);
  const row = await deps.db.erpPush.findFirst({ where: { storeId: who.storeId, referenceId: orderId, documentType: 'order.create', status: 'FAILED', lastError: SWITCH_V5_ORDER }, select: { id: true } });
  if (!row) throw new SwitchError('NOT_FOUND', 'no order of this store is waiting from the switch');
  if ((await erpModelOf(deps, who.storeId)) !== 'v6') throw new SwitchError('NOT_V6', 'the store does not speak v6 yet');
  if (!deps.resendV5Order) throw new SwitchError('NOT_AVAILABLE', 'orders cannot be sent from here');
  await deps.resendV5Order(who.storeId, orderId);
  await logChange(deps.db, who, { action: 'erp.switchOver.resendOrder', entityType: 'Order', entityId: orderId, before: { push: row.id }, after: { resent: true }, storeId: who.storeId });
  return { sent: true };
}

// ---- the ERP link page (what is synced, the queues, the balance, the books) ---------------------------------------------

export interface ErpLinkPage {
  storeId: number;
  model: 'v5' | 'v6';
  link: { id: string; epoch: number; erpCompanyId: string | null; switchDate: string | null; switchedAt: Date | null; dryRunAt: Date | null; openingBalanceMinor: number | null; openingBalanceDate: string | null } | null;
  /** The last time each flow went to (or came from) the ERP for this store's link. */
  synced: { orders: Date | null; shipments: Date | null; deliveries: Date | null; returnLists: Date | null; events: Date | null; account: Date | null; summaries: Date | null; fixedCosts: Date | null };
  lastSummary: { date: string; version: number; acceptedAt: Date } | null;
  queues: {
    ordersWaiting: number;
    ordersHeld: number;
    ordersFailed: number;
    heldAtSwitch: { orderId: string; externalOrderId: string | null; since: Date }[];
    exchangesOpen: number;
    summariesWaiting: number;
  };
  balance: { shopMinor: number | null; erpMinor: number | null; checkedAt: Date | null; onHold: boolean };
  books: { lastClose: { date: string; result: string } | null; openDifferences: number };
  switchOver: { lastDryRun: (SwitchRunView & { plan: unknown }) | null; lastSwitch: SwitchRunView | null; dryRunMaxHours: number };
}

const FINAL_EXCHANGE = ['SETTLED', 'BILLED', 'CREDITED', 'CANCELLED'];

/** Everything the ERP link page shows for one store (`vault.read`). Store A's page never reads store B's rows. */
export async function erpLinkState(deps: InventoryDeps, who: Who): Promise<ErpLinkPage> {
  await requirePermission(deps.db, who.actor, 'vault.read', { storeId: who.storeId });
  const db = deps.db;
  const storeId = who.storeId;
  const [model, shown, maxHours, timeZone] = await Promise.all([erpModelOf(deps, storeId), setting(deps, null, 'erp.link.listShown'), setting(deps, null, 'erp.switchOver.dryRunMaxHours'), setting(deps, storeId, 'store.timeZone')]);
  const l = await db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' } });
  const pushLast = async (types: string[]) => (await db.erpPush.aggregate({ where: { storeId, documentType: { in: types }, status: 'SENT' }, _max: { sentAt: true } }))._max.sentAt;
  const [orders, shipments, deliveries, heldRows, waiting, held, failedN] = await Promise.all([
    pushLast(['order.create']),
    pushLast(['shipment.create']),
    pushLast(['order.delivery']),
    db.erpPush.findMany({ where: { storeId, documentType: 'order.create', status: 'FAILED', lastError: SWITCH_V5_ORDER }, orderBy: { createdAt: 'asc' }, take: shown, select: { referenceId: true, requestBody: true, updatedAt: true } }),
    db.erpPush.count({ where: { storeId, status: 'PENDING' } }),
    db.erpPush.count({ where: { storeId, status: 'HELD' } }),
    db.erpPush.count({ where: { storeId, status: { in: ['FAILED', 'DEAD'] }, NOT: { lastError: SWITCH_V5_ORDER } } }),
  ]);
  // A held order that was sent again since (a newer order row) is no longer waiting.
  const resentIds = new Set(
    heldRows.length
      ? (await db.erpPush.findMany({ where: { storeId, documentType: 'order.create', referenceId: { in: heldRows.map((r) => r.referenceId) }, NOT: { lastError: SWITCH_V5_ORDER } }, select: { referenceId: true } })).map((r) => r.referenceId)
      : [],
  );
  const heldAtSwitch = heldRows
    .filter((r) => !resentIds.has(r.referenceId))
    .map((r) => ({ orderId: r.referenceId, externalOrderId: ((r.requestBody as { body?: { externalOrderId?: unknown } } | null)?.body?.externalOrderId as string | undefined) ?? null, since: r.updatedAt }));
  const state: ErpLinkPage = {
    storeId,
    model,
    link: l
      ? {
          id: l.id,
          epoch: l.epoch,
          erpCompanyId: l.erpCompanyId,
          switchDate: l.switchDate ? dayText(l.switchDate) : null,
          switchedAt: l.switchedAt,
          dryRunAt: l.dryRunAt,
          openingBalanceMinor: l.openingBalanceMinor == null ? null : minorOf(l.openingBalanceMinor),
          openingBalanceDate: l.openingBalanceDate ? dayText(l.openingBalanceDate) : null,
        }
      : null,
    synced: { orders, shipments, deliveries, returnLists: null, events: null, account: null, summaries: null, fixedCosts: null },
    lastSummary: null,
    queues: { ordersWaiting: waiting, ordersHeld: held, ordersFailed: failedN, heldAtSwitch, exchangesOpen: 0, summariesWaiting: 0 },
    balance: { shopMinor: null, erpMinor: null, checkedAt: null, onHold: false },
    books: { lastClose: null, openDifferences: 0 },
    switchOver: { lastDryRun: null, lastSwitch: null, dryRunMaxHours: maxHours },
  };
  if (!l) return state;
  const linkId = l.id;
  const sendLast = async (kind: 'DAILY_SUMMARY' | 'FIXED_COSTS') => (await db.erpBooksSend.aggregate({ where: { linkId, storeId, kind, accepted: true }, _max: { sentAt: true } }))._max.sentAt;
  const [returnLists, events, account, summaries, fixedCosts, exchangesOpen, close, diffs, dryRun, lastSwitch, today] = await Promise.all([
    db.erpReturnList.aggregate({ where: { linkId, storeId, sentAt: { not: null } }, _max: { sentAt: true } }),
    db.erpEvent.aggregate({ where: { linkId, storeId }, _max: { receivedAt: true } }),
    db.erpAccountState.findUnique({ where: { linkId } }),
    sendLast('DAILY_SUMMARY'),
    sendLast('FIXED_COSTS'),
    db.erpExchangeLink.count({ where: { linkId, storeId, OR: [{ erpStatus: null }, { erpStatus: { notIn: FINAL_EXCHANGE } }] } }),
    db.booksDayClose.findFirst({ where: { linkId, storeId }, orderBy: [{ date: 'desc' }, { version: 'desc' }], select: { date: true, result: true } }),
    db.booksDifference.count({ where: { linkId, storeId, status: { in: ['PENDING', 'MISMATCH'] } } }),
    db.erpSwitchRun.findFirst({ where: { linkId, storeId, kind: 'DRY_RUN' }, orderBy: { createdAt: 'desc' } }),
    db.erpSwitchRun.findFirst({ where: { linkId, storeId, kind: 'SWITCH' }, orderBy: { createdAt: 'desc' } }),
    Promise.resolve(localNow(nowOf(deps), timeZone).day),
  ]);
  state.synced = { ...state.synced, returnLists: returnLists._max.sentAt, events: events._max.receivedAt, account: account?.checkedAt ?? null, summaries, fixedCosts };
  const accepted = await db.erpBooksSend.findFirst({ where: { linkId, storeId, kind: 'DAILY_SUMMARY', accepted: true }, orderBy: { sentAt: 'desc' }, select: { refId: true, sentAt: true } });
  if (accepted) {
    const v = await db.erpDailySummary.findUnique({ where: { id: accepted.refId }, select: { date: true, version: true } });
    if (v) state.lastSummary = { date: dayText(v.date), version: v.version, acceptedAt: accepted.sentAt };
  }
  state.queues.exchangesOpen = exchangesOpen;
  state.queues.summariesWaiting = (await pendingVersions(db, linkId, { before: today, asked: [] })).length;
  state.balance = { shopMinor: await ledgerBalance(db, { id: linkId }), erpMinor: account?.balanceMinor == null ? null : minorOf(account.balanceMinor), checkedAt: account?.checkedAt ?? null, onHold: account?.onHold ?? false };
  state.books = { lastClose: close ? { date: dayText(close.date), result: close.result } : null, openDifferences: diffs };
  state.switchOver.lastDryRun = dryRun ? { ...runView(dryRun), plan: dryRun.report } : null;
  state.switchOver.lastSwitch = lastSwitch ? runView(lastSwitch) : null;
  return state;
}
