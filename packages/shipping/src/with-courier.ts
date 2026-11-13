// S28 · PR 667 (CN-048, admin prototype v5, GAP-MAP O-22..O-25) — Orders › With courier. What the couriers hold now
// (`withCourier`): each parcel's live status and when it last moved, with a filter by status; the day-end check (orders
// packed today against the ones entered at a courier, with the numbers of the ones missing); a parcel whose order is
// cancelled but still booked (the courier must be told); a parcel that has not moved for the owner's hours
// (`fulfilment.courierWatch.stuckAlert`, off as shipped; 48 hours); one parcel's full tracking history (`parcelHistory`,
// the drawer); and "Move to the backup courier" (`moveToBackup`, the owner's PIN): parcels booked today that the courier
// has not picked up are closed here (REBOOKED) and booked again with the backup courier. Everything but the move is read
// only (`fulfilment.read`); the move needs `delivery.book` and the PIN. Nobody is told and no money moves by itself.
import { z } from "zod";
import { verifyOwnerPin, type PinPolicy } from "@extas/auth";
import {
  allow,
  logChange,
  nowOf,
  parse,
  setting,
  TX,
  type ShippingDeps,
  type Who,
} from "./context";
import { bookableCourier, courierApi } from "./accounts";
import { bookOne, type BookingOutcome } from "./booking";
import { ShippingError } from "./errors";
import { STILL_WITH_US } from "./fulfil-pure";
import { localDayStart } from "./packing-pure";
import { localDay } from "./pure";

/** The statuses the courier reports while it holds a parcel (what the With courier list shows). */
export const COURIER_HELD = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "ATTEMPT_FAILED",
  "ADDRESS_PROBLEM",
  "LOST",
  "DAMAGED",
  "RETURNING",
] as const;
export type HeldStatus = (typeof COURIER_HELD)[number];

export interface HeldParcel {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  courierName: string;
  consignmentId: string | null;
  trackingCode: string | null;
  status: string;
  /** When the parcel last moved (its latest courier event, else its pick-up). */
  movedAt: string | null;
  /** The owner's stuck alert is on and the parcel has not moved for the hours set. */
  stuck: boolean;
  /** The order was cancelled (or a cancel waits for the courier) but the parcel is still booked: tell the courier. */
  cancelledButBooked: boolean;
  codMinor: number;
}

export interface DayEnd {
  day: string;
  packedToday: number;
  enteredToday: number;
  /** Order numbers packed today that are not entered at any courier. */
  missing: string[];
}

export interface WithCourier {
  rows: HeldParcel[];
  counts: Record<string, number>;
  stuck: number;
  cancelledButBooked: number;
  dayEnd: DayEnd;
  watch: { stuckAlert: boolean; stuckHours: number; backupCourierId: string };
}

const query = z.object({ status: z.enum(COURIER_HELD).optional() }).strict();

export async function withCourier(
  deps: ShippingDeps,
  who: Who,
  input: unknown = {},
): Promise<WithCourier> {
  await allow(deps, who, "fulfilment.read");
  const q = parse(query, input, "with courier");
  const [watch, timeZone] = await Promise.all([
    setting(deps, who.storeId, "fulfilment.courierWatch"),
    setting(deps, who.storeId, "store.timeZone"),
  ]);
  const now = nowOf(deps);
  const live = [...STILL_WITH_US, ...COURIER_HELD];
  const shipments = await deps.db.shipment.findMany({
    where: {
      storeId: who.storeId,
      status: { in: live as never[] },
      order: { archivedAt: null },
    },
    orderBy: [{ pickedAt: "asc" }, { id: "asc" }],
    take: 500,
    select: {
      id: true,
      orderId: true,
      status: true,
      consignmentId: true,
      trackingCode: true,
      codAmountMinor: true,
      pickedAt: true,
      bookedAt: true,
      lastTrackedAt: true,
      courierAccount: { select: { name: true } },
      order: { select: { number: true, status: true, cancelPending: true } },
      events: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { occurredAt: true },
      },
    },
  });
  const limit = watch.stuckHours * 3_600_000;
  const all: HeldParcel[] = shipments.map((s) => {
    const moved = s.events[0]?.occurredAt ?? s.pickedAt ?? s.bookedAt ?? null;
    const held = (COURIER_HELD as readonly string[]).includes(s.status);
    return {
      shipmentId: s.id,
      orderId: s.orderId,
      orderNumber: s.order.number,
      courierName: s.courierAccount.name,
      consignmentId: s.consignmentId,
      trackingCode: s.trackingCode,
      status: s.status,
      movedAt: moved ? moved.toISOString() : null,
      stuck:
        watch.stuckAlert &&
        held &&
        !!moved &&
        now.getTime() - moved.getTime() > limit,
      cancelledButBooked:
        s.order.status === "CANCELLED" || s.order.cancelPending,
      codMinor: s.codAmountMinor,
    };
  });
  // the With courier list is what the courier holds; a parcel still waiting for pick-up shows only when its order is cancelled
  const shown = all.filter(
    (r) =>
      (COURIER_HELD as readonly string[]).includes(r.status) ||
      r.cancelledButBooked,
  );
  const counts: Record<string, number> = {};
  for (const r of shown) counts[r.status] = (counts[r.status] ?? 0) + 1;

  // day-end check: orders packed today against the ones entered at a courier (a booked parcel with its consignment)
  const day = localDay(now, timeZone);
  const from = localDayStart(day, timeZone);
  const packed = await deps.db.orderEvent.findMany({
    where: {
      storeId: who.storeId,
      toStatus: "PACKED",
      createdAt: { gte: from },
    },
    select: { orderId: true },
    distinct: ["orderId"],
  });
  const packedIds = packed.map((p) => p.orderId);
  const entered = packedIds.length
    ? await deps.db.shipment.findMany({
        where: {
          storeId: who.storeId,
          orderId: { in: packedIds },
          consignmentId: { not: null },
          status: { notIn: ["CANCELLED", "BOOKING_FAILED"] },
        },
        select: { orderId: true },
        distinct: ["orderId"],
      })
    : [];
  const enteredIds = new Set(entered.map((e) => e.orderId));
  const missingIds = packedIds.filter((id) => !enteredIds.has(id));
  const missing = missingIds.length
    ? (
        await deps.db.order.findMany({
          where: { storeId: who.storeId, id: { in: missingIds } },
          select: { number: true },
          orderBy: { number: "asc" },
        })
      ).map((o) => o.number)
    : [];

  return {
    rows: q.status ? shown.filter((r) => r.status === q.status) : shown,
    counts,
    stuck: shown.filter((r) => r.stuck).length,
    cancelledButBooked: shown.filter((r) => r.cancelledButBooked).length,
    dayEnd: {
      day,
      packedToday: packedIds.length,
      enteredToday: enteredIds.size,
      missing,
    },
    watch,
  };
}

export interface ParcelHistory {
  shipmentId: string;
  orderNumber: string;
  courierName: string;
  consignmentId: string | null;
  trackingCode: string | null;
  status: string;
  codMinor: number;
  /** Delivery tries that failed (events with an exception status). */
  attempts: number;
  events: {
    status: string;
    message: string | null;
    riderNote: string | null;
    reasonKey: string | null;
    at: string;
  }[];
}

/** One parcel's tracking history, oldest first, for the drawer. No customer's details. */
export async function parcelHistory(
  deps: ShippingDeps,
  who: Who,
  shipmentId: string,
): Promise<ParcelHistory> {
  await allow(deps, who, "fulfilment.read");
  const s = await deps.db.shipment.findFirst({
    where: { id: shipmentId, storeId: who.storeId },
    select: {
      id: true,
      status: true,
      consignmentId: true,
      trackingCode: true,
      codAmountMinor: true,
      courierAccount: { select: { name: true } },
      order: { select: { number: true } },
      events: {
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          status: true,
          message: true,
          riderNote: true,
          reasonKey: true,
          occurredAt: true,
        },
      },
    },
  });
  if (!s)
    throw new ShippingError("NOT_FOUND", "no such parcel", ["shipmentId"]);
  return {
    shipmentId: s.id,
    orderNumber: s.order.number,
    courierName: s.courierAccount.name,
    consignmentId: s.consignmentId,
    trackingCode: s.trackingCode,
    status: s.status,
    codMinor: s.codAmountMinor,
    attempts: s.events.filter((e) => e.status === "ATTEMPT_FAILED").length,
    events: s.events.map((e) => ({
      status: e.status,
      message: e.message,
      riderNote: e.riderNote,
      reasonKey: e.reasonKey,
      at: e.occurredAt.toISOString(),
    })),
  };
}

const PIN_MAX_DIGITS = 12;
const moveInput = z
  .object({
    shipmentIds: z.array(z.uuid()).min(1).max(200),
    /** How the old consignments were cancelled with the first courier (there is no cancel through any courier's API). */
    cancelledVia: z.enum(["panel", "phone"]),
    pin: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

export interface MoveResult {
  moved: { shipmentId: string; orderNumber: string; booking: BookingOutcome }[];
  skipped: { shipmentId: string; why: string }[];
}

/**
 * "Move to the backup courier" (the owner's PIN, `delivery.book`): the parcels the first courier has not picked up (still
 * booked, waiting) are closed here as REBOOKED and the same orders are booked again with the owner's backup courier. A
 * parcel the courier already picked up, or one of another store, is skipped with its reason; nothing is cancelled at the
 * courier by us (the person did that: `cancelledVia`).
 */
export async function moveToBackup(
  deps: ShippingDeps,
  who: Who,
  input: unknown,
): Promise<MoveResult> {
  await allow(deps, who, "delivery.book");
  const d = parse(moveInput, input, "move to backup");
  const watch = await setting(deps, who.storeId, "fulfilment.courierWatch");
  if (!watch.backupCourierId)
    throw new ShippingError(
      "NO_BACKUP_COURIER",
      "pick a backup courier first",
      ["backupCourierId"],
    );
  const [minLength, maxAttempts, lockMinutes] = await Promise.all([
    deps.settings.value("books.pin.minLength"),
    deps.settings.value("books.pin.maxAttempts"),
    deps.settings.value("books.pin.lockMinutes"),
  ]);
  const policy: PinPolicy = {
    minLength,
    maxLength: Math.max(minLength, PIN_MAX_DIGITS),
    maxAttempts,
    lockMinutes,
  };
  await verifyOwnerPin(deps.db, who.actor, d.pin, policy, {
    action: "courier.moveToBackup",
    storeId: who.storeId,
    now: nowOf(deps),
    ctx: { source: "admin-api", ...who.ctx },
  });
  const backup = await bookableCourier(
    deps.db,
    who.storeId,
    watch.backupCourierId,
  );
  const conn = await courierApi(deps, who.storeId, backup.providerKey);
  const ids = [...new Set(d.shipmentIds)];
  const rows = await deps.db.shipment.findMany({
    where: { storeId: who.storeId, id: { in: ids } },
    select: {
      id: true,
      orderId: true,
      status: true,
      consignmentId: true,
      courierAccountId: true,
      order: {
        select: { number: true, cancelPending: true, cancelRequestedAt: true },
      },
    },
  });
  const out: MoveResult = { moved: [], skipped: [] };
  for (const id of ids) {
    const s = rows.find((r) => r.id === id);
    if (!s) {
      out.skipped.push({ shipmentId: id, why: "NOT_FOUND" });
      continue;
    }
    if (s.courierAccountId === backup.id) {
      out.skipped.push({ shipmentId: id, why: "ALREADY_WITH_BACKUP" });
      continue;
    }
    if (!(STILL_WITH_US as readonly string[]).includes(s.status)) {
      out.skipped.push({ shipmentId: id, why: "ALREADY_PICKED_UP" });
      continue;
    }
    if (s.order.cancelPending || s.order.cancelRequestedAt) {
      out.skipped.push({ shipmentId: id, why: "CANCEL_ASKED" });
      continue;
    }
    const now = nowOf(deps);
    try {
      await deps.db.$transaction(async (tx) => {
        const closed = await tx.shipment.updateMany({
          where: {
            id: s.id,
            storeId: who.storeId,
            status: { in: [...STILL_WITH_US] },
          },
          data: {
            status: "CANCELLED",
            cancelOutcome: "REBOOKED",
            cancelConfirmedById: who.actor.staffUserId,
            cancelConfirmedAt: now,
          },
        });
        if (closed.count !== 1)
          throw new ShippingError(
            "NOT_WITH_US",
            "the parcel moved on meanwhile",
            ["shipmentId"],
          );
        await tx.orderEvent.create({
          data: {
            storeId: who.storeId,
            orderId: s.orderId,
            type: "shipment.movedToBackup",
            reasonCode: "BACKUP_COURIER",
            data: {
              shipmentId: s.id,
              consignmentId: s.consignmentId,
              cancelledVia: d.cancelledVia,
              toCourierAccountId: backup.id,
            },
            actorType: who.actor.staffUserId ? "STAFF" : "SYSTEM",
            actorId: who.actor.staffUserId,
            source: "admin",
          },
        });
        await logChange(
          tx,
          who,
          "shipment.moveToBackup",
          "Shipment",
          s.id,
          { status: s.status, courierAccountId: s.courierAccountId },
          {
            status: "CANCELLED",
            cancelOutcome: "REBOOKED",
            toCourierAccountId: backup.id,
            cancelledVia: d.cancelledVia,
          },
        );
      }, TX);
    } catch (e) {
      if (e instanceof ShippingError) {
        out.skipped.push({ shipmentId: id, why: e.code });
        continue;
      }
      throw e;
    }
    const booking = await bookOne(
      deps,
      who,
      { id: backup.id, ...conn },
      s.orderId,
    );
    out.moved.push({ shipmentId: id, orderNumber: s.order.number, booking });
  }
  return out;
}
