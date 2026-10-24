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
//
// PR 180 (B1.5) — the print queue and reprint safety:
// - Every press is one print job (PrintJob: the parcels, each one's print number, who, when, the reason of a reprint).
//   The page sends a key with its press; the same key again (a double click, a lost answer) returns the same job and
//   the same stickers, counted once.
// - A reprint is the same parcel: the same consignment id, never a second booking. With the owner's "ask why on a
//   reprint" (on by default) a reprint needs a short reason, which goes on the order's timeline, the job and the audit.
// - A parcel handed over to the courier (PR 180's handover) is no longer with us: it leaves the print run.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { DELIVERY_TARGET_SELECT, deliveryTarget } from '@extas/orders';
import { allow, logChange, nowOf, parse, setting, TX, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { bookedReceiver, printOrder, STILL_WITH_US, stickerProblem, type StickerProblem } from './fulfil-pure';

export const PRINT_PARCEL_SELECT = {
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
      status: true,
      handedOverAt: true,
      currency: true,
      totalMinor: true,
      walletAppliedMinor: true,
      paidMinor: true,
      ...DELIVERY_TARGET_SELECT,
      items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { productName: true, colourName: true, sizeLabel: true, quantity: true, productId: true } },
    },
  },
} as const satisfies Prisma.ShipmentSelect;

export type PrintParcelRow = Prisma.ShipmentGetPayload<{ select: typeof PRINT_PARCEL_SELECT }>;

function problemOf(s: PrintParcelRow): StickerProblem | null {
  return stickerProblem(printFacts(s));
}

/** What the sticker and handover rules look at. */
export const printFacts = (s: PrintParcelRow) => ({ status: s.status, consignmentId: s.consignmentId, codAmountMinor: s.codAmountMinor, receiver: bookedReceiver(s.receiver), order: s.order, target: deliveryTarget(s.order), handedOver: !!s.order.handedOverAt });

/** The parcels in packing order: categories and styles with the most pieces first (B1.4). */
export async function inPrintOrder(db: ShippingDeps['db'], storeId: number, rows: readonly PrintParcelRow[]): Promise<PrintParcelRow[]> {
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

const toRow = (s: PrintParcelRow): PrintRunRow => ({
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
  await allow(deps, who, 'fulfilment.read');
  const [rows, layout] = await Promise.all([
    deps.db.shipment.findMany({ where: { storeId: who.storeId, status: { in: [...STILL_WITH_US] }, consignmentId: { not: null }, order: { archivedAt: null, handedOverAt: null } }, select: PRINT_PARCEL_SELECT, orderBy: { bookedAt: 'asc' } }),
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

const stickerOf = (s: PrintParcelRow, count: number): StickerParcel => {
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

/** One press of Print: the job, whether it is a repeat of a press already done (nothing counted again), the stickers. */
export interface StickerPrint {
  jobId: string;
  replay: boolean;
  parcels: StickerParcel[];
}

const printInput = (max: number) =>
  z
    .object({
      shipmentIds: z.array(z.uuid()).min(1).max(max),
      /** Why the stickers are printed again (needed for a reprint when the owner asks why). */
      reason: z.string().trim().min(3).max(200).optional(),
      /** The press's own key: the same key again returns the same job (a double click, a lost answer). */
      requestKey: z.string().trim().min(8).max(100).optional(),
    })
    .strict();

const isUnique = (e: unknown) => (e as { code?: string }).code === 'P2002';
const printsOf = (data: unknown): Record<string, number> => ((data && typeof data === 'object' && (data as { prints?: unknown }).prints) || {}) as Record<string, number>;

/** The same press again: the same stickers with the print numbers of the first answer; nothing is counted twice. */
async function replayPrint(deps: ShippingDeps, who: Who, job: { id: string; kind: string; shipmentIds: string[]; data: unknown }, ids: readonly string[]): Promise<StickerPrint> {
  const same = job.kind === 'STICKER' && job.shipmentIds.length === ids.length && ids.every((id) => job.shipmentIds.includes(id));
  if (!same) throw new ShippingError('INVALID_INPUT', 'this key was used for another print', ['requestKey']);
  const rows = await deps.db.shipment.findMany({ where: { storeId: who.storeId, id: { in: job.shipmentIds } }, select: PRINT_PARCEL_SELECT });
  const prints = printsOf(job.data);
  const ordered = await inPrintOrder(deps.db, who.storeId, rows);
  return { jobId: job.id, replay: true, parcels: ordered.map((r) => stickerOf(r, prints[r.id] ?? r.labelPrintCount)) };
}

/**
 * Prints the stickers of these parcels: refused as a whole (NOT_PRINTABLE, each parcel's reason in `data.refused`) when
 * one cannot be printed; a reprint without a reason refused (REASON_REQUIRED, `data.reprints`) when the owner asks why;
 * else one print job, every print counted, noted on its order and audited, and the stickers returned in packing order.
 */
export async function printStickers(deps: ShippingDeps, who: Who, input: unknown): Promise<StickerPrint> {
  await allow(deps, who, 'fulfilment.print');
  const [layout, queue] = await Promise.all([setting(deps, who.storeId, 'delivery.sticker.layout'), setting(deps, who.storeId, 'delivery.sticker.queue')]);
  const d = parse(printInput(layout.maxPerPdf), input, 'sticker print');
  const ids = [...new Set(d.shipmentIds)];
  const findJob = () => (d.requestKey ? deps.db.printJob.findUnique({ where: { storeId_requestKey: { storeId: who.storeId, requestKey: d.requestKey } }, select: { id: true, kind: true, shipmentIds: true, data: true } }) : Promise.resolve(null));
  const seen = await findJob();
  if (seen) return replayPrint(deps, who, seen, ids);

  const rows = await deps.db.shipment.findMany({ where: { storeId: who.storeId, id: { in: ids }, order: { archivedAt: null } }, select: PRINT_PARCEL_SELECT });
  if (rows.length !== ids.length) throw new ShippingError('NOT_FOUND', 'no such parcel', ids.filter((id) => !rows.some((r) => r.id === id)));
  const refused = rows.map((r) => ({ shipmentId: r.id, orderNumber: r.order.number, problem: problemOf(r) })).filter((r) => r.problem);
  if (refused.length) throw new ShippingError('NOT_PRINTABLE', 'these stickers cannot be printed now', refused.map((r) => `${r.orderNumber}: ${r.problem}`), { refused });
  const reprints = rows.filter((r) => r.labelPrintCount > 0);
  if (reprints.length && queue.reprintReason && !d.reason)
    throw new ShippingError('REASON_REQUIRED', 'say why these stickers are printed again', reprints.map((r) => r.order.number), {
      reprints: reprints.map((r) => ({ shipmentId: r.id, orderNumber: r.order.number, printCount: r.labelPrintCount })),
    });
  const reason = reprints.length ? (d.reason ?? null) : null;
  const ordered = await inPrintOrder(deps.db, who.storeId, rows);
  const at = nowOf(deps);
  try {
    const done = await deps.db.$transaction(async (tx) => {
      // the job first: a second press with the same key stops here, before anything is counted
      const job = await tx.printJob.create({
        data: { storeId: who.storeId, kind: 'STICKER', orderIds: ordered.map((r) => r.orderId), shipmentIds: ordered.map((r) => r.id), isReprint: reprints.length > 0, status: 'RUNNING', actorId: who.actor.staffUserId, reason, requestKey: d.requestKey ?? null },
        select: { id: true },
      });
      const prints: Record<string, number> = {};
      for (const r of ordered) {
        const after = await tx.shipment.update({ where: { id: r.id }, data: { labelPrintCount: { increment: 1 } }, select: { labelPrintCount: true } });
        prints[r.id] = after.labelPrintCount;
        const again = after.labelPrintCount > 1;
        await tx.orderEvent.create({ data: { storeId: who.storeId, orderId: r.orderId, type: 'shipment.stickerPrinted', data: { shipmentId: r.id, print: after.labelPrintCount, reprint: again, jobId: job.id, ...(again && reason ? { reason } : {}) }, actorType: who.actor.staffUserId ? 'STAFF' : 'SYSTEM', actorId: who.actor.staffUserId, source: 'admin' } });
        await logChange(tx, who, 'shipment.sticker.print', 'Shipment', r.id, { labelPrintCount: after.labelPrintCount - 1 }, { labelPrintCount: after.labelPrintCount, jobId: job.id, ...(again && reason ? { reason } : {}) });
      }
      await tx.printJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', printedAt: at, data: { prints } } });
      return { jobId: job.id, prints };
    }, TX);
    return { jobId: done.jobId, replay: false, parcels: ordered.map((r) => stickerOf(r, done.prints[r.id]!)) };
  } catch (e) {
    if (!isUnique(e) || !d.requestKey) throw e;
    const again = await findJob();
    if (!again) throw e;
    return replayPrint(deps, who, again, ids);
  }
}

/** One recent print (a press of Print or of the handover sheet), for the Print run page. No customer's details. */
export interface PrintJobRow {
  id: string;
  kind: 'STICKER' | 'HANDOVER_SHEET' | 'PICKING_LIST';
  parcels: number;
  orderNumbers: string[];
  isReprint: boolean;
  reason: string | null;
  by: string | null;
  at: string;
}

/** The last prints (the owner's "recent prints"), newest first. */
export async function printJobs(deps: ShippingDeps, who: Who): Promise<PrintJobRow[]> {
  await allow(deps, who, 'fulfilment.read');
  const { recentPrints } = await setting(deps, who.storeId, 'delivery.sticker.queue');
  const jobs = await deps.db.printJob.findMany({
    where: { storeId: who.storeId, kind: { in: ['STICKER', 'HANDOVER_SHEET', 'PICKING_LIST'] }, status: 'SUCCEEDED' },
    orderBy: { createdAt: 'desc' },
    take: recentPrints,
    select: { id: true, kind: true, orderIds: true, shipmentIds: true, isReprint: true, reason: true, actorId: true, createdAt: true },
  });
  const orderIds = [...new Set(jobs.flatMap((j) => j.orderIds))];
  const actorIds = [...new Set(jobs.map((j) => j.actorId).filter((x): x is string => !!x))];
  const [orders, staff] = await Promise.all([
    orderIds.length ? deps.db.order.findMany({ where: { storeId: who.storeId, id: { in: orderIds } }, select: { id: true, number: true } }) : [],
    actorIds.length ? deps.db.staffUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } }) : [],
  ]);
  const numberOf = new Map(orders.map((o) => [o.id, o.number]));
  const nameOf = new Map(staff.map((s) => [s.id, s.displayName]));
  return jobs.map((j) => ({
    id: j.id,
    kind: j.kind as PrintJobRow['kind'],
    parcels: j.shipmentIds.length || j.orderIds.length,
    orderNumbers: j.orderIds.map((id) => numberOf.get(id)).filter((x): x is string => !!x),
    isReprint: j.isReprint,
    reason: j.reason,
    by: j.actorId ? (nameOf.get(j.actorId) ?? null) : null,
    at: j.createdAt.toISOString(),
  }));
}
