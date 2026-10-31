// PR 189 (S08; Blueprint B1.8; BACKEND-ARCHITECTURE §6.5.0, §6.5.4) — return handling, with the owner's policy that
// there are no returns after receipt (`policy.returns.afterDelivery`, off by default: once the customer has the parcel,
// the way back is an exchange, PR 185). Three ways a parcel comes back to the shop, each one return record (EXPECTED →
// RECEIVED → QC_DONE → CLOSED, the checks of PR 187 in between):
//   - the courier brings the parcel back (refused at the door or failed for good): `orderStep('returned')` opens it in
//     the same transaction as the order's RETURNED (the §6.5.0 mapping rule), every active line expected back; the
//     refused part of a partial delivery likewise — REFUSED_AT_DOOR, with the refusal reason when there is one (PR 191);
//   - a return after receipt, only when the policy allows it: for every reason when returns after delivery are on, or
//     for the shop's own mistake (a defect, a wrong item) when `orders.returns.handling.ourFaultReturns` is on; inside
//     the window from the courier's delivered mark (`windowHours`, empty = the exchange window). `openReturn` checks it
//     under the order's row lock (the `returnCase` command: the order keeps its state, the timeline and audit get it);
//   - an exchange's old piece (PR 185/187) — opened when the exchange is approved.
// A person closes a return once it is checked (or, with a note, one that never arrived).
//
// Never here: paying anything back. A return after receipt notes what the customer paid for those pieces
// (`refundDueMinor`, on the timeline); the refund REQUEST a person approves comes with S07's refunds (follow-up 441).
// Nothing changes a price, a discount or COD, and nobody is blocked (CLAUDE.md rule 6).
import { z } from 'zod';
import { isV6 } from '@extas/inventory';
import { setRulesFor } from '@extas/payments';
import { allow, nowOf, parse, setting, type Db, type OrdersDeps, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { OPEN_EXCHANGE, paidPerPiece } from './exchange';
import { exchangeWindow, type ExchangeWindow } from './exchange-pure';
import { ourFaultRefusal, proposeRefused } from './refused';
import { onReturn, type ReturnStepOptions } from './returns';
import { execute, staffBy, type By, type CommandOptions } from './service';

/** Why a customer sends a delivered piece back. The codes are fixed; their words are the admin's messages. */
export const RETURN_REASON_CODES = ['changed-mind', 'defect', 'wrong', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASON_CODES)[number];

/** The reasons that are the shop's own mistake (never counted against the customer, SIM-F-044). */
export const OUR_FAULT_RETURN = new Set<ReturnReason>(['defect', 'wrong']);

/** Why a return after receipt cannot be opened now. */
export type ReturnClosedWhy = 'POLICY' | 'NOT_DELIVERED' | 'UNKNOWN' | 'WINDOW';

export interface ReturnRules {
  /** Returns after delivery are on for every reason (`policy.returns.afterDelivery`). */
  afterDelivery: boolean;
  /** The shop's own mistake may come back even with returns off (`orders.returns.handling.ourFaultReturns`). */
  ourFaultReturns: boolean;
  windowHours: number;
}

/** The reasons open under the rules (an empty list: no returns after receipt). Pure. */
export function openReasons(rules: Pick<ReturnRules, 'afterDelivery' | 'ourFaultReturns'>): ReturnReason[] {
  return RETURN_REASON_CODES.filter((r) => rules.afterDelivery || (rules.ourFaultReturns && OUR_FAULT_RETURN.has(r)));
}

/** Whether a return after receipt can be opened at all on this order now. Pure. */
export function returnClosedWhy(rules: Pick<ReturnRules, 'afterDelivery' | 'ourFaultReturns'>, status: string, window: ExchangeWindow): ReturnClosedWhy | null {
  if (!openReasons(rules).length) return 'POLICY';
  if (status !== 'DELIVERED' && status !== 'PARTIALLY_DELIVERED') return 'NOT_DELIVERED';
  if (window.state === 'UNKNOWN') return 'UNKNOWN';
  if (window.state === 'CLOSED') return 'WINDOW';
  return null;
}

export async function returnRulesFor(deps: OrdersDeps, storeId: number): Promise<ReturnRules> {
  const [afterDelivery, handling, exchangeHours, v6] = await Promise.all([setting(deps, storeId, 'policy.returns.afterDelivery'), setting(deps, storeId, 'orders.returns.handling'), setting(deps, storeId, 'policy.exchange.windowHours'), isV6(deps, storeId)]);
  // CN-028 · PR 612–614: on ERP contract v6 there are no returns or refunds after delivery, whatever the old switches
  // say; the customer's way back is an exchange within its window (exchange-v6.ts). Closed as POLICY.
  if (v6) return { afterDelivery: false, ourFaultReturns: false, windowHours: handling.windowHours ?? exchangeHours };
  return { afterDelivery, ourFaultReturns: handling.ourFaultReturns, windowHours: handling.windowHours ?? exchangeHours };
}

const LINE_FACTS = { id: true, sku: true, variantId: true, productName: true, colourName: true, sizeLabel: true, quantity: true, lineTotalMinor: true } as const;

/** Pieces of each line already on their way back (any return of the order) or asked for in an open exchange. */
async function takenBack(db: Db, storeId: number, orderId: string): Promise<Map<string, number>> {
  const [returned, exchanged] = await Promise.all([
    db.returnItem.groupBy({ by: ['orderItemId'], where: { storeId, returnRecord: { orderId } }, _sum: { quantity: true } }),
    // an approved exchange's old piece is already a return item; a requested one is not yet
    db.exchangeItem.groupBy({ by: ['originalOrderItemId'], where: { storeId, exchange: { orderId, status: 'REQUESTED' } }, _sum: { quantity: true } }),
  ]);
  const m = new Map<string, number>();
  for (const r of returned) m.set(r.orderItemId, (m.get(r.orderItemId) ?? 0) + (r._sum.quantity ?? 0));
  for (const e of exchanged) m.set(e.originalOrderItemId, (m.get(e.originalOrderItemId) ?? 0) + (e._sum.quantity ?? 0));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// The courier brings it back (the §6.5.0 mapping rule)
// ---------------------------------------------------------------------------------------------------------------------

/** The kinds of a parcel that came back from the door (never an exchange pick-up or a return after receipt). */
const DOOR_KINDS = ['REFUSED_AT_DOOR', 'CHARGE_PAID_RETURN'] as const;

/**
 * Opens the return of a parcel the courier brings back, in the order step's own transaction: every active line not
 * kept by the customer is expected back. No line left → nothing. Called by `orderStep` for `returned` and for the
 * refused part of `partiallyDelivered`; one per order and step (its key).
 */
export async function openCourierReturn(
  deps: Pick<OrdersDeps, 'settings'>,
  tx: Tx,
  o: { id: string; storeId: number; customerId: string | null; phone: string | null },
  x: { step: 'returned' | 'partiallyDelivered'; refusalKey: string | null; keptItemIds: readonly string[]; chargePaidMinor: number; now: Date },
): Promise<string | null> {
  const lines = await tx.orderItem.findMany({ where: { storeId: o.storeId, orderId: o.id, status: 'ACTIVE', id: { notIn: [...x.keptItemIds] } }, orderBy: { createdAt: 'asc' }, select: LINE_FACTS });
  if (!lines.length) return null;
  // PR 191: the shop's own fault (SIM-F-044) is marked and never counted; the delivery charge paid at the door is kept
  const ourFault = await ourFaultRefusal(deps, o.storeId, x.refusalKey);
  const items = { create: lines.map((l) => ({ storeId: o.storeId, orderItemId: l.id, quantity: l.quantity, variantId: l.variantId, expectedSku: l.sku })) };
  const facts = {
    // a parcel that never stayed with the customer: refused at the door or failed for good (the phone history keeps
    // RETURNED for a return after receipt, PR 157); he paid the delivery charge at the door and refused the rest
    kind: x.chargePaidMinor > 0 ? ('CHARGE_PAID_RETURN' as const) : ('REFUSED_AT_DOOR' as const),
    chargePaidMinor: x.chargePaidMinor,
    ourFault,
    status: 'EXPECTED' as const,
    idempotencyKey: `order:${o.id}:${x.step}`,
  };
  // PR 526: the parcel's one return record — a reason recorded while the parcel was still on its way back (or a
  // delivery check resolved) already opened it, so the courier's "returned" fills that record instead of a second one
  const early = await tx.returnRecord.findFirst({ where: { storeId: o.storeId, orderId: o.id, kind: { in: [...DOOR_KINDS] }, idempotencyKey: null, exchangeId: null, items: { none: {} } }, orderBy: { createdAt: 'asc' }, select: { id: true, reasonCode: true } });
  const ret = early
    ? await tx.returnRecord.update({ where: { id: early.id }, data: { ...facts, reasonCode: x.refusalKey ?? early.reasonCode, items }, select: { id: true } })
    : await tx.returnRecord.create({ data: { storeId: o.storeId, orderId: o.id, customerId: o.customerId, ...facts, reasonCode: x.refusalKey, items }, select: { id: true } });
  // PR 191: a number with enough counted refusals is proposed for the refused-parcel list (a person decides)
  if (x.step === 'returned') await proposeRefused(deps, tx, o, { refusalKey: x.refusalKey, ourFault, now: x.now });
  return ret.id;
}

// ---------------------------------------------------------------------------------------------------------------------
// A return after receipt — only when the policy allows it
// ---------------------------------------------------------------------------------------------------------------------

export interface ReturnLine {
  id: string;
  sku: string;
  productName: string;
  colourName: string | null;
  sizeLabel: string | null;
  quantity: number;
  /** Pieces that may still come back (not already on a return or an open exchange). */
  returnable: number;
  paidPerPieceMinor: number;
}

export interface ReturnChoices {
  orderId: string;
  number: string;
  status: string;
  /** Why no return after receipt can be opened now (null: it can, for `reasons`). */
  closed: ReturnClosedWhy | null;
  reasons: { code: ReturnReason; ourFault: boolean }[];
  window: ExchangeWindow;
  windowHours: number;
  lines: ReturnLine[];
}

/** What a return after receipt may be on this order now: the policy, the window, the lines and their pieces left. */
export async function returnChoices(deps: OrdersDeps, who: Who, orderId: string): Promise<ReturnChoices> {
  await allow(deps, who, 'returns.view');
  if (!z.uuid().safeParse(orderId).success) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { id: true, number: true, status: true, deliveredAt: true } });
  if (!o) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const rules = await returnRulesFor(deps, who.storeId);
  const window = exchangeWindow(o.deliveredAt, rules.windowHours, nowOf(deps));
  const [items, taken] = await Promise.all([deps.db.orderItem.findMany({ where: { storeId: who.storeId, orderId: o.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: LINE_FACTS }), takenBack(deps.db, who.storeId, o.id)]);
  return {
    orderId: o.id,
    number: o.number,
    status: o.status,
    closed: returnClosedWhy(rules, o.status, window),
    reasons: openReasons(rules).map((code) => ({ code, ourFault: OUR_FAULT_RETURN.has(code) })),
    window,
    windowHours: rules.windowHours,
    lines: items.map((i) => ({ id: i.id, sku: i.sku, productName: i.productName, colourName: i.colourName, sizeLabel: i.sizeLabel, quantity: i.quantity, returnable: Math.max(0, i.quantity - (taken.get(i.id) ?? 0)), paidPerPieceMinor: paidPerPiece(i) })),
  };
}

export const openReturnInput = z
  .object({
    reason: z.enum(RETURN_REASON_CODES),
    note: z.string().trim().min(1).max(1_000).optional(),
    items: z
      .array(z.object({ orderItemId: z.uuid(), quantity: z.int().min(1).max(500).optional() }).strict())
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.reason === 'other' && !v.note) c.addIssue({ code: 'custom', path: ['note'], message: 'this reason needs a note' });
  });

export interface OpenReturnResult {
  returnId: string;
  orderId: string;
  kind: string;
  status: string;
  /** What the customer paid for these pieces — only noted; the refund request comes with S07 (follow-up 441). */
  refundDueMinor: number;
  replay: boolean;
}

const idemKey = (key: string) => `case:${key}`;

async function openedBy(db: Db, storeId: number, key: string, orderId: string): Promise<OpenReturnResult | null> {
  const r = await db.returnRecord.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: idemKey(key) } }, include: { items: true } });
  if (!r) return null;
  if (r.orderId !== orderId) throw new OrdersError('IDEMPOTENCY_MISMATCH', 'this key was used for another request', ['idempotencyKey']);
  const lines = await db.orderItem.findMany({ where: { id: { in: r.items.map((i) => i.orderItemId) } }, select: { id: true, quantity: true, lineTotalMinor: true } });
  const due = r.items.reduce((s, i) => s + paidPerPiece(lines.find((l) => l.id === i.orderItemId) ?? { quantity: 0, lineTotalMinor: 0 }) * i.quantity, 0);
  return { returnId: r.id, orderId: r.orderId, kind: r.kind, status: r.status, refundDueMinor: due, replay: true };
}

/**
 * CN-018 (4): a Fixed set is returned whole or not at all — a return of the customer's own choice that takes back only
 * some of its pieces (or only some of a piece's quantity) is refused. A fault of ours (a wrong or damaged piece) may
 * always come back on its own. Nothing is read while the owner's `combos.split` is off.
 */
async function refuseFixedSplit(tx: Tx, deps: OrdersDeps, storeId: number, orderId: string, back: readonly { item: { id: string; quantity: number }; quantity: number }[]): Promise<void> {
  const set = await tx.orderItem.findMany({ where: { storeId, orderId, status: 'ACTIVE', comboId: { not: null }, comboGroupKey: { not: null } }, select: { id: true, quantity: true, comboId: true, comboGroupKey: true } });
  if (!set.length) return;
  const rules = await setRulesFor(tx, deps, storeId, set.map((l) => l.comboId!));
  const whole = new Map(back.map((b) => [b.item.id, b.quantity >= b.item.quantity]));
  const split = new Set<string>();
  for (const key of new Set(set.map((l) => l.comboGroupKey!))) {
    const group = set.filter((l) => l.comboGroupKey === key);
    const rule = rules.get(group[0]!.comboId!);
    if (rule?.mode !== 'FIXED' || !group.some((l) => whole.has(l.id))) continue;
    if (!group.every((l) => whole.get(l.id) === true)) split.add(rule.name);
  }
  if (split.size) throw new OrdersError('SET_FIXED', 'a fixed set is returned whole or not at all', ['items'], { sets: [...split] });
}

/**
 * Opens a return after receipt (EXPECTED) — only when the policy allows that reason, inside the window from the
 * delivered mark, for pieces not already coming back. Needs `returns.decide`. An `idempotencyKey` makes a repeated
 * press answer with the same return.
 */
export async function openReturn(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<OpenReturnResult> {
  await allow(deps, who, 'returns.decide');
  if (!z.uuid().safeParse(orderId).success) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(openReturnInput, input, 'return');
  if (new Set(d.items.map((i) => i.orderItemId)).size !== d.items.length) throw new OrdersError('INVALID_INPUT', 'each line once', ['items']);
  if (opts.idempotencyKey) {
    const again = await openedBy(deps.db, who.storeId, opts.idempotencyKey, orderId);
    if (again) return again;
  }
  const rules = await returnRulesFor(deps, who.storeId);
  const by: By = staffBy(who.actor, who.ctx);
  const ourFault = OUR_FAULT_RETURN.has(d.reason);
  let out: OpenReturnResult | null = null;
  await execute(
    deps,
    { storeId: who.storeId, orderId },
    by,
    {
      command: 'returnCase',
      input: d as unknown as Record<string, unknown>,
      effect: async (tx, lo, _f, { now }) => {
        const o = await tx.order.findUniqueOrThrow({ where: { id: lo.id }, select: { id: true, storeId: true, status: true, customerId: true, deliveredAt: true } });
        const window = exchangeWindow(o.deliveredAt, rules.windowHours, now);
        const why = returnClosedWhy(rules, o.status, window);
        if (why) throw new OrdersError('RETURN_CLOSED', why === 'POLICY' ? 'no returns after receipt (the policy); an exchange is the way back' : why === 'WINDOW' ? 'the return window has passed' : why === 'UNKNOWN' ? 'the delivered mark is missing; check the courier' : 'the parcel is not with the customer', ['status'], { why });
        if (!openReasons(rules).includes(d.reason)) throw new OrdersError('RETURN_CLOSED', 'the policy takes no return for this reason', ['reason'], { why: 'POLICY' });
        const taken = await takenBack(tx, o.storeId, o.id);
        const lines = [];
        for (const x of d.items) {
          const item = await tx.orderItem.findFirst({ where: { id: x.orderItemId, storeId: o.storeId, orderId: o.id, status: 'ACTIVE' }, select: LINE_FACTS });
          if (!item) throw new OrdersError('NOT_FOUND', 'no such line on this order', ['orderItemId']);
          const quantity = x.quantity ?? item.quantity;
          const left = Math.max(0, item.quantity - (taken.get(item.id) ?? 0));
          if (quantity > left) throw new OrdersError('RETURN_LIMIT', 'these pieces are already coming back (a return or an open exchange)', [item.id], { left });
          lines.push({ item, quantity });
        }
        if (!ourFault) await refuseFixedSplit(tx, deps, o.storeId, o.id, lines);
        const refundDueMinor = lines.reduce((s, l) => s + paidPerPiece(l.item) * l.quantity, 0);
        const ret = await tx.returnRecord.create({
          data: {
            storeId: o.storeId,
            orderId: o.id,
            customerId: o.customerId,
            kind: ourFault ? 'DEFECT_RETURN' : 'RETURNED',
            reasonCode: d.reason,
            status: 'EXPECTED',
            ourFault,
            note: d.note ?? null,
            idempotencyKey: opts.idempotencyKey ? idemKey(opts.idempotencyKey) : null,
            items: { create: lines.map((l) => ({ storeId: o.storeId, orderItemId: l.item.id, quantity: l.quantity, variantId: l.item.variantId, expectedSku: l.item.sku })) },
          },
          select: { id: true, kind: true, status: true },
        });
        out = { returnId: ret.id, orderId: o.id, kind: ret.kind, status: ret.status, refundDueMinor, replay: false };
        return {
          reasonCode: d.reason,
          message: d.note ?? null,
          eventData: { returnId: ret.id, kind: ret.kind, ourFault, items: lines.map((l) => ({ sku: l.item.sku, quantity: l.quantity })), refundDueMinor },
          audit: { before: {}, after: { returnId: ret.id, kind: ret.kind, refundDueMinor } },
        };
      },
    },
    opts,
  );
  if (!out) throw new OrdersError('RETURN_STATE', 'the return was not opened');
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Closed by a person
// ---------------------------------------------------------------------------------------------------------------------

const closeInput = z.object({ note: z.string().trim().min(1).max(1_000).optional() }).strict();

/**
 * Closes a return: once every piece is checked (QC_DONE), or — with a note saying why — one that never arrived
 * (EXPECTED) or was received and will not be checked. Nothing is deleted; the pieces keep what QC recorded. An
 * exchange's old piece is closed with its exchange's own steps first. Needs `returns.decide`.
 */
export async function closeReturn(deps: OrdersDeps, who: Who, id: string, input: unknown = {}, opts: ReturnStepOptions = {}): Promise<{ returnId: string; status: string }> {
  await allow(deps, who, 'returns.decide');
  const d = parse(closeInput, input, 'closing');
  return onReturn(deps, who, id, opts, async (tx, r, now) => {
    if (r.status === 'CLOSED') throw new OrdersError('RETURN_STATE', 'the return is closed already', ['status'], { status: r.status });
    if (r.status !== 'QC_DONE' && !d.note) throw new OrdersError('INVALID_INPUT', 'a return not checked yet needs a note to close', ['note']);
    if (r.exchangeId) {
      const ex = await tx.exchange.findUnique({ where: { id: r.exchangeId }, select: { status: true } });
      if (ex && (OPEN_EXCHANGE as readonly string[]).includes(ex.status) && r.status !== 'QC_DONE') throw new OrdersError('RETURN_STATE', 'the exchange is still open; finish it first', ['exchangeId'], { exchangeStatus: ex.status });
    }
    await tx.returnRecord.update({ where: { id: r.id }, data: { status: 'CLOSED', closedAt: now, closedById: who.actor.staffUserId, ...(d.note ? { note: d.note } : {}) } });
    return { action: 'closed', message: d.note ?? null, after: { status: 'CLOSED', from: r.status }, result: { returnId: r.id, status: 'CLOSED' } };
  });
}
