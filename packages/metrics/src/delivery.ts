// S08 · PR 525 — what the courier claimed beside what really happened, for the reports (SIM-F-005, SIM-F-028). Counts
// only: the parcels a courier marked delivered in a period (by the courier's delivered moment), how many of them the
// shop's own records contradicted (a true-delivery check), and how a person resolved each — really delivered, came
// back with the delivery charge paid, came back — store-wide or for one customer. The charge a charge-paid return
// carried is the courier's reported figure, noted on the return, never a sale (Sales stays the KPI's, metrics.ts).
//
// S08 · PR 526 — why parcels came back (SIM-F-038; fed into PR 521's phone history and the customer's RTO book): the
// return records written in a period (by the day each was recorded), by the reason a person picked from the owner's
// list (`orders.refusal.reasons` keys; a key the owner later removed still counts under its own name) and by kind,
// store-wide or for one customer. Archived orders are left out. Counts only.
import { Prisma } from '@extas/db/client';
import type { Db } from './metrics';
import type { Period } from './pure';

export interface DeliveryTruth {
  /** Parcels the courier marked "Delivered" in the period. */
  courierDelivered: number;
  /** Of those, how many the shop's records contradicted (a check was opened). */
  checked: number;
  /** Checks still waiting for a person. */
  open: number;
  /** Resolved: really delivered. */
  confirmedDelivered: number;
  /** Resolved: came back, the customer paid the delivery charge. */
  chargePaidReturns: number;
  /** Resolved: came back, nothing paid. */
  returned: number;
  /** The delivery charge the courier reported on the charge-paid returns (poisha). */
  chargePaidMinor: number;
}

function checkPeriod(p: Period): void {
  if (!(p.from instanceof Date) || !(p.to instanceof Date) || Number.isNaN(p.from.getTime()) || Number.isNaN(p.to.getTime()) || p.to < p.from) {
    throw new RangeError('a period needs two dates, from before to');
  }
}

/** The courier's "Delivered" against the truth, store-wide or for one customer (`customerId`). */
export async function deliveryTruth(db: Db, storeId: number, period: Period, opts: { customerId?: string } = {}): Promise<DeliveryTruth> {
  checkPeriod(period);
  const customer = opts.customerId ? Prisma.sql`AND o."customerId" = ${opts.customerId}::uuid` : Prisma.empty;
  const rows = await db.$queryRaw<{ delivered: bigint; checked: bigint; open: bigint; confirmed: bigint; charge_paid: bigint; returned: bigint; charge_minor: bigint | null }[]>`
    SELECT
      count(*) AS delivered,
      count(d."id") AS checked,
      count(*) FILTER (WHERE d."state"::text = 'OPEN') AS open,
      count(*) FILTER (WHERE d."resolution"::text = 'DELIVERED') AS confirmed,
      count(*) FILTER (WHERE d."resolution"::text = 'CHARGE_PAID_RETURN') AS charge_paid,
      count(*) FILTER (WHERE d."resolution"::text = 'RETURNED') AS returned,
      coalesce(sum(r."chargePaidMinor") FILTER (WHERE d."resolution"::text = 'CHARGE_PAID_RETURN'), 0) AS charge_minor
    FROM "Shipment" s
    JOIN "Order" o ON o."id" = s."orderId"
    LEFT JOIN "DeliveryCheck" d ON d."shipmentId" = s."id"
    LEFT JOIN LATERAL (SELECT rr."chargePaidMinor" FROM "ReturnRecord" rr WHERE rr."shipmentId" = s."id" AND rr."mismatch" ORDER BY rr."createdAt" ASC LIMIT 1) r ON TRUE
    WHERE s."storeId" = ${storeId} AND o."archivedAt" IS NULL AND s."deliveredAt" >= ${period.from} AND s."deliveredAt" < ${period.to}
      AND (s."status"::text = 'DELIVERED' OR d."id" IS NOT NULL) ${customer}`;
  const r = rows[0];
  return {
    courierDelivered: Number(r?.delivered ?? 0),
    checked: Number(r?.checked ?? 0),
    open: Number(r?.open ?? 0),
    confirmedDelivered: Number(r?.confirmed ?? 0),
    chargePaidReturns: Number(r?.charge_paid ?? 0),
    returned: Number(r?.returned ?? 0),
    chargePaidMinor: Number(r?.charge_minor ?? 0),
  };
}

export interface ReturnReasons {
  /** Return records in the period. */
  total: number;
  /** Of those, how many have a reason. */
  withReason: number;
  /** Count per reason key, the most frequent first (ties by key). */
  byReason: { key: string; count: number }[];
  /** Count per return kind (REFUSED_AT_DOOR, CHARGE_PAID_RETURN, RETURNED, DEFECT_RETURN). */
  byKind: Record<string, number>;
}

/** Why parcels came back in a period, store-wide or for one customer (`customerId`). */
export async function returnReasons(db: Db, storeId: number, period: Period, opts: { customerId?: string } = {}): Promise<ReturnReasons> {
  checkPeriod(period);
  const customer = opts.customerId ? Prisma.sql`AND o."customerId" = ${opts.customerId}::uuid` : Prisma.empty;
  const rows = await db.$queryRaw<{ reason: string | null; kind: string; n: bigint }[]>`
    SELECT r."reasonCode" AS reason, r."kind"::text AS kind, count(*) AS n
    FROM "ReturnRecord" r
    JOIN "Order" o ON o."id" = r."orderId"
    WHERE r."storeId" = ${storeId} AND o."archivedAt" IS NULL AND r."createdAt" >= ${period.from} AND r."createdAt" < ${period.to} ${customer}
    GROUP BY 1, 2`;
  const reasons = new Map<string, number>();
  const byKind: Record<string, number> = {};
  let total = 0;
  let withReason = 0;
  for (const r of rows) {
    const n = Number(r.n);
    total += n;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + n;
    if (r.reason) {
      withReason += n;
      reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + n);
    }
  }
  const byReason = [...reasons].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { total, withReason, byReason, byKind };
}
