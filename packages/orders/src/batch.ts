// S28 · PR 661 (CN-048, admin prototype v5, GAP-MAP O-12..O-16) — the Batch page's current batch: every open order not yet
// handed to the courier, counted along the pipeline (To confirm, Confirmed, Booked, Packed), what is stuck and why (No stock,
// No answer, Suspicious, Merge needed) and what the rules moved on by themselves (with the reason in one line). Read only:
// it counts what is there, it never confirms, books or edits an order, and it shows no clock time of a "batch run" (the shop
// has none: the batch is simply "everything not yet handed over"). Past batches are the handed-over sheets (shipping package).
import { allow, setting, type OrdersDeps, type Who } from "./context";
import { dayRange } from "./day-range";
import { openReviewKinds } from "./list";

export const STUCK_KINDS = [
  "noStock",
  "noAnswer",
  "suspicious",
  "merge",
] as const;
export type StuckKind = (typeof STUCK_KINDS)[number];

/** The states of the current batch: open and not yet with the courier's rider. */
export const BATCH_STATES = [
  "PLACED",
  "AWAITING_ADVANCE",
  "ON_HOLD",
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
] as const;
const LIVE_SHIPMENT = ["BOOKING", "IN_REVIEW", "PENDING_PICKUP"] as const;

export interface BatchOrder {
  id: string;
  number: string;
  status: string;
  placedAt: string;
  totalMinor: number;
  currency: string;
  stage: "toConfirm" | "confirmed" | "booked" | "packed";
  stuck: StuckKind[];
  /** Placed before the start of today (the store's own day): older leftovers sit on top, tagged "From last batch". */
  fromLast: boolean;
}

export interface BatchMoved {
  id: string;
  number: string;
  /** One line: why the system moved it (the rule's own note, else its reason code). */
  reason: string;
  at: string;
}

export interface BatchOverview {
  total: number;
  pipeline: Record<BatchOrder["stage"], number>;
  stuck: Record<StuckKind, number>;
  /** "Your work": the orders that need a person, oldest first. */
  yours: BatchOrder[];
  /** "Moved on by itself": confirmed by the rules (no person) while still in the batch, newest first. */
  moved: BatchMoved[];
  pastCount: number;
}

/** The start of the store's own day that `now` falls in. */
const startOfDay = (now: Date, zone: string): Date => {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return dayRange(ymd, ymd, zone)?.from ?? now;
};

export async function batchOverview(
  deps: OrdersDeps,
  who: Who,
  now: Date = deps.now?.() ?? new Date(),
): Promise<BatchOverview> {
  await allow(deps, who, "orders.read");
  const storeId = who.storeId;
  const zone = await setting(deps, storeId, "store.timeZone");
  const today = startOfDay(now, zone);
  const orders = await deps.db.order.findMany({
    where: { storeId, archivedAt: null, status: { in: [...BATCH_STATES] } },
    orderBy: [{ placedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      number: true,
      status: true,
      placedAt: true,
      totalMinor: true,
      currency: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });
  const ids = orders.map((o) => o.id);
  const [reviews, shipments, calls, events] = ids.length
    ? await Promise.all([
        openReviewKinds(deps, storeId, ids),
        deps.db.shipment.findMany({
          where: {
            storeId,
            orderId: { in: ids },
            status: { in: [...LIVE_SHIPMENT] },
          },
          select: { orderId: true },
        }),
        deps.db.callTask.findMany({
          where: {
            storeId,
            orderId: { in: ids },
            status: { in: ["OPEN", "IN_PROGRESS"] },
            notes: { contains: "NO_ANSWER" },
          },
          select: { orderId: true },
        }),
        deps.db.orderEvent.findMany({
          where: {
            storeId,
            orderId: { in: ids },
            toStatus: "CONFIRMED",
            actorType: "SYSTEM",
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            orderId: true,
            message: true,
            reasonCode: true,
            createdAt: true,
          },
        }),
      ])
    : [new Map(), [], [], []];
  const variantIds = [
    ...new Set(
      orders.flatMap((o) =>
        o.items.map((i) => i.variantId).filter((v): v is string => !!v),
      ),
    ),
  ];
  const levels = variantIds.length
    ? await deps.db.stockLevel.groupBy({
        by: ["variantId"],
        where: { variantId: { in: variantIds } },
        _sum: { onHand: true, reserved: true },
      })
    : [];
  // short = more pieces held for orders than are on the shelf
  const short = new Set(
    levels
      .filter((l) => (l._sum.onHand ?? 0) < (l._sum.reserved ?? 0))
      .map((l) => l.variantId),
  );
  const booked = new Set(shipments.map((s) => s.orderId));
  const noAnswer = new Set(
    calls.map((c) => c.orderId).filter((x): x is string => !!x),
  );
  const rows: BatchOrder[] = orders.map((o) => {
    const r = reviews.get(o.id);
    const stuck: StuckKind[] = [];
    if (o.items.some((i) => i.variantId && short.has(i.variantId)))
      stuck.push("noStock");
    if (noAnswer.has(o.id)) stuck.push("noAnswer");
    if (r?.kind === "risk") stuck.push("suspicious");
    if (r?.kind === "duplicate") stuck.push("merge");
    const stage =
      o.status === "PACKED"
        ? "packed"
        : o.status === "CONFIRMED" || o.status === "PROCESSING"
          ? booked.has(o.id)
            ? "booked"
            : "confirmed"
          : "toConfirm";
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      placedAt: o.placedAt.toISOString(),
      totalMinor: o.totalMinor,
      currency: o.currency,
      stage,
      stuck,
      fromLast: o.placedAt < today,
    };
  });
  const pipeline = { toConfirm: 0, confirmed: 0, booked: 0, packed: 0 };
  const stuck = { noStock: 0, noAnswer: 0, suspicious: 0, merge: 0 };
  for (const r of rows) {
    pipeline[r.stage] += 1;
    for (const k of r.stuck) stuck[k] += 1;
  }
  const inBatch = new Set(ids);
  const seen = new Set<string>();
  const moved: BatchMoved[] = [];
  const num = new Map(orders.map((o) => [o.id, o.number]));
  for (const e of events) {
    if (seen.has(e.orderId) || !inBatch.has(e.orderId)) continue;
    seen.add(e.orderId);
    moved.push({
      id: e.orderId,
      number: num.get(e.orderId) ?? "",
      reason: e.message?.trim() || e.reasonCode || "rule",
      at: e.createdAt.toISOString(),
    });
  }
  const pastCount = await deps.db.handoverBatch.count({
    where: { storeId, handedOverAt: { not: null } },
  });
  return {
    total: rows.length,
    pipeline,
    stuck,
    // yours: a person must act — everything still to confirm, plus anything stuck; oldest first (the query order)
    yours: rows
      .filter((r) => r.stage === "toConfirm" || r.stuck.length)
      .sort(
        (a, b) =>
          Number(b.fromLast) - Number(a.fromLast) ||
          a.placedAt.localeCompare(b.placedAt),
      ),
    moved,
    pastCount,
  };
}
