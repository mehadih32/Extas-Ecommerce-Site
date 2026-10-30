// CN-028 · PR 617 — the order side of Retail's daily summary to the ERP (docs/RETAIL-ERP-MODEL.md §3.3,
// docs/erp/site-changes-v6.md §2.6), kept here because only @extas/metrics adds up order money (PR 155 guard). In
// contract v6 a sale is a delivered **piece**: the summary counts each piece the customer kept on the day it left the
// pipeline as delivered (ErpPipelineMove, the shop's own piece states, PR 615), at the customer's price after the combo
// split and discounts (ErpOrderLine.customerPriceMinor) and at its regular price (OrderItem.unitPriceMinor), so a partial
// delivery counts only its kept pieces and the same piece gives its sale and its goods cost on the same day. Every query
// is scoped to the store and to the store's own ERP link (CN-029 §16): store A's figures never read store B's rows.
//
//   orders             placed orders on the placed day (any status but DRAFT, not archived); exchange orders are not
//                      orders (Exchange.newOrderId, ErpOrder.exchangeOfId); pieces = their ACTIVE lines' quantity
//   sales              delivered pieces of the link on the move's business date; a move back out of DELIVERED (a
//                      courier correction, a different piece) takes the piece off that day; exchange pieces never count
//   deliveryCharges    the delivery charge of each order whose latest courier result (ErpDeliveryResult) is DELIVERED
//                      or PARTIAL on that day
//   deliveries         latest courier results that day (delivered = DELIVERED + PARTIAL, returned = RETURNED), failed
//                      tries (ShipmentEvent ATTEMPT_FAILED), and the COD still with the couriers at the end of the day
//   customers          among that day's placed orders: new = the person's first placed order, else returning (a person
//                      is the customer profile, else the phone number)
//   unpricedDeliveries orders delivered that day (courier result) with no delivered piece in the pipeline yet: the
//                      summary lists `sales` and `goods` as incomplete instead of sending a figure it cannot back
import { Prisma } from '@extas/db/client';
import type { Db } from './metrics';
import { dayStart, nextDay, NOT_PLACED_STATUSES, COUNTED_LINE_STATUS } from './pure';

/** The order side of one shop day, in minor units of the store's currency. */
export interface RetailDayFigures {
  orders: { count: number; pieces: number };
  sales: {
    /** Σ regular price of the delivered pieces (OrderItem.unitPriceMinor; the customer price when the line is unknown). */
    grossMinor: number;
    /** Σ customer price of the delivered pieces after the combo split and discounts. */
    netMinor: number;
    pieces: number;
    /** Delivered pieces whose order line the shop cannot find (their price is unknown). */
    unlinkedPieces: number;
  };
  deliveryChargesMinor: number;
  deliveries: { delivered: number; failed: number; returned: number; codPendingMinor: number };
  customers: { new: number; returning: number };
  unpricedDeliveries: number;
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
const DELIVERED_SHIPMENT = ['DELIVERED', 'PARTIALLY_DELIVERED'];

/** Orders that are an exchange (alias `o` = "Order"): not orders and not sales for the figures (§6.7). */
const notExchange = Prisma.sql`NOT EXISTS (SELECT 1 FROM "Exchange" x WHERE x."newOrderId" = o."id")
  AND NOT EXISTS (SELECT 1 FROM "ErpOrder" xo WHERE xo."orderId" = o."id" AND xo."exchangeOfId" IS NOT NULL)`;

/** The order side of one shop day for the store's ERP link `linkId`. */
export async function retailDayFigures(db: Db, q: { storeId: number; linkId: string; day: string; timeZone: string }): Promise<RetailDayFigures> {
  const { storeId, linkId, day, timeZone } = q;
  const from = dayStart(day, timeZone);
  const to = dayStart(nextDay(day), timeZone);
  const draft = [...NOT_PLACED_STATUSES];
  const localDay = (col: Prisma.Sql) => Prisma.sql`to_char((${col} AT TIME ZONE ${timeZone}), 'YYYY-MM-DD')`;

  const [orders, sales, latest, failed, cod, people] = await Promise.all([
    db.$queryRaw<{ count: bigint; pieces: bigint }[]>`
      WITH day_orders AS (
        SELECT o."id" FROM "Order" o
        WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND NOT (o."status"::text = ANY(${draft}))
          AND o."placedAt" >= ${from} AND o."placedAt" < ${to} AND ${notExchange}
      )
      SELECT (SELECT count(*) FROM day_orders) AS "count",
             COALESCE((SELECT sum(oi."quantity") FROM "OrderItem" oi JOIN day_orders d ON d."id" = oi."orderId"
                       WHERE oi."storeId" = ${storeId} AND oi."status"::text = ${COUNTED_LINE_STATUS}), 0)::bigint AS "pieces"`,
    db.$queryRaw<{ gross: bigint; net: bigint; pieces: bigint; unlinked: bigint }[]>`
      SELECT COALESCE(sum(s.sign * COALESCE(oi."unitPriceMinor", l."customerPriceMinor", 0)), 0)::bigint AS "gross",
             COALESCE(sum(s.sign * COALESCE(l."customerPriceMinor", 0)), 0)::bigint           AS "net",
             COALESCE(sum(s.sign), 0)::bigint                                               AS "pieces",
             COALESCE(sum(CASE WHEN l."id" IS NULL THEN 1 ELSE 0 END), 0)::bigint           AS "unlinked"
      FROM (
        SELECT m."pieceId", CASE WHEN m."toState" = 'DELIVERED' THEN 1 ELSE -1 END AS sign
        FROM "ErpPipelineMove" m
        WHERE m."linkId" = ${linkId}::uuid AND m."storeId" = ${storeId} AND m."businessDate" = ${day}::date
          AND (m."toState" = 'DELIVERED' OR m."fromState" = 'DELIVERED') AND m."toState" IS DISTINCT FROM m."fromState"
      ) s
      JOIN "ErpPipelinePiece" p ON p."id" = s."pieceId" AND p."linkId" = ${linkId}::uuid AND p."exchangeId" IS NULL
      LEFT JOIN "ErpOrder" eo ON eo."linkId" = p."linkId" AND eo."externalOrderId" = p."externalOrderId"
      LEFT JOIN "ErpOrderLine" l ON l."erpOrderId" = eo."id" AND l."lineId" = p."lineId"
      LEFT JOIN "OrderItem" oi ON oi."id" = l."orderItemId" AND oi."storeId" = ${storeId}
      WHERE eo."exchangeOfId" IS NULL`,
    // The latest courier result of every order of the link whose latest result falls on the day.
    db.$queryRaw<{ outcome: string; delivery: bigint; erpOrderId: string; externalOrderId: string }[]>`
      SELECT r."outcome"::text AS "outcome", COALESCE(o."deliveryChargeMinor", 0)::bigint AS "delivery", eo."id"::text AS "erpOrderId", eo."externalOrderId"
      FROM (
        SELECT DISTINCT ON (d."erpOrderId") d."erpOrderId", d."outcome", d."at"
        FROM "ErpDeliveryResult" d
        WHERE d."storeId" = ${storeId}
        ORDER BY d."erpOrderId", d."at" DESC, d."createdAt" DESC, d."id" DESC
      ) r
      JOIN "ErpOrder" eo ON eo."id" = r."erpOrderId" AND eo."linkId" = ${linkId}::uuid AND eo."storeId" = ${storeId} AND eo."exchangeOfId" IS NULL
      LEFT JOIN "Order" o ON o."id" = eo."orderId" AND o."storeId" = ${storeId}
      WHERE ${localDay(Prisma.sql`r."at"`)} = ${day}`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS "n" FROM "ShipmentEvent" e JOIN "Shipment" s ON s."id" = e."shipmentId"
      WHERE e."storeId" = ${storeId} AND s."storeId" = ${storeId} AND s."isExchangeLeg" = false AND e."status" = 'ATTEMPT_FAILED'
        AND e."occurredAt" >= ${from} AND e."occurredAt" < ${to}`,
    db.$queryRaw<{ pending: bigint }[]>`
      SELECT COALESCE(sum(COALESCE(s."codCollectedMinor", s."codAmountMinor")), 0)::bigint AS "pending"
      FROM "Shipment" s
      WHERE s."storeId" = ${storeId} AND s."isExchangeLeg" = false AND s."status"::text = ANY(${DELIVERED_SHIPMENT})
        AND s."deliveredAt" < ${to} AND COALESCE(s."codCollectedMinor", s."codAmountMinor") > 0
        AND NOT EXISTS (SELECT 1 FROM "CourierSettlementLine" c WHERE c."shipmentId" = s."id" AND c."storeId" = ${storeId} AND c."kind" = 'COD' AND c."createdAt" < ${to})`,
    db.$queryRaw<{ fresh: bigint; back: bigint }[]>`
      WITH day_orders AS (
        SELECT o."id", o."placedAt", COALESCE(o."customerId"::text, NULLIF(o."phone", ''), o."id"::text) AS person
        FROM "Order" o
        WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND NOT (o."status"::text = ANY(${draft}))
          AND o."placedAt" >= ${from} AND o."placedAt" < ${to} AND ${notExchange}
      ), firsts AS (
        SELECT d.person, min(d."placedAt") AS first_today,
               EXISTS (
                 SELECT 1 FROM "Order" o
                 WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND NOT (o."status"::text = ANY(${draft})) AND o."placedAt" < ${from}
                   AND COALESCE(o."customerId"::text, NULLIF(o."phone", ''), o."id"::text) = d.person AND ${notExchange}
               ) AS seen
        FROM day_orders d GROUP BY d.person
      )
      SELECT count(*) FILTER (WHERE NOT seen) AS "fresh", count(*) FILTER (WHERE seen) AS "back" FROM firsts`,
  ]);

  const deliveredOrders = latest.filter((r) => r.outcome === 'DELIVERED' || r.outcome === 'PARTIAL');
  const unpriced = deliveredOrders.length
    ? await db.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS "n" FROM unnest(${deliveredOrders.map((r) => r.externalOrderId)}::text[]) AS ext(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM "ErpPipelineMove" m JOIN "ErpPipelinePiece" p ON p."id" = m."pieceId"
          WHERE m."linkId" = ${linkId}::uuid AND m."storeId" = ${storeId} AND p."externalOrderId" = ext.id AND m."toState" = 'DELIVERED' AND m."businessDate" = ${day}::date
        )`
    : [{ n: 0n }];

  const s = sales[0];
  return {
    orders: { count: num(orders[0]?.count), pieces: num(orders[0]?.pieces) },
    sales: { grossMinor: num(s?.gross), netMinor: num(s?.net), pieces: num(s?.pieces), unlinkedPieces: num(s?.unlinked) },
    deliveryChargesMinor: deliveredOrders.reduce((sum, r) => sum + num(r.delivery), 0),
    deliveries: {
      delivered: deliveredOrders.length,
      failed: num(failed[0]?.n),
      returned: latest.filter((r) => r.outcome === 'RETURNED').length,
      codPendingMinor: num(cod[0]?.pending),
    },
    customers: { new: num(people[0]?.fresh), returning: num(people[0]?.back) },
    unpricedDeliveries: num(unpriced[0]?.n),
  };
}
