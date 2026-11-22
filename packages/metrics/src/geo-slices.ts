// S29 · PR 756 (CN-054, the owner's 15 Nov addition) — Reports › Geography map, every slice. The map's figures can be cut,
// in any mix, by channel (the order's source), payment type (cash on delivery or online), courier and customer type (new or
// repeat); category and product were already slices of `salesByArea` (areas.ts) and stay line-level in `geoByArea`. A slice
// narrows the ORDERS before they are counted, so a figure under any mix is a part of the figure without it; and for any one
// dimension the parts add up to the whole, an order that does not say (no courier yet, no customer to tell) counted apart as
// UNKNOWN, never dropped and never guessed (`geoSliceBreakdown`). Counts and goods only: no customer name or phone leaves here.
//
// Rules (the same ones the SQL and `classify` apply):
//   - channel: Order.source (WEBSITE, PHONE, …);
//   - payment type: COD = paid at the door (method COD, or none yet: the order list treats both as cash on delivery);
//     ONLINE = BKASH, NAGAD, CARD, WALLET, BANK_TRANSFER, ROCKET, UPAY, ONLINE; OTHER = CASH over the counter (belongs to neither
//     filter, but it is a bucket of its own so the parts still add up);
//   - courier: the courier of the order's current parcel (Order.courierAccountId); UNKNOWN = no parcel booked;
//   - customer type: REPEAT = the same customer (or, for a guest order, the same phone) has an earlier order that was not
//     cancelled; NEW = none; UNKNOWN = the order has neither a customer nor a phone to tell by.
import { Prisma } from '@extas/db/client';
import { basisWhere, type Db } from './metrics';
import { daysPeriod } from './pure';
import type { GeoDays, GeoSlices } from './geo-types';
import { normalizeSlices, ONLINE_METHODS, sumBuckets, type SliceDimension, type SliceBucket, type SliceBreakdown } from './geo-slices-pure';

export * from './geo-slices-pure';

// ---- the SQL a figure adds to its orders (alias `o` = "Order") ---------------------------------------------------------

const ONLINE = [...ONLINE_METHODS];
/** An order's payment bucket as SQL. */
const PAYMENT_CASE = Prisma.sql`CASE WHEN o."paymentMethod" IS NULL OR o."paymentMethod"::text = 'COD' THEN 'COD' WHEN o."paymentMethod"::text = ANY(${ONLINE}) THEN 'ONLINE' ELSE 'OTHER' END`;
/** Has the same customer (or, for a guest, the same phone) an earlier order that was not cancelled? */
const HAS_EARLIER = Prisma.sql`EXISTS (SELECT 1 FROM "Order" e WHERE e."storeId" = o."storeId" AND e."archivedAt" IS NULL AND e."status"::text NOT IN ('CANCELLED', 'DRAFT') AND e."id" <> o."id" AND (e."placedAt", e."id") < (o."placedAt", o."id") AND ((o."customerId" IS NOT NULL AND e."customerId" = o."customerId") OR (o."customerId" IS NULL AND o."phone" IS NOT NULL AND e."phone" = o."phone")))`;
const CAN_TELL = Prisma.sql`(o."customerId" IS NOT NULL OR o."phone" IS NOT NULL)`;
const CUSTOMER_CASE = Prisma.sql`CASE WHEN NOT ${CAN_TELL} THEN 'UNKNOWN' WHEN ${HAS_EARLIER} THEN 'REPEAT' ELSE 'NEW' END`;

/** The ` AND …` part the order-level slices add to a figure's WHERE (empty when none is set). Category and product are not here. */
export function orderSliceSql(slices: GeoSlices): Prisma.Sql {
  const s = normalizeSlices(slices);
  const parts: Prisma.Sql[] = [];
  if (s.channel) parts.push(Prisma.sql`o."source"::text = ${s.channel}`);
  if (s.paymentType) parts.push(Prisma.sql`(${PAYMENT_CASE}) = ${s.paymentType}`);
  if (s.courierId) parts.push(Prisma.sql`o."courierAccountId" = ${s.courierId}::uuid`);
  if (s.customerType) parts.push(Prisma.sql`(${CUSTOMER_CASE}) = ${s.customerType}`);
  return parts.length ? Prisma.sql` AND ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
}

const DIMENSION_SQL: Record<SliceDimension, Prisma.Sql> = {
  channel: Prisma.sql`o."source"::text`,
  paymentType: PAYMENT_CASE,
  courier: Prisma.sql`coalesce(o."courierAccountId"::text, 'UNKNOWN')`,
  customerType: CUSTOMER_CASE,
};


/**
 * One dimension of the order-level slices over a period: every value that has orders, with orders placed, delivered,
 * returned and the goods delivered; the parts add up to the whole (an order that does not say is UNKNOWN). The other
 * slices that are set narrow the orders first, so this is "within the mix, by this dimension".
 */
export async function geoSliceBreakdown(
  db: Db,
  q: { storeId: number; timeZone: string; days: GeoDays; dimension: SliceDimension; slices?: GeoSlices; includeMoney: boolean },
): Promise<SliceBreakdown> {
  const period = daysPeriod(q.days.from, q.days.to, q.timeZone);
  const cut = orderSliceSql(q.slices ?? {});
  const key = DIMENSION_SQL[q.dimension];
  const [placed, delivered, returned] = await Promise.all([
    db.$queryRaw<{ k: string; n: bigint }[]>`
      SELECT ${key} AS "k", count(*) AS "n" FROM "Order" o WHERE ${basisWhere('ordered', q.storeId, period)}${cut} GROUP BY 1`,
    db.$queryRaw<{ k: string; n: bigint; goods: bigint | null }[]>`
      SELECT ${key} AS "k", count(*) AS "n", sum(o."subtotalMinor" - o."discountMinor") AS "goods" FROM "Order" o WHERE ${basisWhere('sales', q.storeId, period)}${cut} GROUP BY 1`,
    db.$queryRaw<{ k: string; n: bigint }[]>`
      SELECT ${key} AS "k", count(*) AS "n" FROM "Order" o
       WHERE o."storeId" = ${q.storeId} AND o."archivedAt" IS NULL AND o."status"::text = 'RETURNED'
         AND o."returnedAt" >= ${period.from} AND o."returnedAt" < ${period.to}${cut} GROUP BY 1`,
  ]);
  const by = new Map<string, SliceBucket>();
  const at = (k: string) => {
    let b = by.get(k);
    if (!b) by.set(k, (b = { key: k, orders: 0, delivered: 0, returned: 0, salesMinor: q.includeMoney ? 0 : null }));
    return b;
  };
  for (const r of placed) at(r.k).orders += Number(r.n);
  for (const r of delivered) {
    const b = at(r.k);
    b.delivered += Number(r.n);
    if (b.salesMinor !== null) b.salesMinor += Number(r.goods ?? 0);
  }
  for (const r of returned) at(r.k).returned += Number(r.n);
  const buckets = [...by.values()].sort((a, b) => b.orders - a.orders || a.key.localeCompare(b.key));
  return { dimension: q.dimension, days: q.days, buckets, total: sumBuckets(buckets) };
}
