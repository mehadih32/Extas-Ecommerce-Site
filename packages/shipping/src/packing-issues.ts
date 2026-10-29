// PR 183 (Blueprint B1.2, B1.15 #2; CN-017 SIM-F-006; owner answers 41 and 42) — a defective or missing piece at the
// packing table, and the card a person decides it on.
//
// - "Report defect / out of stock" on one line: a packing card (PackingIssue DAMAGED or NOT_FOUND) with who and when,
//   and — the owner's switch `fulfilment.packing.issues.holdOrder`, on by default as Blueprint B1.2 says — the order put
//   on hold through the order service with the owner's hold reason (from confirmed or from picking). The card and the
//   hold are one step under the order's lock.
// - A shortage card (SHORTAGE) is raised by the stock sync (packages/inventory shortage.ts) when the shared balance of a
//   SKU goes below zero; it shows on the same card. Any open card stops "Mark packed" and the booking (SIM-F-006).
// - The card's decisions, each a person's explicit press, each carried out by the order service:
//     STOCK_FOUND   the piece is there (or fine) after all: the card is closed, nothing on the order changes;
//     SWAP_SIZE     another size or colour of the same piece at the same price (the order's edit, `orders.edit`);
//     SHIP_REST     this line is taken off and the rest is sent (the order's edit, `orders.edit`; on a paid order the
//                   edit records a refund REQUEST — PR 172's flow, the owner approves; no money moves here);
//     CANCEL_ORDER  the whole order is cancelled as out of stock (`orders.cancel`; a paid order's refund is a request).
//   "Call the customer" leaves a call task (PACKING_ISSUE) and keeps the card open.
// - When the last open card of a held order is decided, the hold this step put on is released (back to confirmed or
//   picking). Nothing is cancelled by itself, nothing waits on a timer: a card past the owner's hours to decide is only
//   marked late on the screen (answer 41: the team decides).
// A booked order's parcel is the parcel (SIM-F-004): swapping or taking a line off is refused with BOOKED until the
// booking is cancelled on the order's page; the screen says so.
import { z } from 'zod';
import { requirePermission } from '@extas/auth';
import { cancelOrder, editOrder, holdWith, isOrdersError, releaseWith, staffBy, type CommandResult, type OrdersDeps } from '@extas/orders';
import { allow, logChange, nowOf, parse, setting, TX, type ShippingDeps, type Tx, type Who } from './context';
import { ShippingError } from './errors';
import { lockOrder, packingOrder, type PackOrder } from './packing';

const ordersDeps = (deps: ShippingDeps): OrdersDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

/** What a packer reports on a line (a shortage card comes from the stock sync). */
export const REPORT_KINDS = ['DAMAGED', 'NOT_FOUND'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
/** What a person decides on a card. */
export const ISSUE_DECISIONS = ['STOCK_FOUND', 'SWAP_SIZE', 'SHIP_REST', 'CANCEL_ORDER'] as const;
export type IssueDecision = (typeof ISSUE_DECISIONS)[number];
/** The call task a card leaves for the confirmation caller. */
export const PACKING_CALL_REASON = 'PACKING_ISSUE';
/** The order states a piece can be reported in: confirmed, picking, or already held from one of them. */
const REPORTABLE = ['CONFIRMED', 'PROCESSING', 'ON_HOLD'] as const;
/** The cancel code of CANCEL_ORDER (the owner's words for it are in `orders.cancel.reasons`). */
const OUT_OF_STOCK = 'OUT_OF_STOCK';

const reportInput = z.object({ lineId: z.uuid(), kind: z.enum(REPORT_KINDS), note: z.string().trim().max(500).optional() }).strict();
const resolveInput = z
  .object({ decision: z.enum(ISSUE_DECISIONS), variantId: z.uuid().optional(), note: z.string().trim().max(500).optional() })
  .strict()
  .refine((d) => d.decision !== 'SWAP_SIZE' || !!d.variantId, { message: 'pick the size or colour to send', path: ['variantId'] });
const callInput = z.object({ note: z.string().trim().max(500).optional() }).strict();

const holdKeyOf = (cfg: { damagedReasonKey: string; missingReasonKey: string }, kind: string) => (kind === 'DAMAGED' ? cfg.damagedReasonKey : cfg.missingReasonKey);

/**
 * "Report defect / out of stock" on one line: the card, and (the owner's switch) the hold with his reason, in one step
 * under the order's lock. A line with an open card is refused (one card per line at a time).
 */
export async function reportIssue(deps: ShippingDeps, who: Who, orderId: string, input: unknown): Promise<PackOrder> {
  await allow(deps, who, 'fulfilment.pack');
  const d = parse(reportInput, input, 'packing card');
  const cfg = await setting(deps, who.storeId, 'fulfilment.packing.issues');
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId, archivedAt: null }, select: { status: true } });
  if (!o) throw new ShippingError('NOT_FOUND', 'no such order', ['orderId']);
  if (!(REPORTABLE as readonly string[]).includes(o.status)) throw new ShippingError('NOT_PACKING', 'a piece is reported while the order waits to be packed', [], { status: o.status });
  const card = async (tx: Tx) => {
    const line = await tx.orderItem.findFirst({ where: { id: d.lineId, orderId, storeId: who.storeId, status: 'ACTIVE' }, select: { id: true, sku: true } });
    if (!line) throw new ShippingError('NOT_IN_ORDER', 'no such line on this order', ['lineId']);
    if (await tx.packingIssue.count({ where: { storeId: who.storeId, orderItemId: line.id, resolvedAt: null } })) throw new ShippingError('ISSUE_OPEN', 'this line has an open packing card already', ['lineId']);
    const row = await tx.packingIssue.create({ data: { storeId: who.storeId, orderId, orderItemId: line.id, kind: d.kind, markedById: who.actor.staffUserId ?? null, note: d.note ?? null, createdAt: nowOf(deps) }, select: { id: true } });
    await logChange(tx, who, 'packing.issue.report', 'PackingIssue', row.id, null, { orderId, lineId: line.id, sku: line.sku, kind: d.kind, note: d.note ?? null });
    return { packingIssue: { id: row.id, kind: d.kind, lineId: line.id, sku: line.sku } };
  };
  if (cfg.holdOrder && o.status !== 'ON_HOLD') {
    await holdWith(ordersDeps(deps), { storeId: who.storeId, orderId }, staffBy(who.actor, who.ctx), holdKeyOf(cfg, d.kind), d.note, { also: (tx) => card(tx) });
  } else {
    await deps.db.$transaction(async (tx) => {
      await lockOrder(tx, who.storeId, orderId);
      await card(tx);
    }, TX);
  }
  return packingOrder(deps, who, orderId);
}

/** What deciding a card did. */
export interface IssueOutcome {
  issueId: string;
  decision: IssueDecision;
  /** The order's step (the edit or the cancel), when the decision changed the order. */
  result: CommandResult | null;
  /** The hold this step put on was released (no open card left). */
  released: boolean;
  /** Refund requests the order service recorded (a paid order): requests only, the owner approves. */
  refundRequestIds: string[];
  order: PackOrder | null;
}

/**
 * A person decides one card. The order changes only through the order service (its own permission and refusals); then
 * the card is closed with who, when and the decision, and when no open card is left the packing hold is released.
 */
export async function resolveIssue(deps: ShippingDeps, who: Who, orderId: string, issueId: string, input: unknown): Promise<IssueOutcome> {
  await allow(deps, who, 'fulfilment.pack');
  const d = parse(resolveInput, input, 'packing card decision');
  const cfg = await setting(deps, who.storeId, 'fulfilment.packing.issues');
  const issue = await deps.db.packingIssue.findFirst({ where: { id: issueId, orderId, storeId: who.storeId } });
  if (!issue) throw new ShippingError('NOT_FOUND', 'no such packing card', ['issueId']);
  if (issue.resolvedAt) throw new ShippingError('ISSUE_DECIDED', 'this card is decided already', ['issueId']);
  // "the stock was there after all" on a shortage card is a stock difference: the stock count permission decides it
  if (issue.kind === 'SHORTAGE' && d.decision === 'STOCK_FOUND') await requirePermission(deps.db, who.actor, 'inventory.audit', { storeId: who.storeId });
  const od = ordersDeps(deps);
  const by = staffBy(who.actor, who.ctx);
  const ref = { storeId: who.storeId, orderId };
  const holdKeys = [cfg.damagedReasonKey, cfg.missingReasonKey];

  let result: CommandResult | null = null;
  if (d.decision === 'SWAP_SIZE' || d.decision === 'SHIP_REST') {
    // the order's edit runs until picking starts: an order picked already is held first (this step's own hold)
    const o = await deps.db.order.findFirstOrThrow({ where: { id: orderId, storeId: who.storeId }, select: { status: true } });
    const heldHere = o.status === 'PROCESSING';
    if (heldHere) await holdWith(od, ref, by, holdKeyOf(cfg, issue.kind), d.note);
    try {
      const line = d.decision === 'SWAP_SIZE' ? { lineId: issue.orderItemId, variantId: d.variantId! } : { lineId: issue.orderItemId, remove: true as const };
      result = await editOrder(od, who, orderId, { reasonKey: cfg.editReasonKey, lines: [line], ...(d.note ? { note: d.note } : {}) });
    } catch (e) {
      // nothing changed: the hold this press put on is taken off again
      if (heldHere) await releaseWith(od, ref, by, undefined).catch(() => undefined);
      throw e;
    }
  } else if (d.decision === 'CANCEL_ORDER') {
    result = await cancelOrder(od, who, orderId, { reasonCode: OUT_OF_STOCK, ...(d.note ? { note: d.note } : {}) });
  }

  const now = nowOf(deps);
  const left = await deps.db.$transaction(async (tx) => {
    await lockOrder(tx, who.storeId, orderId);
    // a cancelled order closes every card it had; otherwise only this one
    const ids = d.decision === 'CANCEL_ORDER' ? (await tx.packingIssue.findMany({ where: { storeId: who.storeId, orderId, resolvedAt: null }, select: { id: true } })).map((r) => r.id) : [issueId];
    const closed = await tx.packingIssue.updateMany({ where: { id: { in: ids }, resolvedAt: null }, data: { resolution: d.decision, resolvedAt: now, resolvedById: who.actor.staffUserId ?? null, ...(d.note ? { note: d.note } : {}) } });
    if (!closed.count) throw new ShippingError('ISSUE_DECIDED', 'this card is decided already', ['issueId']);
    for (const id of ids) await logChange(tx, who, 'packing.issue.resolve', 'PackingIssue', id, { resolution: null }, { resolution: d.decision, note: d.note ?? null, orderStep: result?.command ?? null });
    return tx.packingIssue.count({ where: { storeId: who.storeId, orderId, resolvedAt: null } });
  }, TX);

  let released = false;
  if (!left && d.decision !== 'CANCEL_ORDER') {
    const o = await deps.db.order.findFirstOrThrow({ where: { id: orderId, storeId: who.storeId }, select: { status: true, holdReasonCode: true, holdFromStatus: true } });
    if (o.status === 'ON_HOLD' && holdKeys.includes(o.holdReasonCode ?? '') && (o.holdFromStatus === 'CONFIRMED' || o.holdFromStatus === 'PROCESSING')) {
      try {
        await releaseWith(od, ref, by, undefined);
        released = true;
      } catch (e) {
        // someone moved the order meanwhile: the card is decided; the hold is released on the order's page
        if (!isOrdersError(e)) throw e;
      }
    }
  }
  const order = await packingOrder(deps, who, orderId).catch(() => null);
  return { issueId, decision: d.decision, result, released, refundRequestIds: result?.refundRequestIds ?? [], order };
}

/** "Call the customer" on a card: one open call task (PACKING_ISSUE) for the order; the card stays open. */
export async function callAboutIssue(deps: ShippingDeps, who: Who, orderId: string, issueId: string, input: unknown = {}): Promise<{ callTaskId: string; created: boolean }> {
  await allow(deps, who, 'fulfilment.pack');
  const d = parse(callInput, input, 'call');
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await lockOrder(tx, who.storeId, orderId);
    const issue = await tx.packingIssue.findFirst({ where: { id: issueId, orderId, storeId: who.storeId, resolvedAt: null }, select: { id: true, kind: true, orderItemId: true } });
    if (!issue) throw new ShippingError('NOT_FOUND', 'no such open packing card', ['issueId']);
    const order = await tx.order.findFirstOrThrow({ where: { id: orderId, storeId: who.storeId }, select: { customerId: true } });
    const open = await tx.callTask.findFirst({ where: { storeId: who.storeId, orderId, reason: PACKING_CALL_REASON, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } });
    if (open) return { callTaskId: open.id, created: false };
    const notes = [`Packing card: ${issue.kind}`, d.note].filter(Boolean).join(' · ').slice(0, 1_000);
    const t = await tx.callTask.create({ data: { storeId: who.storeId, orderId, customerId: order.customerId, reason: PACKING_CALL_REASON, dueAt: now, notes }, select: { id: true } });
    await logChange(tx, who, 'packing.issue.call', 'PackingIssue', issue.id, null, { callTaskId: t.id, note: d.note ?? null });
    return { callTaskId: t.id, created: true };
  }, TX);
}
