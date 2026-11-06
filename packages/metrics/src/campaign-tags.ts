// S13 · PR 278: `campaignTagFigures` — the orders whose kept campaign tags (utm_source + utm_campaign) name one of the
// given campaigns, all time: placed orders (never a draft), delivered orders and their Sales value (the one Sales rule:
// delivered only, the order's total). Read-only, store-scoped; Marketing › YouTube credits each video with it.
import { Prisma } from '@extas/db/client';
import type { Db } from './metrics';
import { NOT_PLACED_STATUSES, SALES_STATUSES } from './pure';

export interface CampaignTagFigure {
  orders: number;
  delivered: number;
  deliveredValueMinor: number;
}

type Row = { tag: string; orders: bigint | number; delivered: bigint | number; value: bigint | number | null };

/** Per campaign tag (exact; the source matched without case): placed orders, delivered orders and their Sales value. */
export async function campaignTagFigures(db: Db, storeId: number, utmSource: string, tags: readonly string[]): Promise<Map<string, CampaignTagFigure>> {
  if (!tags.length) return new Map();
  const notPlaced = [...NOT_PLACED_STATUSES];
  const sales = [...SALES_STATUSES];
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT o."utmCampaign" AS "tag",
           count(*) AS "orders",
           count(*) FILTER (WHERE o."status"::text = ANY(${sales})) AS "delivered",
           COALESCE(sum(o."totalMinor") FILTER (WHERE o."status"::text = ANY(${sales})), 0)::bigint AS "value"
      FROM "Order" o
     WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND NOT (o."status"::text = ANY(${notPlaced}))
       AND lower(o."utmSource") = lower(${utmSource}) AND o."utmCampaign" = ANY(${[...tags]}::text[])
     GROUP BY o."utmCampaign"`);
  return new Map(rows.map((r) => [r.tag, { orders: Number(r.orders), delivered: Number(r.delivered), deliveredValueMinor: Number(r.value ?? 0) }]));
}
