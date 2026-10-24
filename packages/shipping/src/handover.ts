// PR 180 (Blueprint B1.5) — handing the parcels to the courier's rider, with a sheet he signs:
//
// - The handover list: per courier, every booked parcel still with us whose order waits to be handed over (confirmed,
//   picking or packed), in packing order, each with why it cannot go yet (`handoverProblem`: its sticker cannot be
//   printed, was never printed, or the order is not waiting). Order numbers, consignment ids, pieces and amounts only;
//   no customer's details on the screen.
// - The sheet: one open batch per courier. Printing the sheet puts every ready parcel of that courier on the batch (a
//   parcel booked since is added), counts the print, keeps what the sheet showed (each parcel's consignment id and the
//   amount to collect, the receiver's name when the owner wants it) and logs one print job. The same press key again
//   returns the same sheet, counted once.
// - Handed over: the batch's ready orders move to "handed over" through the order machine (packed first when nobody
//   packed them and the owner's "mark packed on handover" is on); an order that changed since the sheet was printed is
//   left out and named. The batch keeps who received it and who handed it over. Nothing books, re-books or changes a
//   parcel, its COD or a charge.
import { z } from 'zod';
import { isOrdersError, orderStep, staffBy, type OrdersDeps } from '@extas/orders';
import { allow, logChange, nowOf, parse, setting, TX, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { printFacts, inPrintOrder, PRINT_PARCEL_SELECT, type PrintParcelRow } from './fulfil';
import { bookedReceiver, handoverProblem, STILL_WITH_US, type HandoverProblem } from './fulfil-pure';

const ordersDeps = (deps: ShippingDeps): OrdersDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

const problemOf = (s: PrintParcelRow): HandoverProblem | null => handoverProblem({ ...printFacts(s), printCount: s.labelPrintCount, orderStatus: s.order.status });
const piecesOf = (s: PrintParcelRow) => s.order.items.reduce((n, i) => n + i.quantity, 0);

/** One parcel on a courier's handover list (no customer's details). */
export interface HandoverParcel {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  consignmentId: string | null;
  collectMinor: number;
  pieces: number;
  printCount: number;
  problem: HandoverProblem | null;
}

/** One courier's handover list, with its open batch (a sheet printed, not yet marked handed over). */
export interface HandoverCourier {
  courierAccountId: string;
  courierName: string;
  practice: boolean;
  currency: string;
  parcels: HandoverParcel[];
  ready: { parcels: number; pieces: number; collectMinor: number };
  openBatch: { id: string; printCount: number; parcels: number; createdAt: string } | null;
}

const waitingWhere = (storeId: number, courierAccountId?: string) => ({
  storeId,
  ...(courierAccountId ? { courierAccountId } : {}),
  status: { in: [...STILL_WITH_US] },
  consignmentId: { not: null },
  order: { archivedAt: null, handedOverAt: null },
});

/** Every courier with parcels waiting to be handed over, in packing order. */
export async function handoverList(deps: ShippingDeps, who: Who): Promise<HandoverCourier[]> {
  await allow(deps, who, 'fulfilment.read');
  const rows = await inPrintOrder(deps.db, who.storeId, await deps.db.shipment.findMany({ where: waitingWhere(who.storeId), select: PRINT_PARCEL_SELECT, orderBy: { bookedAt: 'asc' } }));
  const byCourier = new Map<string, PrintParcelRow[]>();
  for (const r of rows) byCourier.set(r.courierAccount.id, [...(byCourier.get(r.courierAccount.id) ?? []), r]);
  const ids = [...byCourier.keys()];
  const open = ids.length
    ? await deps.db.handoverBatch.findMany({ where: { storeId: who.storeId, courierAccountId: { in: ids }, handedOverAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, courierAccountId: true, printCount: true, shipmentIds: true, createdAt: true } })
    : [];
  return ids
    .map((id) => {
      const list = byCourier.get(id)!;
      const parcels = list.map((s) => ({ shipmentId: s.id, orderId: s.orderId, orderNumber: s.order.number, consignmentId: s.consignmentId, collectMinor: s.codAmountMinor, pieces: piecesOf(s), printCount: s.labelPrintCount, problem: problemOf(s) }));
      const ready = parcels.filter((p) => !p.problem);
      const batch = open.find((b) => b.courierAccountId === id) ?? null;
      return {
        courierAccountId: id,
        courierName: list[0]!.courierAccount.name,
        practice: list.some((s) => s.mode === 'MOCK'),
        currency: list[0]!.order.currency,
        parcels,
        ready: { parcels: ready.length, pieces: ready.reduce((n, p) => n + p.pieces, 0), collectMinor: ready.reduce((n, p) => n + p.collectMinor, 0) },
        openBatch: batch ? { id: batch.id, printCount: batch.printCount, parcels: batch.shipmentIds.length, createdAt: batch.createdAt.toISOString() } : null,
      };
    })
    .sort((a, b) => a.courierName.localeCompare(b.courierName));
}

/** One line of the sheet as it was printed. */
export interface HandoverLine {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  consignmentId: string;
  /** Only when the owner's "receiver's name" is on. */
  receiverName: string | null;
  collectMinor: number;
  pieces: number;
}

/** The rider's handover sheet, as printed. Amounts in minor units; the caller formats them. */
export interface HandoverSheet {
  batchId: string;
  courierName: string;
  practice: boolean;
  currency: string;
  /** The sheet's print number (2 and more: printed again). */
  printCount: number;
  printedAt: string;
  lines: HandoverLine[];
  totals: { parcels: number; pieces: number; collectMinor: number };
  replay: boolean;
}

interface SheetData {
  courierName: string;
  practice: boolean;
  currency: string;
  lines: HandoverLine[];
  printedAt: string;
}

const sheetOf = (batchId: string, printCount: number, data: SheetData, replay: boolean): HandoverSheet => ({
  batchId,
  courierName: data.courierName,
  practice: data.practice,
  currency: data.currency,
  printCount,
  printedAt: data.printedAt,
  lines: data.lines,
  totals: { parcels: data.lines.length, pieces: data.lines.reduce((n, l) => n + l.pieces, 0), collectMinor: data.lines.reduce((n, l) => n + l.collectMinor, 0) },
  replay,
});

const printInput = z.object({ courierAccountId: z.uuid(), requestKey: z.string().trim().min(8).max(100).optional() }).strict();
const isUnique = (e: unknown) => (e as { code?: string }).code === 'P2002';

/**
 * Prints the courier's handover sheet: every ready parcel of the courier goes on its open batch (made when there is
 * none), the print is counted and logged, and the sheet comes back for the PDF. NOTHING_TO_HAND_OVER when no parcel of
 * the courier is ready.
 */
export async function printHandover(deps: ShippingDeps, who: Who, input: unknown): Promise<HandoverSheet> {
  await allow(deps, who, 'fulfilment.handover');
  const d = parse(printInput, input, 'handover sheet');
  const cfg = await setting(deps, who.storeId, 'delivery.handover.sheet');
  const courier = await deps.db.courierAccount.findFirst({ where: { id: d.courierAccountId, storeId: who.storeId }, select: { id: true, name: true } });
  if (!courier) throw new ShippingError('NOT_FOUND', 'no such courier', ['courierAccountId']);

  const replay = async (): Promise<HandoverSheet | null> => {
    if (!d.requestKey) return null;
    const job = await deps.db.printJob.findUnique({ where: { storeId_requestKey: { storeId: who.storeId, requestKey: d.requestKey } }, select: { kind: true, batchId: true, data: true } });
    if (!job) return null;
    if (job.kind !== 'HANDOVER_SHEET' || !job.batchId) throw new ShippingError('INVALID_INPUT', 'this key was used for another print', ['requestKey']);
    const sheet = job.data as unknown as SheetData & { print: number };
    return sheetOf(job.batchId, sheet.print, sheet, true);
  };
  const seen = await replay();
  if (seen) return seen;

  const rows = await inPrintOrder(deps.db, who.storeId, await deps.db.shipment.findMany({ where: waitingWhere(who.storeId, courier.id), select: PRINT_PARCEL_SELECT, orderBy: { bookedAt: 'asc' } }));
  const ready = rows.filter((r) => !problemOf(r));
  if (!ready.length) throw new ShippingError('NOTHING_TO_HAND_OVER', 'no parcel of this courier is ready to hand over', [courier.name]);
  const at = nowOf(deps);
  const data: SheetData = {
    courierName: courier.name,
    practice: ready.some((r) => r.mode === 'MOCK'),
    currency: ready[0]!.order.currency,
    printedAt: at.toISOString(),
    lines: ready.map((r) => ({ shipmentId: r.id, orderId: r.orderId, orderNumber: r.order.number, consignmentId: r.consignmentId!, receiverName: cfg.receiverName ? bookedReceiver(r.receiver).name : null, collectMinor: r.codAmountMinor, pieces: piecesOf(r) })),
  };
  try {
    return await deps.db.$transaction(async (tx) => {
      // one open batch per courier: two presses at once wait for each other here
      await tx.$queryRaw`SELECT 1 FROM "CourierAccount" WHERE "id" = ${courier.id}::uuid FOR UPDATE`;
      const open = await tx.handoverBatch.findFirst({ where: { storeId: who.storeId, courierAccountId: courier.id, handedOverAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, printCount: true, shipmentIds: true } });
      const fields = { shipmentIds: data.lines.map((l) => l.shipmentId), orderIds: data.lines.map((l) => l.orderId), data: data as unknown as object };
      const batch = open
        ? await tx.handoverBatch.update({ where: { id: open.id }, data: { ...fields, printCount: { increment: 1 } }, select: { id: true, printCount: true } })
        : await tx.handoverBatch.create({ data: { storeId: who.storeId, courierAccountId: courier.id, ...fields, printCount: 1, createdById: who.actor.staffUserId }, select: { id: true, printCount: true } });
      await tx.printJob.create({
        data: { storeId: who.storeId, kind: 'HANDOVER_SHEET', orderIds: fields.orderIds, shipmentIds: fields.shipmentIds, isReprint: batch.printCount > 1, status: 'SUCCEEDED', printedAt: at, actorId: who.actor.staffUserId, requestKey: d.requestKey ?? null, batchId: batch.id, data: { ...data, print: batch.printCount } as unknown as object },
      });
      await logChange(tx, who, 'handover.sheet.print', 'HandoverBatch', batch.id, open ? { printCount: open.printCount, parcels: open.shipmentIds.length } : null, { printCount: batch.printCount, parcels: data.lines.length });
      return sheetOf(batch.id, batch.printCount, data, false);
    }, TX);
  } catch (e) {
    if (!isUnique(e)) throw e;
    const again = await replay();
    if (!again) throw e;
    return again;
  }
}

const completeInput = z.object({ batchId: z.uuid(), receivedBy: z.string().trim().min(2).max(120) }).strict();

/** What marking a batch handed over did. */
export interface HandoverResult {
  batchId: string;
  handedOver: string[];
  /** Orders left out: what changed since the sheet was printed (a handover problem, NOT_PACKED, or the order machine's refusal). */
  skipped: { orderNumber: string; reason: string }[];
}

/**
 * Marks the batch handed over to the rider (`receivedBy`): each ready order on it moves to "handed over" (packed first
 * when the owner's "mark packed on handover" is on and nobody packed it); the rest are named. ALREADY_HANDED_OVER when
 * the batch was marked before; NOTHING_TO_HAND_OVER when none of its orders can go (the batch stays open).
 */
export async function completeHandover(deps: ShippingDeps, who: Who, input: unknown): Promise<HandoverResult> {
  await allow(deps, who, 'fulfilment.handover');
  const d = parse(completeInput, input, 'handover');
  const cfg = await setting(deps, who.storeId, 'delivery.handover.sheet');
  const batch = await deps.db.handoverBatch.findFirst({ where: { id: d.batchId, storeId: who.storeId }, select: { id: true, shipmentIds: true, handedOverAt: true, data: true } });
  if (!batch) throw new ShippingError('NOT_FOUND', 'no such handover batch', ['batchId']);
  if (batch.handedOverAt) throw new ShippingError('ALREADY_HANDED_OVER', 'this batch was handed over already', [], { handedOverAt: batch.handedOverAt.toISOString() });
  const rows = await deps.db.shipment.findMany({ where: { storeId: who.storeId, id: { in: batch.shipmentIds } }, select: PRINT_PARCEL_SELECT });
  const by = staffBy(who.actor, who.ctx);
  const handedOver: string[] = [];
  const skipped: HandoverResult['skipped'] = [];
  for (const id of batch.shipmentIds) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    const problem = problemOf(r);
    if (problem) {
      skipped.push({ orderNumber: r.order.number, reason: problem });
      continue;
    }
    if (r.order.status !== 'PACKED' && !cfg.packOnHandover) {
      skipped.push({ orderNumber: r.order.number, reason: 'NOT_PACKED' });
      continue;
    }
    try {
      const ref = { storeId: who.storeId, orderId: r.orderId };
      if (r.order.status !== 'PACKED') await orderStep(ordersDeps(deps), ref, by, 'pack');
      await orderStep(ordersDeps(deps), ref, by, 'handover');
      handedOver.push(r.order.number);
    } catch (e) {
      if (!isOrdersError(e)) throw e;
      skipped.push({ orderNumber: r.order.number, reason: e.code });
    }
  }
  if (!handedOver.length) throw new ShippingError('NOTHING_TO_HAND_OVER', 'no order on this batch can be handed over now', skipped.map((s) => `${s.orderNumber}: ${s.reason}`), { skipped });
  const at = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const before = (batch.data ?? {}) as Record<string, unknown>;
    await tx.handoverBatch.update({ where: { id: batch.id }, data: { handedOverAt: at, receivedBy: d.receivedBy, handedOverById: who.actor.staffUserId, data: { ...before, handedOver, skipped } as unknown as object } });
    await logChange(tx, who, 'handover.complete', 'HandoverBatch', batch.id, { handedOverAt: null }, { handedOverAt: at.toISOString(), receivedBy: d.receivedBy, handedOver: handedOver.length, skipped: skipped.length });
  }, TX);
  return { batchId: batch.id, handedOver, skipped };
}
