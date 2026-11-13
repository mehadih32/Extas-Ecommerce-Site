// S28 · PR 669 — the replacement case: a defective, damaged or wrong piece is sent again FREE and the old piece comes back.
// It is an exchange row of the kind REPLACEMENT on the returns board (exchange.ts), so the approval, the new parcel, the pick-up of
// the old piece, its check and the ERP's part are the exchange's own: nothing is built twice. What it changes:
//   · its own rule, `returns.replacement` (off as shipped): the hours after delivery it can be opened and which reasons open one;
//   · the same piece comes again: no price difference, no delivery charge, no refund and no wallet credit, whatever the piece costs now;
//   · the old piece is due back by `oldPieceDueAt` (the owner's days), shown on the board; it is never billed by itself (rule 6);
//   · the exchange's reason list, per-piece limit and tiers do not apply (a defective piece is the shop's to put right).
// A swap for a size, and the 72-hour exchange with a cheaper piece to the wallet, stay exactly as they were; there is still no cash
// refund after delivery.
import { z } from 'zod';
import { allow, nowOf, parse, setting, UUID, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { openExchangeBy, type OpenExchangeResult } from './exchange';
import { exchangeWindow } from './exchange-pure';
import { staffBy, type CommandOptions } from './service';

export const REPLACEMENT_REASON_LIST = ['defect', 'damage', 'wrong'] as const;

export const openReplacementInput = z
  .object({
    reason: z.enum(REPLACEMENT_REASON_LIST),
    reasonNote: z.string().trim().max(2_000).optional(),
    /** A wrong item: how it happened (the owner's root-cause list), when the exchange engine asks for it. */
    rootCause: z.string().trim().max(60).optional(),
    photoAssetIds: z.array(z.uuid()).max(8).optional(),
    /** The piece(s) to send again: a line of the order, with how many pieces (all of the line by default). */
    items: z.array(z.object({ orderItemId: z.uuid(), quantity: z.int().min(1).max(50).optional() }).strict()).min(1).max(50),
  })
  .strict();

export interface ReplacementView {
  enabled: boolean;
  /** This person may open one (the key), the switch is on and the order has been delivered inside the hours. */
  canOpen: boolean;
  /** Why not (null while open): `off`, `NOT_DELIVERED`, `UNKNOWN` (no delivered mark) or `PASSED` (the hours ran out). */
  closed: string | null;
  hours: number;
  oldPieceDays: number;
  reasons: string[];
  /** The order's lines that can be sent again: not already in an open exchange. */
  lines: { lineId: string; sku: string; name: string; colour: string | null; size: string | null; quantity: number }[];
  /** The owner's root causes of a wrong item (the exchange engine asks for one with a wrong item). */
  rootCauses: { key: string; en: string; bn: string }[];
  /** When the window ends (ISO), while open. */
  endsAt: string | null;
}

/** What the order page's "Send again free" dialog needs: the rule, whether it is open for this order now, and the lines. */
export async function replacementView(deps: OrdersDeps, who: Who, orderId: string): Promise<ReplacementView | null> {
  await allow(deps, who, 'returns.view');
  if (!UUID.test(orderId)) return null;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { status: true, deliveredAt: true } });
  if (!o) return null;
  const [cfg, causes] = await Promise.all([setting(deps, who.storeId, 'returns.replacement'), setting(deps, who.storeId, 'orders.exchange.rootCauses')]);
  let may = true;
  try {
    await allow(deps, who, 'returns.decide');
  } catch {
    may = false;
  }
  const delivered = o.status === 'DELIVERED' || o.status === 'PARTIALLY_DELIVERED';
  const win = exchangeWindow(o.deliveredAt, cfg.hours, nowOf(deps));
  const closed = !cfg.enabled ? 'off' : !delivered ? 'NOT_DELIVERED' : win.state === 'UNKNOWN' ? 'UNKNOWN' : win.state !== 'OPEN' ? 'PASSED' : null;
  const base = { enabled: cfg.enabled, canOpen: may && closed === null, closed, hours: cfg.hours, oldPieceDays: cfg.oldPieceDays, reasons: [...cfg.reasons], rootCauses: causes.map((c) => ({ key: c.key, en: c.en, bn: c.bn })), endsAt: closed === null && win.state === 'OPEN' ? win.endsAt.toISOString() : null };
  if (closed !== null) return { ...base, lines: [] };
  const [items, open] = await Promise.all([
    deps.db.orderItem.findMany({ where: { storeId: who.storeId, orderId, status: 'ACTIVE', variantId: { not: null } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true } }),
    deps.db.exchangeItem.findMany({ where: { storeId: who.storeId, exchange: { orderId, status: { in: ['REQUESTED', 'APPROVED', 'PICKUP_BOOKED', 'RECEIVED', 'QC_PASSED', 'QC_FAILED'] } } }, select: { originalOrderItemId: true } }),
  ]);
  const busy = new Set(open.map((x) => x.originalOrderItemId));
  return { ...base, lines: items.filter((i) => !busy.has(i.id)).map((i) => ({ lineId: i.id, sku: i.sku, name: i.productName, colour: i.colourName, size: i.sizeLabel, quantity: i.quantity })) };
}

/** Opens a replacement case (`returns.decide`; the switch `returns.replacement`). It waits on the returns board like an exchange. */
export async function openReplacement(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<OpenExchangeResult> {
  await allow(deps, who, 'returns.decide');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(openReplacementInput, input, 'replacement');
  const cfg = await setting(deps, who.storeId, 'returns.replacement');
  if (!cfg.enabled) throw new OrdersError('EXCHANGE_CLOSED', 'replacements are switched off in Rules', [], { why: 'REPLACEMENT_OFF' });
  const lines = await deps.db.orderItem.findMany({ where: { storeId: who.storeId, orderId, id: { in: d.items.map((i) => i.orderItemId) } }, select: { id: true, variantId: true } });
  const variant = new Map(lines.map((l) => [l.id, l.variantId]));
  const items = d.items.map((i) => {
    const v = variant.get(i.orderItemId);
    if (!v) throw new OrdersError('NOT_FOUND', 'no such line on this order', ['items']);
    return { orderItemId: i.orderItemId, ...(i.quantity ? { quantity: i.quantity } : {}), newVariantId: v };
  });
  return openExchangeBy(
    deps,
    { storeId: who.storeId, orderId },
    staffBy(who.actor, who.ctx),
    { reason: d.reason, ...(d.reasonNote ? { reasonNote: d.reasonNote } : {}), ...(d.rootCause ? { rootCause: d.rootCause } : {}), ...(d.photoAssetIds ? { photoAssetIds: d.photoAssetIds } : {}), items },
    opts,
    { source: 'admin', createdById: who.actor.staffUserId, hooks: { replacement: { hours: cfg.hours, oldPieceDays: cfg.oldPieceDays, reasons: cfg.reasons } } },
  );
}
