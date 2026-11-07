// S08 · PR 180 follow-up 437 — the courier's pick-up checked against the handed-over sheets (pure: no database). Once a
// batch has been with the courier for the owner's `afterHours` (`fulfilment.handover.reconcile`), two lists:
// - `notPicked`: a parcel that went on the sheet that the courier has still not picked up (its state is still one the
//   shop holds: in review, waiting for pick-up) — on the sheet, never scanned;
// - `offSheet`: a parcel of the same courier that the courier picked up within `windowHours` of the hand-over but that
//   was on no handed-over sheet — scanned, never on a sheet. Each such parcel is named once, on the batch handed over
//   nearest its pick-up.
// Read only: the check moves, books or cancels nothing.
import { STILL_WITH_US } from './fulfil-pure';

/** A parcel as the check sees it. */
export interface CheckParcel {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  pickedAt: Date | null;
}

/** A handed-over batch: when, and the parcels that went on it. */
export interface CheckBatch {
  batchId: string;
  handedOverAt: Date;
  went: readonly string[];
}

/** A parcel named by the check (no customer's details). */
export interface CheckLine {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
}

/** The check of one batch; null while it is too early (or the check is off). */
export interface BatchCheck {
  notPicked: CheckLine[];
  offSheet: CheckLine[];
}

const lineOf = (p: CheckParcel): CheckLine => ({ shipmentId: p.shipmentId, orderId: p.orderId, orderNumber: p.orderNumber });
const H = 3_600_000;

/**
 * One courier's batches checked. `parcels`: every parcel on these batches, and every parcel of the courier picked up in
 * the time the batches cover (±`windowHours`). `allWent`: every parcel on any handed-over sheet of that courier (also
 * older batches), so a parcel handed over earlier is never "off sheet".
 */
export function checkBatches(batches: readonly CheckBatch[], parcels: readonly CheckParcel[], allWent: ReadonlySet<string>, cfg: { afterHours: number; windowHours: number }, now: Date): Map<string, BatchCheck | null> {
  const out = new Map<string, BatchCheck | null>();
  const byId = new Map(parcels.map((p) => [p.shipmentId, p]));
  const due = batches.filter((b) => now.getTime() - b.handedOverAt.getTime() >= cfg.afterHours * H);
  for (const b of batches) out.set(b.batchId, null);
  for (const b of due) {
    const notPicked = b.went.map((id) => byId.get(id)).filter((p): p is CheckParcel => !!p && (STILL_WITH_US as readonly string[]).includes(p.status)).map(lineOf);
    out.set(b.batchId, { notPicked, offSheet: [] });
  }
  if (!due.length) return out;
  const win = cfg.windowHours * H;
  for (const p of parcels) {
    if (!p.pickedAt || allWent.has(p.shipmentId)) continue;
    let best: CheckBatch | null = null;
    for (const b of due) {
      const gap = Math.abs(p.pickedAt.getTime() - b.handedOverAt.getTime());
      if (gap <= win && (!best || gap < Math.abs(p.pickedAt.getTime() - best.handedOverAt.getTime()))) best = b;
    }
    if (best) out.get(best.batchId)!.offSheet.push(lineOf(p));
  }
  for (const c of out.values()) c?.offSheet.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  return out;
}
