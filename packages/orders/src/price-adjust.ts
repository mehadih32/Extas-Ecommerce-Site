// S28 · PR 664 — price adjust on every order (DECISIONS.md "Order flow"; the owner's written OK is a BLOCKED row, so the switch
// `orders.priceAdjust` ships OFF). On an open order that is not booked yet, staff take money off: a taka amount, a percent of
// the subtotal, the customer's wallet, or the delivery charge — always with a reason from the owner's list, and never more than
// the customer still has to pay (what is paid or covered by the wallet is never taken back, so no refund is ever made here).
//
// Every adjustment is a NEW line in the order's price ledger (OrderPriceAdjustment: append-only at the database); nothing is
// edited. Inside the asker's own limit (Rules › Order flow: per role, a taka amount and a percent; a role that is not listed
// has a limit of nothing, an owner has none) the line applies at once. Above it:
//   · a person who may approve (`orders.priceApprove`) types the owner's PIN and it applies at once (a price action: the PIN is
//     checked, counted and logged without the number, like the books' PIN);
//   · anyone else leaves a PENDING request; a person with `orders.priceApprove` approves it (the owner's PIN, every time) or
//     refuses it — either answer is another new line pointing at the request. Nothing happens to the order while it waits.
// The wallet is the customer's own money: it needs no approval, but it is limited by the balance and is debited in the wallet
// ledger in the same transaction. The order's total, the amount at the door, the discount and the delivery charge change in the
// same transaction as the line, the timeline row and the audit row; an order the ERP already has is sent again as a new revision.
// The command is open exactly as the edit is: placed, waiting for its advance, confirmed or on hold, never booked, never while a
// cancel is asked (the machine's `edit` plan).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { actorPermissions, isOwner, verifyOwnerPin, type PinPolicy } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import { postWalletEntry } from '@extas/payments';
import { PRICE_ADJUST_OTHER_KEY } from '@extas/settings';
import { allow, nowOf, parse, setting, TX, UUID, type OrdersDeps, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { aboveLimit, ADJUST_KINDS, adjustedMoney, calcAdjust, priceDueOf, limitFor, type AdjustKind, type AdjustMoney } from './price-adjust-pure';
import { plan } from './pure';
import { resendErp } from './addon';
import { auditRow, eventRow, factsOf, lockOrder, MACHINE_SELECT, machineOf, staffBy, type By, type CommandOptions, type LockedOrder } from './service';

/** The timeline types: an adjustment applied, one asked for above the limit, and an answer that refused it. */
export const PRICE_ADJUSTED_EVENT = 'order.priceAdjust';
export const PRICE_ASKED_EVENT = 'order.priceAdjustAsked';
export const PRICE_REFUSED_EVENT = 'order.priceAdjustRefused';

const NOTE_MAX = 500;
const PIN_ACTION = 'orders.priceAdjust';

export const adjustInput = z
  .object({
    kind: z.enum(ADJUST_KINDS),
    /** Minor units for AMOUNT and WALLET (WALLET: empty means as much as the wallet and the order allow), a whole percent for PERCENT; unused for FREE_DELIVERY. */
    value: z.int().min(1).max(1_000_000_000).optional(),
    reasonKey: z.string().trim().min(1).max(60),
    note: z.string().trim().max(NOTE_MAX).optional(),
    pin: z.string().trim().max(32).optional(),
  })
  .strict();

export const priceDecideInput = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(NOTE_MAX).optional(),
    pin: z.string().trim().max(32).optional(),
  })
  .strict();

export interface AdjustLine {
  id: string;
  kind: AdjustKind;
  state: 'PENDING' | 'APPLIED' | 'REJECTED';
  percent: number | null;
  amountMinor: number;
  reasonKey: string;
  note: string | null;
  requestId: string | null;
  requestedById: string | null;
  decidedById: string | null;
  pinChecked: boolean;
  totalBeforeMinor: number;
  totalAfterMinor: number;
  createdAt: Date;
}

const LINE_SELECT = { id: true, kind: true, state: true, percent: true, amountMinor: true, reasonKey: true, note: true, requestId: true, requestedById: true, decidedById: true, pinChecked: true, totalBeforeMinor: true, totalAfterMinor: true, createdAt: true } satisfies Prisma.OrderPriceAdjustmentSelect;

export interface AdjustResult {
  state: 'APPLIED' | 'PENDING' | 'REJECTED';
  lineId: string;
  orderId: string;
  number: string;
  totalMinor: number;
  version: number;
}

const MONEY_SELECT = { subtotalMinor: true, discountMinor: true, deliveryChargeMinor: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true, codAmountMinor: true, paymentMethod: true, customerId: true } satisfies Prisma.OrderSelect;
type MoneyRow = Prisma.OrderGetPayload<{ select: typeof MONEY_SELECT }>;
const moneyOf = (m: MoneyRow): AdjustMoney => ({ subtotalMinor: m.subtotalMinor, discountMinor: m.discountMinor, deliveryChargeMinor: m.deliveryChargeMinor, totalMinor: m.totalMinor, walletAppliedMinor: m.walletAppliedMinor, paidMinor: m.paidMinor, codAmountMinor: m.codAmountMinor, cod: m.paymentMethod === 'COD' });

async function pinPolicy(deps: OrdersDeps): Promise<PinPolicy> {
  const [minLength, maxAttempts, lockMinutes] = await Promise.all([deps.settings.value('books.pin.minLength'), deps.settings.value('books.pin.maxAttempts'), deps.settings.value('books.pin.lockMinutes')]);
  return { minLength, maxLength: Math.max(minLength, 12), maxAttempts, lockMinutes };
}

/** The balance of the customer's wallet (0 when there is none). */
async function walletBalance(db: OrdersDeps['db'] | Tx, customerId: string | null): Promise<number> {
  if (!customerId) return 0;
  const w = await db.walletAccount.findUnique({ where: { customerId }, select: { balanceMinor: true, status: true } });
  return w && w.status === 'ACTIVE' ? w.balanceMinor : 0;
}

async function roleKeysOf(deps: OrdersDeps, who: Who): Promise<{ keys: string[]; owner: boolean; canApprove: boolean }> {
  const held = await actorPermissions(deps.db, who.actor, { storeId: who.storeId });
  const staffUserId = who.actor.staffUserId;
  if (!staffUserId) return { keys: [], owner: false, canApprove: held.has('orders.priceApprove') };
  const rows = await deps.db.staffRoleAssignment.findMany({ where: { staffUserId, revokedAt: null, role: { archivedAt: null }, OR: [{ storeId: null }, { storeId: who.storeId }] }, select: { role: { select: { key: true } } } });
  return { keys: rows.map((r) => r.role.key), owner: await isOwner(deps.db, staffUserId), canApprove: held.has('orders.priceApprove') };
}

/** One ledger line, the order's new money, the timeline row and the audit row (inside the caller's transaction, order locked). */
async function writeLine(
  deps: OrdersDeps,
  tx: Tx,
  o: LockedOrder,
  by: By,
  line: { kind: AdjustKind; state: 'PENDING' | 'APPLIED' | 'REJECTED'; percent: number | null; amountMinor: number; reasonKey: string; note: string | null; requestId: string | null; requestedById: string | null; decidedById: string | null; pinChecked: boolean },
  reason: { en: string; bn: string },
): Promise<AdjustResult> {
  const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: MONEY_SELECT });
  const m = moneyOf(row);
  const id = randomUUID();
  const applies = line.state === 'APPLIED';
  const next = applies ? adjustedMoney(line.kind, line.amountMinor, m) : null;
  let walletEntryId: string | null = null;
  if (applies && line.kind === 'WALLET') {
    if (!o.customerId) throw new OrdersError('NOTHING_TO_ADJUST', 'this order has no customer account, so there is no wallet', ['kind']);
    const e = await postWalletEntry(tx, { storeId: o.storeId, customerId: o.customerId, direction: 'DEBIT', amountMinor: line.amountMinor, reason: 'ORDER', idempotencyKey: `price-adjust:${id}`, orderId: o.id, note: line.note, actorId: by.actorType === 'STAFF' ? by.actorId : null });
    walletEntryId = e.entryId;
  }
  const totalAfter = next ? next.totalMinor : m.totalMinor;
  await tx.orderPriceAdjustment.create({ data: { id, storeId: o.storeId, orderId: o.id, kind: line.kind, state: line.state, percent: line.percent, amountMinor: line.amountMinor, reasonKey: line.reasonKey, note: line.note, requestId: line.requestId, requestedById: line.requestedById, decidedById: line.decidedById, pinChecked: line.pinChecked, totalBeforeMinor: m.totalMinor, totalAfterMinor: totalAfter, walletEntryId } });
  let erpPushId: string | null = null;
  if (next) {
    erpPushId = await resendErp(deps, tx, o, next.codAmountMinor, next.totalMinor);
  }
  const after = await tx.order.update({ where: { id: o.id }, data: { ...(next ?? {}), version: { increment: 1 } }, select: { version: true, totalMinor: true } });
  const type = line.state === 'APPLIED' ? PRICE_ADJUSTED_EVENT : line.state === 'PENDING' ? PRICE_ASKED_EVENT : PRICE_REFUSED_EVENT;
  const data = { lineId: id, kind: line.kind, percent: line.percent, amountMinor: line.amountMinor, requestId: line.requestId, reason: { key: line.reasonKey, en: reason.en, bn: reason.bn }, totalBeforeMinor: m.totalMinor, totalAfterMinor: totalAfter, pinChecked: line.pinChecked, walletEntryId, erpPushId };
  await eventRow(tx, by, { storeId: o.storeId, orderId: o.id, type, reasonCode: line.reasonKey, message: line.note, data });
  await auditRow(tx, by, { storeId: o.storeId, action: type, entityType: 'Order', entityId: o.id, before: { totalMinor: m.totalMinor, discountMinor: m.discountMinor, deliveryChargeMinor: m.deliveryChargeMinor, walletAppliedMinor: m.walletAppliedMinor, codAmountMinor: m.codAmountMinor, version: o.version }, after: { ...(next ?? { totalMinor: m.totalMinor }), version: after.version, lineId: id, state: line.state } });
  return { state: line.state, lineId: id, orderId: o.id, number: o.number, totalMinor: after.totalMinor, version: after.version };
}

/** The refusal of a state the machine says no to (booked, a cancel asked, not open any more). */
async function mustBeOpen(tx: Tx, o: LockedOrder): Promise<void> {
  const p = plan('edit', machineOf(o, await factsOf(tx, o)));
  if (!p.ok) throw new OrdersError(p.code, `a price is not adjusted from this state (${p.from})`, [], { from: p.from, allowed: p.allowed });
}

async function reasonOf(deps: OrdersDeps, storeId: number, key: string, note: string | undefined): Promise<{ key: string; en: string; bn: string }> {
  const cfg = await setting(deps, storeId, 'orders.priceAdjust');
  const r = cfg.reasons.find((x) => x.key === key);
  if (!r) throw new OrdersError('REASON_REQUIRED', 'pick a reason from the list', ['reasonKey']);
  if (r.key === PRICE_ADJUST_OTHER_KEY && !note) throw new OrdersError('REASON_REQUIRED', 'this reason needs a note', ['note']);
  return r;
}

/** A person takes money off an open order. Inside his limit it applies; above it, it applies with the owner's PIN or waits as a request. */
export async function adjustPrice(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<AdjustResult> {
  await allow(deps, who, 'orders.priceAdjust');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(adjustInput, input, 'price adjust');
  const cfg = await setting(deps, who.storeId, 'orders.priceAdjust');
  if (!cfg.enabled) throw new OrdersError('ADJUST_OFF', 'price adjust is switched off', []);
  const reason = await reasonOf(deps, who.storeId, d.reasonKey, d.note);
  const me = await roleKeysOf(deps, who);
  const limit = limitFor(me.keys, cfg.roleLimits, me.owner);
  const by = staffBy(who.actor, who.ctx);

  // what the screen showed, to know whether the owner's PIN is needed before the order is locked
  const pre = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: MONEY_SELECT });
  if (!pre) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const preCalc = calcAdjust(d.kind, d.value, moneyOf(pre), await walletBalance(deps.db, pre.customerId));
  if (!preCalc.ok) throw new OrdersError(preCalc.code, 'this adjustment cannot be made', [preCalc.field], preCalc.maxMinor === undefined ? undefined : { maxMinor: preCalc.maxMinor });
  const preNeeds = aboveLimit(d.kind, preCalc, pre.subtotalMinor, limit);
  let pinChecked = false;
  if (preNeeds && me.canApprove) {
    await verifyOwnerPin(deps.db, who.actor, d.pin, await pinPolicy(deps), { action: PIN_ACTION, storeId: who.storeId, now: nowOf(deps), ctx: { source: 'admin-api', ...who.ctx } });
    pinChecked = true;
  }

  return deps.db.$transaction(async (tx) => {
    const o = await lockOrder(tx, who.storeId, orderId);
    await deps.hooks?.afterLock?.(o.id);
    if (opts.version !== undefined && opts.version !== o.version) throw new OrdersError('STALE', 'the order changed since it was read', ['version'], { version: o.version, status: o.status });
    await mustBeOpen(tx, o);
    const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: MONEY_SELECT });
    const c = calcAdjust(d.kind, d.value, moneyOf(row), await walletBalance(tx, row.customerId));
    if (!c.ok) throw new OrdersError(c.code, 'this adjustment cannot be made', [c.field], c.maxMinor === undefined ? undefined : { maxMinor: c.maxMinor });
    const needs = aboveLimit(d.kind, c, row.subtotalMinor, limit);
    const base = { kind: d.kind, percent: c.percent, amountMinor: c.amountMinor, reasonKey: reason.key, note: d.note ?? null, requestId: null, requestedById: who.actor.staffUserId };
    if (needs && !me.canApprove) return writeLine(deps, tx, o, by, { ...base, state: 'PENDING', decidedById: null, pinChecked: false }, reason);
    if (needs && !pinChecked) throw new OrdersError('STALE', 'the order changed since it was read; the PIN is needed now', ['pin'], { version: o.version });
    return writeLine(deps, tx, o, by, { ...base, state: 'APPLIED', decidedById: who.actor.staffUserId, pinChecked }, reason);
  }, TX);
}

/** The answer to a request above the asker's limit: approve (the owner's PIN) or refuse. Either is a new ledger line. */
export async function decidePriceAdjust(deps: OrdersDeps, who: Who, requestId: string, input: unknown): Promise<AdjustResult> {
  await allow(deps, who, 'orders.priceApprove');
  if (!UUID.test(requestId)) throw new OrdersError('NOT_FOUND', 'no such request', ['requestId']);
  const d = parse(priceDecideInput, input, 'answer');
  const cfg = await setting(deps, who.storeId, 'orders.priceAdjust');
  if (!cfg.enabled) throw new OrdersError('ADJUST_OFF', 'price adjust is switched off', []);
  const req = await deps.db.orderPriceAdjustment.findFirst({ where: { id: requestId, storeId: who.storeId, state: 'PENDING' }, select: { ...LINE_SELECT, orderId: true } });
  if (!req) throw new OrdersError('NOT_FOUND', 'no such request waiting for an answer', ['requestId']);
  const approve = d.decision === 'approve';
  if (approve) await verifyOwnerPin(deps.db, who.actor, d.pin, await pinPolicy(deps), { action: `${PIN_ACTION}.approve`, storeId: who.storeId, now: nowOf(deps), ctx: { source: 'admin-api', ...who.ctx } });
  const reasonRow = cfg.reasons.find((x) => x.key === req.reasonKey) ?? { key: req.reasonKey, en: req.reasonKey, bn: req.reasonKey };
  const by = staffBy(who.actor, who.ctx);
  return deps.db.$transaction(async (tx) => {
    const o = await lockOrder(tx, who.storeId, req.orderId);
    const answered = await tx.orderPriceAdjustment.findFirst({ where: { requestId: req.id }, select: { state: true } });
    if (answered) throw new OrdersError('ALREADY_DECIDED', 'this request was answered already', ['requestId'], { state: answered.state });
    const base = { kind: req.kind, percent: req.percent, amountMinor: req.amountMinor, reasonKey: req.reasonKey, note: d.note ?? req.note, requestId: req.id, requestedById: req.requestedById, decidedById: who.actor.staffUserId };
    if (!approve) return writeLine(deps, tx, o, by, { ...base, state: 'REJECTED', pinChecked: false }, reasonRow);
    await mustBeOpen(tx, o);
    // the money again as it is now: a percent and a delivery charge are worked out from the order as it stands
    const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: MONEY_SELECT });
    const value = req.kind === 'PERCENT' ? (req.percent ?? undefined) : req.kind === 'FREE_DELIVERY' ? undefined : req.amountMinor;
    const c = calcAdjust(req.kind, value, moneyOf(row), await walletBalance(tx, row.customerId));
    if (!c.ok) throw new OrdersError(c.code, 'this adjustment cannot be made any more', [c.field], c.maxMinor === undefined ? undefined : { maxMinor: c.maxMinor });
    return writeLine(deps, tx, o, by, { ...base, amountMinor: c.amountMinor, percent: c.percent, state: 'APPLIED', pinChecked: true }, reasonRow);
  }, TX);
}

export interface PriceAdjustView {
  enabled: boolean;
  /** This person may take money off (the key), the switch is on and the order is open. */
  canAdjust: boolean;
  canApprove: boolean;
  /** Why a person with the key cannot adjust now (null while open): `off` or the machine's refusal code. */
  closed: string | null;
  limit: { amountMinor: number | null; percent: number | null };
  reasons: { key: string; en: string; bn: string; noteRequired: boolean }[];
  /** What the customer still has to pay: the most an adjustment may take off. */
  dueMinor: number;
  subtotalMinor: number;
  deliveryChargeMinor: number;
  walletBalanceMinor: number;
  /** Newest first. */
  lines: AdjustLine[];
  /** The requests still waiting for an answer. */
  pending: AdjustLine[];
}

/** One order's price ledger and what this person may do with it now (the order page and the API read this). */
export async function priceAdjustView(deps: OrdersDeps, who: Who, orderId: string): Promise<PriceAdjustView | null> {
  await allow(deps, who, 'orders.read');
  if (!UUID.test(orderId)) return null;
  const row = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { ...MACHINE_SELECT, ...MONEY_SELECT } });
  if (!row) return null;
  const [cfg, me, held, facts, rows] = await Promise.all([
    setting(deps, who.storeId, 'orders.priceAdjust'),
    roleKeysOf(deps, who),
    actorPermissions(deps.db, who.actor, { storeId: who.storeId }),
    factsOf(deps.db, { id: orderId, storeId: who.storeId }),
    deps.db.orderPriceAdjustment.findMany({ where: { storeId: who.storeId, orderId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: LINE_SELECT }),
  ]);
  const p = plan('edit', machineOf(row, facts));
  const answered = new Set(rows.flatMap((l) => (l.requestId ? [l.requestId] : [])));
  return {
    enabled: cfg.enabled,
    canAdjust: cfg.enabled && held.has('orders.priceAdjust') && p.ok,
    canApprove: cfg.enabled && me.canApprove,
    closed: !cfg.enabled ? 'off' : p.ok ? null : p.code,
    limit: limitFor(me.keys, cfg.roleLimits, me.owner),
    reasons: cfg.reasons.map((r) => ({ ...r, noteRequired: r.key === PRICE_ADJUST_OTHER_KEY })),
    dueMinor: priceDueOf(moneyOf(row)),
    subtotalMinor: row.subtotalMinor,
    deliveryChargeMinor: row.deliveryChargeMinor,
    walletBalanceMinor: await walletBalance(deps.db, row.customerId),
    lines: rows,
    pending: rows.filter((l) => l.state === 'PENDING' && !answered.has(l.id)),
  };
}
