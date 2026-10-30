// PR 610, 611 (CN-028) — what the ERP's order and account events do in the shop (the handlers of the event ledger,
// erp-events.ts `ERP_EVENT_HANDLERS`). Each event is applied once (the ledger keeps it by its eventId forever); a
// correction (`reverses`) undoes the original first.
// - `account.hold`: the account is on hold (ErpAccountState): checkout pauses while `erp.hold.pauseCheckout` is on.
// - `account.released`: the hold is lifted; every order HELD for it goes again (a new key round).
// - p3 review: an `account.*` event older than the newest one applied on the link (by `occurredAt`), or older than the
//   account check (`GET /account`, `checkedAt`) that last said the opposite, is IGNORED (OLDER): a late hold never
//   pauses checkout again after the ERP released the account, and a late release never lifts a newer hold.
//   Round 2 (two clocks): `occurredAt` is the ERP's clock and `checkedAt` the shop's, so an event is older than a check
//   only by more than the skew margin (`erp.webhook.maxAgeSeconds`, the same window a signed call may be off by). An
//   event is placed at its `occurredAt`, but never later than its arrival plus that margin: a far-future date (a wrong
//   ERP clock) never makes it "newer" than every real event after it.
// - `order.line.short`: a Return-stock piece failed the owner's packing check; its line (and so the order) waits for the
//   admin's decision (WAIT, REPLACE, CANCEL) or the stock. Undo: the line is open again.
// - `order.line.filled`: the ERP filled a waiting line; a shipment HELD behind it goes again.
// - `delivery.identified` (PR 611): the ERP's identification of a delivery result (GREEN, YELLOW, ORANGE), shown on the
//   order page. The answer to `PUT /orders/{id}/delivery` carries the same, so a lost webhook loses nothing.
// An event about an order the shop does not have on this link is IGNORED (kept in the ledger).
import { setting } from './context';
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

const ACCOUNT_EVENTS = ['account.hold', 'account.released'];

/** Round 2: where an event sits in time — its `occurredAt`, but never later than its arrival plus the skew margin. */
const placedAt = (e: { occurredAt: Date; receivedAt: Date }, marginMs: number): number => Math.min(e.occurredAt.getTime(), e.receivedAt.getTime() + marginMs);

/**
 * p3 review: is there newer news of the account than this event? A newer `account.*` event applied on the same link,
 * or an account check made more than the skew margin after it that found the other state (round 2). An event without
 * `occurredAt` cannot be placed in time: it is applied as before.
 */
async function newerAccountNews(ctx: ErpEventContext, onHold: boolean): Promise<ErpEventOutcome | null> {
  const occurredAt = ctx.row.occurredAt;
  if (!occurredAt) return null;
  const marginMs = (await setting(ctx.deps, null, 'erp.webhook.maxAgeSeconds')) * 1000;
  const at = placedAt({ occurredAt, receivedAt: ctx.row.receivedAt }, marginMs);
  // Only an event dated after this one can be newer; its own place (capped the same way) decides.
  const later = await ctx.tx.erpEvent.findMany({
    where: { storeId: ctx.row.storeId, linkId: ctx.row.linkId, type: { in: ACCOUNT_EVENTS }, id: { not: ctx.row.id }, status: 'APPLIED', occurredAt: { gt: new Date(at) } },
    orderBy: { occurredAt: 'desc' },
    select: { eventId: true, occurredAt: true, receivedAt: true },
  });
  const newer = later.find((e) => e.occurredAt && placedAt({ occurredAt: e.occurredAt, receivedAt: e.receivedAt }, marginMs) > at);
  if (newer) return { status: 'IGNORED', result: { why: 'OLDER', newer: newer.eventId } };
  const state = await ctx.tx.erpAccountState.findUnique({ where: { linkId: ctx.row.linkId }, select: { onHold: true, checkedAt: true } });
  if (state && state.onHold !== onHold && state.checkedAt && state.checkedAt.getTime() > at + marginMs) return { status: 'IGNORED', result: { why: 'OLDER', checkedAt: state.checkedAt.toISOString() } };
  return null;
}

const accountHold: ErpEventHandler = {
  async apply(ctx) {
    const older = await newerAccountNews(ctx, true);
    if (older) return older;
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
    const older = await newerAccountNews(ctx, false);
    if (older) return older;
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

const deliveryIdentified: ErpEventHandler = {
  async apply(ctx) {
    const d = dataOf(ctx);
    const ext = text(d.externalOrderId);
    if (!ext) return ignored;
    const order = await ctx.tx.erpOrder.findUnique({ where: { linkId_externalOrderId: { linkId: ctx.row.linkId, externalOrderId: ext } }, select: { id: true } });
    if (!order) return ignored;
    const status = text(d.status);
    await ctx.tx.erpOrder.update({ where: { id: order.id }, data: { identification: status && status !== 'PARTIAL' ? null : text(d.identification), identifiedAt: ctx.now } });
    return { status: 'APPLIED', result: { identification: text(d.identification) } };
  },
};

/** The handlers of PR 610 and 611, merged into `ERP_EVENT_HANDLERS`. */
export const ERP_ORDER_EVENT_HANDLERS = {
  'account.hold': accountHold,
  'account.released': accountReleased,
  'order.line.short': lineShort,
  'order.line.filled': lineFilled,
  'delivery.identified': deliveryIdentified,
} as const satisfies Record<string, ErpEventHandler>;
