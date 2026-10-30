// PR 610, 611 (CN-028) — what the ERP's order and account events do in the shop (the handlers of the event ledger,
// erp-events.ts `ERP_EVENT_HANDLERS`). Each event is applied once (the ledger keeps it by its eventId forever); a
// correction (`reverses`) undoes the original first.
// - `account.hold`: the account is on hold (ErpAccountState): checkout pauses while `erp.hold.pauseCheckout` is on.
// - `account.released`: the hold is lifted; every order HELD for it goes again (a new key round).
// - `order.line.short`: a Return-stock piece failed the owner's packing check; its line (and so the order) waits for the
//   admin's decision (WAIT, REPLACE, CANCEL) or the stock. Undo: the line is open again.
// - `order.line.filled`: the ERP filled a waiting line; a shipment HELD behind it goes again.
// An event about an order the shop does not have on this link is IGNORED (kept in the ledger).
import type { ErpEventContext, ErpEventHandler, ErpEventOutcome } from './erp-events';
import { noteHold, wakeHeld, wakeLineWaiting } from './erp-orders-v6';

const dataOf = (ctx: ErpEventContext): Record<string, unknown> => (ctx.row.data && typeof ctx.row.data === 'object' ? (ctx.row.data as Record<string, unknown>) : {});
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function lineOf(ctx: ErpEventContext) {
  const d = dataOf(ctx);
  const ext = text(d.externalOrderId);
  const lineId = text(d.lineId);
  if (!ext || !lineId) return null;
  const order = await ctx.tx.erpOrder.findUnique({ where: { linkId_externalOrderId: { linkId: ctx.row.linkId, externalOrderId: ext } }, select: { id: true } });
  if (!order) return null;
  const line = await ctx.tx.erpOrderLine.findUnique({ where: { erpOrderId_lineId: { erpOrderId: order.id, lineId } } });
  return line ? { order, line } : null;
}

const ignored: ErpEventOutcome = { status: 'IGNORED', result: { reason: 'UNKNOWN_ORDER_OR_LINE' } };

const accountHold: ErpEventHandler = {
  async apply(ctx) {
    const d = dataOf(ctx);
    await noteHold(ctx.tx, ctx.row.storeId, ctx.row.linkId, { onHold: true, reason: text(d.reason), holdsOn: text(d.holdsOn) }, ctx.now);
    return { status: 'APPLIED', result: { onHold: true } };
  },
  async undo(ctx) {
    await noteHold(ctx.tx, ctx.row.storeId, ctx.row.linkId, { onHold: false }, ctx.now);
  },
};

const accountReleased: ErpEventHandler = {
  async apply(ctx) {
    await noteHold(ctx.tx, ctx.row.storeId, ctx.row.linkId, { onHold: false, reason: null }, ctx.now);
    const woken = await wakeHeld(ctx.tx, ctx.row.storeId, { reason: 'ACCOUNT_ON_HOLD' });
    return { status: 'APPLIED', result: { onHold: false, woken } };
  },
};

const lineShort: ErpEventHandler = {
  async apply(ctx) {
    const found = await lineOf(ctx);
    if (!found) return ignored;
    if (found.line.state === 'CANCELLED' || found.line.state === 'REMOVED') return { status: 'STORED', result: { state: found.line.state } };
    await ctx.tx.erpOrderLine.update({ where: { id: found.line.id }, data: { state: 'SHORT', shortReason: text(dataOf(ctx).reason), shortAt: ctx.now, decision: null, decisionSku: null, decidedAt: null, decidedById: null } });
    return { status: 'APPLIED', result: { lineId: found.line.lineId, state: 'SHORT' } };
  },
  async undo(ctx) {
    const found = await lineOf(ctx);
    if (found?.line.state === 'SHORT') {
      await ctx.tx.erpOrderLine.update({ where: { id: found.line.id }, data: { state: 'OPEN' } });
      await wakeLineWaiting(ctx.tx, ctx.row.storeId, found.order.id);
    }
  },
};

const lineFilled: ErpEventHandler = {
  async apply(ctx) {
    const found = await lineOf(ctx);
    if (!found) return ignored;
    if (found.line.state === 'SHORT') await ctx.tx.erpOrderLine.update({ where: { id: found.line.id }, data: { state: 'OPEN', filledAt: ctx.now } });
    const woken = await wakeLineWaiting(ctx.tx, ctx.row.storeId, found.order.id);
    return { status: 'APPLIED', result: { lineId: found.line.lineId, state: 'OPEN', woken } };
  },
};

/** The handlers of PR 610 and 611, merged into `ERP_EVENT_HANDLERS`. */
export const ERP_ORDER_EVENT_HANDLERS = {
  'account.hold': accountHold,
  'account.released': accountReleased,
  'order.line.short': lineShort,
  'order.line.filled': lineFilled,
} as const satisfies Record<string, ErpEventHandler>;
