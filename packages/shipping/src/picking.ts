// PR 181 (Blueprint B1.6, B1.7) — the daily consolidated picking list: one document the store keeper holds to pull every
// piece of the run in one pass, category by category.
//
// - The orders: every order still with us that has not gone to the courier, however many days they span (no cut-off,
//   no "today"): approved and not booked, or booked with the parcel still with us (`pickingPlace`). The owner may pick
//   a date range (the day the order was placed, in the shop's time zone); it only narrows the list — a dispatched
//   order never enters it.
// - Held and problem orders are listed apart with their reason and left out of every quantity.
// - The pieces grouped category → style → colour → size, most pieces first (`groupPicking`); with the owner's
//   "mark shortages" (on) a size row whose quantity is more than the shop's stock of that variant is marked short.
// - The summary line (B1.7): orders and pieces counted separately, line items, the categories in print order,
//   shortages, the held orders.
// - Printing it keeps the list (PickingList: its orders and summary) and one print job. Nothing else changes. No
//   customer's details anywhere: order numbers and pieces only.
import { z } from 'zod';
import { DELIVERY_TARGET_SELECT, deliveryTarget, openReviewIds, type OrdersDeps } from '@extas/orders';
import { allow, logChange, nowOf, parse, setting, TX, type ShippingDeps, type Who } from './context';
import { bookedReceiver } from './fulfil-pure';
import { groupPicking, pickingPlace, PICKING_FROM, type PickCategory, type PickingHeld, type PickLine } from './picking-pure';
import { localDay } from './pure';

const ordersDeps = (deps: ShippingDeps): OrdersDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeInput = z
  .object({ from: day.nullish(), to: day.nullish() })
  .strict()
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: 'the first day comes after the last', path: ['to'] });

/** One held or problem order: listed apart, not counted. */
export interface PickingHeldOrder {
  orderId: string;
  orderNumber: string;
  reason: PickingHeld;
  pieces: number;
}

/** The list's summary line (B1.7). */
export interface PickingSummary {
  orders: number;
  pieces: number;
  lineItems: number;
  /** The categories in print order, with their pieces (the name in English and, when it has one, Bengali). */
  categories: { name: string; nameBn: string | null; pieces: number }[];
  /** Size rows short of stock, and how many pieces in all. */
  shortages: number;
  shortPieces: number;
  held: number;
}

export interface PickingList {
  groups: PickCategory[];
  /** The Bengali name of each category on the list (by its English name). */
  categoryBn: Record<string, string>;
  summary: PickingSummary;
  held: PickingHeldOrder[];
  orderIds: string[];
  range: { from: string | null; to: string | null };
  shortagesMarked: boolean;
}

/** The picking list now (and for the owner's date range, when he chose one). */
export async function pickingList(deps: ShippingDeps, who: Who, input: unknown = {}): Promise<PickingList> {
  await allow(deps, who, 'fulfilment.read');
  return build(deps, who, parse(rangeInput, input, 'date range'));
}

async function build(deps: ShippingDeps, who: Who, range: z.output<typeof rangeInput>): Promise<PickingList> {
  const storeId = who.storeId;
  const [cfg, timeZone, reviews] = await Promise.all([setting(deps, storeId, 'delivery.picking.list'), setting(deps, storeId, 'store.timeZone'), openReviewIds(ordersDeps(deps), storeId)]);
  const inReview = new Set(reviews);
  const orders = await deps.db.order.findMany({
    where: { storeId, archivedAt: null, handedOverAt: null, status: { in: [...PICKING_FROM, 'ON_HOLD'] } },
    orderBy: { placedAt: 'asc' },
    select: {
      id: true,
      number: true,
      status: true,
      holdFromStatus: true,
      placedAt: true,
      handedOverAt: true,
      cancelPending: true,
      cancelRequestedAt: true,
      totalMinor: true,
      walletAppliedMinor: true,
      paidMinor: true,
      ...DELIVERY_TARGET_SELECT,
      items: { where: { status: 'ACTIVE' }, select: { productId: true, productName: true, colourName: true, sizeLabel: true, variantId: true, quantity: true } },
      shipments: { select: { status: true, consignmentId: true, codAmountMinor: true, receiver: true } },
    },
  });
  const from = range.from ?? null;
  const to = range.to ?? null;
  const inRange = (at: Date) => {
    const d = localDay(at, timeZone);
    return (!from || d >= from) && (!to || d <= to);
  };
  const taken: typeof orders = [];
  const held: PickingHeldOrder[] = [];
  for (const o of orders) {
    if (!inRange(o.placedAt)) continue;
    const target = deliveryTarget(o);
    const place = pickingPlace({
      status: o.status,
      holdFromStatus: o.holdFromStatus,
      handedOver: !!o.handedOverAt,
      cancelAsked: o.cancelPending || o.cancelRequestedAt !== null,
      inReview: inReview.has(o.id),
      parcels: o.shipments.map((s) => ({ status: s.status, consignmentId: s.consignmentId, codAmountMinor: s.codAmountMinor, receiver: bookedReceiver(s.receiver), order: o, target })),
    });
    if (place === 'skip') continue;
    if (place === 'take') taken.push(o);
    else held.push({ orderId: o.id, orderNumber: o.number, reason: place, pieces: o.items.reduce((n, i) => n + i.quantity, 0) });
  }

  // the categories of the styles on the list
  const productIds = [...new Set(taken.flatMap((o) => o.items.map((i) => i.productId)).filter((x): x is string => !!x))];
  const products = productIds.length ? await deps.db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, category: { select: { nameEn: true, nameBn: true } } } }) : [];
  const catOf = new Map(products.map((p) => [p.id, p.category]));
  const categoryBn: Record<string, string> = {};
  const lines: PickLine[] = taken.flatMap((o) =>
    o.items.map((i) => {
      const cat = i.productId ? catOf.get(i.productId) : null;
      if (cat?.nameEn && cat.nameBn) categoryBn[cat.nameEn] = cat.nameBn;
      return { category: cat?.nameEn ?? '', styleKey: i.productId ?? i.productName, style: i.productName, colour: i.colourName, size: i.sizeLabel, variantId: i.variantId, quantity: i.quantity };
    }),
  );

  // the shop's stock of each variant on the list (all its locations; a variant with no stock row is not checked)
  let onHand: Map<string, number> | null = null;
  if (cfg.markShortages) {
    const variantIds = [...new Set(lines.map((l) => l.variantId).filter((x): x is string => !!x))];
    const rows = variantIds.length ? await deps.db.stockLevel.groupBy({ by: ['variantId'], where: { variantId: { in: variantIds }, variant: { storeId } }, _sum: { onHand: true } }) : [];
    onHand = new Map(rows.map((r) => [r.variantId, r._sum.onHand ?? 0]));
  }
  const groups = groupPicking(lines, onHand);
  const sizes = groups.flatMap((g) => g.styles.flatMap((s) => s.colours.flatMap((c) => c.sizes)));
  return {
    groups,
    categoryBn,
    summary: {
      orders: taken.length,
      pieces: groups.reduce((n, g) => n + g.pieces, 0),
      lineItems: lines.length,
      categories: groups.map((g) => ({ name: g.category, nameBn: categoryBn[g.category] ?? null, pieces: g.pieces })),
      shortages: sizes.filter((s) => s.short > 0).length,
      shortPieces: sizes.reduce((n, s) => n + s.short, 0),
      held: held.length,
    },
    held,
    orderIds: taken.map((o) => o.id),
    range: { from, to },
    shortagesMarked: cfg.markShortages,
  };
}

/** Prints the picking list: the same list, kept (PickingList) with one print job. */
export async function printPicking(deps: ShippingDeps, who: Who, input: unknown = {}): Promise<PickingList & { listId: string; printedAt: string }> {
  await allow(deps, who, 'fulfilment.read');
  const range = parse(rangeInput, input, 'date range');
  const list = await build(deps, who, range);
  const at = nowOf(deps);
  const kept = await deps.db.$transaction(async (tx) => {
    const row = await tx.pickingList.create({
      data: { storeId: who.storeId, orderIds: list.orderIds, summary: { ...list.summary, heldOrders: list.held, range: list.range } as unknown as object, generatedById: who.actor.staffUserId },
      select: { id: true },
    });
    await tx.printJob.create({ data: { storeId: who.storeId, kind: 'PICKING_LIST', orderIds: list.orderIds, status: 'SUCCEEDED', printedAt: at, actorId: who.actor.staffUserId, data: { listId: row.id, pieces: list.summary.pieces } } });
    await logChange(tx, who, 'picking.print', 'PickingList', row.id, null, { orders: list.summary.orders, pieces: list.summary.pieces, held: list.summary.held });
    return row;
  }, TX);
  return { ...list, listId: kept.id, printedAt: at.toISOString() };
}
