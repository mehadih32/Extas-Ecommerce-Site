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
// - PR 406 (ORD-04c): the "Handed over" history per courier — the batches handed over in the owner's last days, each
//   with its rider, who marked it, the parcels that went and the amount the courier collects — and a copy of a handed
//   batch's sheet, from what it kept (only the parcels that went), marked COPY with the rider and the time. A copy is
//   one more print job; nothing about the parcels or the orders changes.
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

// PR 182 (follow-up 433): with "mark packed on handover" off, only a packed order is ready (else NOT_PACKED)
const problemOf = (s: PrintParcelRow, cfg: { packOnHandover: boolean }): HandoverProblem | null => handoverProblem({ ...printFacts(s), printCount: s.labelPrintCount, orderStatus: s.order.status, packedFirst: !cfg.packOnHandover });
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
  const cfg = await setting(deps, who.storeId, 'delivery.handover.sheet');
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
      const parcels = list.map((s) => ({ shipmentId: s.id, orderId: s.orderId, orderNumber: s.order.number, consignmentId: s.consignmentId, collectMinor: s.codAmountMinor, pieces: piecesOf(s), printCount: s.labelPrintCount, problem: problemOf(s, cfg) }));
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
  /** PR 406: a copy of a handed-over batch's sheet — who received it and when (null on a live sheet). */
  copy?: { receivedBy: string | null; handedOverAt: string } | null;
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
  const ready = rows.filter((r) => !problemOf(r, cfg));
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
    const problem = problemOf(r, cfg);
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

/** PR 406 — one batch handed over to a courier's rider. Amounts in minor units. */
export interface HandedBatch {
  batchId: string;
  handedOverAt: string;
  receivedBy: string | null;
  /** Who marked it handed over (the staff member's name), or null. */
  by: string | null;
  parcels: number;
  pieces: number;
  collectMinor: number;
  /** Orders on the sheet that were left out when it was marked (changed since it was printed). */
  leftOut: number;
  printCount: number;
}

/** PR 406 — one courier's handed-over batches in the owner's last days, latest first, with the period's totals. */
export interface HandedCourier {
  courierAccountId: string;
  courierName: string;
  currency: string;
  batches: HandedBatch[];
  totals: { batches: number; parcels: number; collectMinor: number };
}

/** The lines of a handed batch that really went (its `handedOver` order numbers; all lines for an older batch). */
function wentLines(data: SheetData & { handedOver?: string[]; skipped?: unknown[] }): HandoverLine[] {
  if (!Array.isArray(data.handedOver)) return data.lines ?? [];
  const went = new Set(data.handedOver);
  return (data.lines ?? []).filter((l) => went.has(l.orderNumber));
}

/** PR 406 — the batches handed over per courier in the last `fulfilment.handover.history.days` (`fulfilment.read`). */
export async function handoverHistory(deps: ShippingDeps, who: Who): Promise<HandedCourier[]> {
  await allow(deps, who, 'fulfilment.read');
  const cfg = await setting(deps, who.storeId, 'fulfilment.handover.history');
  const since = new Date(nowOf(deps).getTime() - cfg.days * 86_400_000);
  const rows = await deps.db.handoverBatch.findMany({
    where: { storeId: who.storeId, handedOverAt: { gte: since } },
    orderBy: { handedOverAt: 'desc' },
    select: { id: true, handedOverAt: true, receivedBy: true, handedOverById: true, printCount: true, data: true, courierAccount: { select: { id: true, name: true } } },
  });
  const staffIds = [...new Set(rows.map((r) => r.handedOverById).filter((x): x is string => !!x))];
  const staff = staffIds.length ? await deps.db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } }) : [];
  const nameOf = new Map(staff.map((x) => [x.id, x.displayName]));
  const out = new Map<string, HandedCourier>();
  for (const r of rows) {
    const data = (r.data ?? {}) as unknown as SheetData & { handedOver?: string[]; skipped?: unknown[] };
    const lines = wentLines(data);
    const c = out.get(r.courierAccount.id) ?? { courierAccountId: r.courierAccount.id, courierName: r.courierAccount.name, currency: data.currency ?? '', batches: [], totals: { batches: 0, parcels: 0, collectMinor: 0 } };
    out.set(r.courierAccount.id, c);
    const collect = lines.reduce((n, l) => n + l.collectMinor, 0);
    c.totals.batches += 1;
    c.totals.parcels += lines.length;
    c.totals.collectMinor += collect;
    if (c.batches.length >= cfg.perCourier) continue;
    c.batches.push({
      batchId: r.id,
      handedOverAt: r.handedOverAt!.toISOString(),
      receivedBy: r.receivedBy,
      by: r.handedOverById ? (nameOf.get(r.handedOverById) ?? null) : null,
      parcels: lines.length,
      pieces: lines.reduce((n, l) => n + l.pieces, 0),
      collectMinor: collect,
      leftOut: Array.isArray(data.skipped) ? data.skipped.length : 0,
      printCount: r.printCount,
    });
  }
  return [...out.values()].sort((a, b) => a.courierName.localeCompare(b.courierName));
}

const copyInput = z.object({ batchId: z.uuid() }).strict();

/**
 * PR 406 — a copy of a handed-over batch's sheet: what it kept, only the parcels that went, marked COPY with the rider
 * and the time it was handed over. NOT_FOUND for another store's or an unknown batch; NOT_HANDED_OVER for a batch still
 * open (print its live sheet instead). One more print job; the batch's print count grows; nothing else changes.
 */
export async function copyHandover(deps: ShippingDeps, who: Who, input: unknown): Promise<HandoverSheet> {
  await allow(deps, who, 'fulfilment.handover');
  const d = parse(copyInput, input, 'handover copy');
  const batch = await deps.db.handoverBatch.findFirst({ where: { id: d.batchId, storeId: who.storeId }, select: { id: true, handedOverAt: true, receivedBy: true, data: true, printCount: true, orderIds: true, shipmentIds: true } });
  if (!batch) throw new ShippingError('NOT_FOUND', 'no such handover batch', ['batchId']);
  if (!batch.handedOverAt) throw new ShippingError('NOT_HANDED_OVER', 'this batch is not handed over yet: print its sheet instead', ['batchId']);
  const data = (batch.data ?? {}) as unknown as SheetData & { handedOver?: string[] };
  const lines = wentLines(data);
  const at = nowOf(deps);
  const printCount = await deps.db.$transaction(async (tx) => {
    const b = await tx.handoverBatch.update({ where: { id: batch.id }, data: { printCount: { increment: 1 } }, select: { printCount: true } });
    await tx.printJob.create({ data: { storeId: who.storeId, kind: 'HANDOVER_SHEET', orderIds: lines.map((l) => l.orderId), shipmentIds: lines.map((l) => l.shipmentId), isReprint: true, reason: 'copy', status: 'SUCCEEDED', printedAt: at, actorId: who.actor.staffUserId, batchId: batch.id, data: { copy: true, print: b.printCount } } });
    await logChange(tx, who, 'handover.sheet.copy', 'HandoverBatch', batch.id, { printCount: batch.printCount }, { printCount: b.printCount, parcels: lines.length });
    return b.printCount;
  }, TX);
  return { ...sheetOf(batch.id, printCount, { ...data, lines }, false), copy: { receivedBy: batch.receivedBy, handedOverAt: batch.handedOverAt.toISOString() } };
}
