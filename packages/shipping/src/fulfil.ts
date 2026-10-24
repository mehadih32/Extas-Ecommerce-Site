// PR 179 (Blueprint B1.4; SIM-F-004, SIM-F-007; follow-up 376) — the courier sticker's data, read from the order and
// its booked parcel, never typed again:
//
// - The print run: every booked parcel still with us (the courier has not picked it up), in packing order (`printOrder`),
//   each with how often its sticker was printed and, when it cannot be printed, why (`stickerProblem`). The list shows
//   no customer's details (order number, courier, the courier's id, pieces).
// - Printing: only parcels with no problem; the amount on the sticker is the amount the courier collects, which is the
//   order's live amount due (SIM-F-004: anything else is refused with COD_CHANGED, and the parcel is re-booked, never
//   printed with a figure the courier does not have); the receiver is the one the courier has, a gift's receiver with
//   the sender and the day (SIM-F-007); the courier's consignment id and its tracking code (follow-up 376).
// - Every print is counted on the parcel (`labelPrintCount`), noted on the order's timeline and audited; a sticker
//   printed again says "REPRINT n". Printing never books, re-books or changes a parcel, its COD or a charge.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { DELIVERY_TARGET_SELECT, deliveryTarget } from '@extas/orders';
import { allow, logChange, parse, setting, TX, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { bookedReceiver, printOrder, STILL_WITH_US, stickerProblem, type StickerProblem } from './fulfil-pure';

const PARCEL_SELECT = {
  id: true,
  orderId: true,
  status: true,
  consignmentId: true,
  trackingCode: true,
  codAmountMinor: true,
  receiver: true,
  mode: true,
  labelPrintCount: true,
  bookedAt: true,
  courierAccount: { select: { id: true, name: true } },
  order: {
    select: {
      id: true,
      number: true,
      note: true,
      currency: true,
      totalMinor: true,
      walletAppliedMinor: true,
      paidMinor: true,
      ...DELIVERY_TARGET_SELECT,
      items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { productName: true, colourName: true, sizeLabel: true, quantity: true, productId: true } },
    },
  },
} as const satisfies Prisma.ShipmentSelect;

type ParcelRow = Prisma.ShipmentGetPayload<{ select: typeof PARCEL_SELECT }>;

function problemOf(s: ParcelRow): StickerProblem | null {
  return stickerProblem({ status: s.status, consignmentId: s.consignmentId, codAmountMinor: s.codAmountMinor, receiver: bookedReceiver(s.receiver), order: s.order, target: deliveryTarget(s.order) });
}

/** The parcels in packing order: categories and styles with the most pieces first (B1.4). */
async function inPrintOrder(db: ShippingDeps['db'], storeId: number, rows: readonly ParcelRow[]): Promise<ParcelRow[]> {
  const productIds = [...new Set(rows.flatMap((r) => r.order.items.map((i) => i.productId)).filter((x): x is string => !!x))];
  const products = productIds.length ? await db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, category: { select: { nameEn: true } } } }) : [];
  const catOf = new Map(products.map((p) => [p.id, p.category?.nameEn ?? '']));
  const order = printOrder(
    rows.map((r) => ({
      key: r.id,
      orderNumber: r.order.number,
      pieces: r.order.items.map((i) => ({ category: (i.productId && catOf.get(i.productId)) || '', style: i.productId ?? i.productName, quantity: i.quantity })),
    })),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return order.map((id) => byId.get(id)!);
}

/** One parcel of the print run (no customer's details). */
export interface PrintRunRow {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  courierAccountId: string;
  courierName: string;
  consignmentId: string | null;
  /** A practice parcel (the courier is on its practice mode): never a real parcel. */
  practice: boolean;
  pieces: number;
  /** How often its sticker was printed (0: never). */
  printCount: number;
  problem: StickerProblem | null;
}

const toRow = (s: ParcelRow): PrintRunRow => ({
  shipmentId: s.id,
  orderId: s.orderId,
  orderNumber: s.order.number,
  courierAccountId: s.courierAccount.id,
  courierName: s.courierAccount.name,
  consignmentId: s.consignmentId,
  practice: s.mode === 'MOCK',
  pieces: s.order.items.reduce((n, i) => n + i.quantity, 0),
  printCount: s.labelPrintCount,
  problem: problemOf(s),
});

/** Every booked parcel still with us, in packing order, with its print count and any reason it cannot be printed. */
export async function printRun(deps: ShippingDeps, who: Who): Promise<{ rows: PrintRunRow[]; maxPerPdf: number }> {
  await allow(deps, who, 'fulfilment.print');
  const [rows, layout] = await Promise.all([
    deps.db.shipment.findMany({ where: { storeId: who.storeId, status: { in: [...STILL_WITH_US] }, consignmentId: { not: null }, order: { archivedAt: null } }, select: PARCEL_SELECT, orderBy: { bookedAt: 'asc' } }),
    setting(deps, who.storeId, 'delivery.sticker.layout'),
  ]);
  return { rows: (await inPrintOrder(deps.db, who.storeId, rows)).map(toRow), maxPerPdf: layout.maxPerPdf };
}

/** One sticker's data: what the courier has, in the order's words. Amounts in minor units; the caller formats them. */
export interface StickerParcel {
  shipmentId: string;
  orderNumber: string;
  courierName: string;
  practice: boolean;
  consignmentId: string;
  trackingCode: string | null;
  receiver: { name: string | null; phone: string | null; address: string | null };
  /** The amount the rider collects (the courier's COD, equal to the live amount due). 0: nothing to collect. */
  collectMinor: number;
  currency: string;
  items: { name: string; colour: string | null; size: string | null; quantity: number }[];
  gift: { from: string | null; deliverAfter: string | null; note: string | null } | null;
  /** The order's delivery note. */
  note: string | null;
  /** "REPRINT n" (1 = the first reprint), or null on the first print. */
  reprint: number | null;
}

const stickerOf = (s: ParcelRow, count: number): StickerParcel => {
  const booked = bookedReceiver(s.receiver);
  const gift = booked.gift ?? deliveryTarget(s.order).gift;
  return {
    shipmentId: s.id,
    orderNumber: s.order.number,
    courierName: s.courierAccount.name,
    practice: s.mode === 'MOCK',
    consignmentId: s.consignmentId!,
    trackingCode: s.trackingCode,
    receiver: { name: booked.name, phone: booked.phone, address: booked.address },
    collectMinor: s.codAmountMinor,
    currency: s.order.currency,
    items: s.order.items.map((i) => ({ name: i.productName, colour: i.colourName, size: i.sizeLabel, quantity: i.quantity })),
    gift: gift ? { from: gift.senderName, deliverAfter: gift.deliverAfter, note: gift.note } : null,
    note: s.order.note?.trim() || null,
    reprint: count > 1 ? count - 1 : null,
  };
};

/**
 * Prints the stickers of these parcels: refused as a whole (NOT_PRINTABLE, each parcel's reason in `data.refused`) when
 * one cannot be printed, else every print counted, noted on its order and audited, and the stickers returned in packing
 * order for the PDF.
 */
export async function printStickers(deps: ShippingDeps, who: Who, input: unknown): Promise<StickerParcel[]> {
  await allow(deps, who, 'fulfilment.print');
  const layout = await setting(deps, who.storeId, 'delivery.sticker.layout');
  const { shipmentIds } = parse(z.object({ shipmentIds: z.array(z.uuid()).min(1).max(layout.maxPerPdf) }).strict(), input, 'sticker print');
  const ids = [...new Set(shipmentIds)];
  const rows = await deps.db.shipment.findMany({ where: { storeId: who.storeId, id: { in: ids }, order: { archivedAt: null } }, select: PARCEL_SELECT });
  if (rows.length !== ids.length) throw new ShippingError('NOT_FOUND', 'no such parcel', ids.filter((id) => !rows.some((r) => r.id === id)));
  const refused = rows.map((r) => ({ shipmentId: r.id, orderNumber: r.order.number, problem: problemOf(r) })).filter((r) => r.problem);
  if (refused.length) throw new ShippingError('NOT_PRINTABLE', 'these stickers cannot be printed now', refused.map((r) => `${r.orderNumber}: ${r.problem}`), { refused });
  const ordered = await inPrintOrder(deps.db, who.storeId, rows);
  const counts = await deps.db.$transaction(async (tx) => {
    const out = new Map<string, number>();
    for (const r of ordered) {
      const after = await tx.shipment.update({ where: { id: r.id }, data: { labelPrintCount: { increment: 1 } }, select: { labelPrintCount: true } });
      out.set(r.id, after.labelPrintCount);
      await tx.orderEvent.create({ data: { storeId: who.storeId, orderId: r.orderId, type: 'shipment.stickerPrinted', data: { shipmentId: r.id, print: after.labelPrintCount, reprint: after.labelPrintCount > 1 }, actorType: who.actor.staffUserId ? 'STAFF' : 'SYSTEM', actorId: who.actor.staffUserId, source: 'admin' } });
      await logChange(tx, who, 'shipment.sticker.print', 'Shipment', r.id, { labelPrintCount: after.labelPrintCount - 1 }, { labelPrintCount: after.labelPrintCount });
    }
    return out;
  }, TX);
  return ordered.map((r) => stickerOf(r, counts.get(r.id)!));
}
