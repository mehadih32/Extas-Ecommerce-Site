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
import type { GeoDays, GeoMapSetting, GeoSlices } from './geo-types';

/** Every slice, in the order the filter bar shows them. */
export const SLICE_KEYS = ['categoryId', 'productId', 'channel', 'paymentType', 'courierId', 'customerType'] as const satisfies readonly (keyof GeoSlices)[];
export type SliceKey = (typeof SLICE_KEYS)[number];

/** The slices that narrow whole orders (the others narrow order lines). */
export const ORDER_SLICE_KEYS = ['channel', 'paymentType', 'courierId', 'customerType'] as const satisfies readonly SliceKey[];

/** Order.source as the schema lists it (a test holds this list against schema.prisma). */
export const CHANNELS = ['WEBSITE', 'LANDING_PAGE', 'MESSENGER', 'WHATSAPP', 'LIVE_CHAT', 'PHONE', 'TELEGRAM', 'ADMIN', 'SHOWROOM', 'IMPORT'] as const;
/** Payment methods that count as online (paid before the parcel leaves, not over the counter). */
export const ONLINE_METHODS = ['BKASH', 'NAGAD', 'CARD', 'WALLET', 'BANK_TRANSFER', 'ROCKET', 'UPAY', 'ONLINE'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anything not recognised is dropped (never an error); an absent slice means "all". */
export function normalizeSlices(input: unknown): GeoSlices {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: GeoSlices = {};
  const id = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);
  if (id(o.categoryId)) out.categoryId = id(o.categoryId);
  if (id(o.productId)) out.productId = id(o.productId);
  if (id(o.courierId)) out.courierId = id(o.courierId);
  if (typeof o.channel === 'string' && (CHANNELS as readonly string[]).includes(o.channel)) out.channel = o.channel;
  if (o.paymentType === 'COD' || o.paymentType === 'ONLINE') out.paymentType = o.paymentType;
  if (o.customerType === 'NEW' || o.customerType === 'REPEAT') out.customerType = o.customerType;
  return out;
}

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** The slices from the screen's address (?channel=PHONE&pay=COD&courier=…&cust=NEW&cat=…&product=…). */
export function slicesFromSearch(sp: Search): GeoSlices {
  return normalizeSlices({
    categoryId: first(sp.cat),
    productId: first(sp.product),
    channel: first(sp.channel),
    paymentType: first(sp.pay),
    courierId: first(sp.courier),
    customerType: first(sp.cust),
  });
}

/** The address parts of a mix (only the slices that are set). */
export function slicesToParams(slices: GeoSlices): Record<string, string> {
  const s = normalizeSlices(slices);
  return {
    ...(s.categoryId ? { cat: s.categoryId } : {}),
    ...(s.productId ? { product: s.productId } : {}),
    ...(s.channel ? { channel: s.channel } : {}),
    ...(s.paymentType ? { pay: s.paymentType } : {}),
    ...(s.courierId ? { courier: s.courierId } : {}),
    ...(s.customerType ? { cust: s.customerType } : {}),
  };
}

/** How many slices are set (the filter bar's "3 filters" chip). */
export const sliceCount = (slices: GeoSlices): number => Object.keys(slicesToParams(slices)).length;

/** The slices the setting `reports.geoMap.slices` shows: a slice is shown only when its switch is on. */
export function shownSlices(setting: GeoMapSetting['slices']): SliceKey[] {
  return SLICE_KEYS.filter((k) => setting[k] === true);
}

/** The mix with every hidden slice taken out (a hidden slice in an old link or a saved view never narrows the figures). */
export function allowedSlices(slices: GeoSlices, setting: GeoMapSetting['slices']): GeoSlices {
  const shown = new Set<string>(shownSlices(setting));
  return Object.fromEntries(Object.entries(normalizeSlices(slices)).filter(([k]) => shown.has(k))) as GeoSlices;
}

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

// ---- the breakdown: for one dimension, every value and the parts add up -------------------------------------------------

export const SLICE_DIMENSIONS = ['channel', 'paymentType', 'courier', 'customerType'] as const;
export type SliceDimension = (typeof SLICE_DIMENSIONS)[number];
/** The bucket for an order that does not say. */
export const UNKNOWN_BUCKET = 'UNKNOWN';

/** What `classify` needs of an order (the same facts the SQL reads). */
export interface SliceFacts {
  source: string;
  paymentMethod: string | null;
  courierAccountId: string | null;
  /** null when the order has neither a customer nor a phone. */
  customerKnown: boolean;
  hasEarlierOrder: boolean;
}

/** The bucket an order falls in for a dimension: the reference the SQL mirrors (tested against the same fixtures). */
export function classify(dimension: SliceDimension, o: SliceFacts): string {
  switch (dimension) {
    case 'channel':
      return o.source;
    case 'paymentType':
      return o.paymentMethod === null || o.paymentMethod === 'COD' ? 'COD' : (ONLINE_METHODS as readonly string[]).includes(o.paymentMethod) ? 'ONLINE' : 'OTHER';
    case 'courier':
      return o.courierAccountId ?? UNKNOWN_BUCKET;
    case 'customerType':
      return !o.customerKnown ? UNKNOWN_BUCKET : o.hasEarlierOrder ? 'REPEAT' : 'NEW';
  }
}

export interface SliceBucket {
  /** The value (PHONE, COD, a courier id, NEW …) or UNKNOWN. */
  key: string;
  /** Orders placed (placed day). */
  orders: number;
  /** Delivered orders (delivered day). */
  delivered: number;
  /** Returned orders (returned day). */
  returned: number;
  /** Goods of the delivered orders (subtotal − discount), minor units; null when the viewer may not see money. */
  salesMinor: number | null;
}

export interface SliceBreakdown {
  dimension: SliceDimension;
  days: GeoDays;
  /** Most orders first, then by key. */
  buckets: SliceBucket[];
  /** The sum of the buckets: always the figure of the same orders with no cut by this dimension. */
  total: Omit<SliceBucket, 'key'>;
}

const DIMENSION_SQL: Record<SliceDimension, Prisma.Sql> = {
  channel: Prisma.sql`o."source"::text`,
  paymentType: PAYMENT_CASE,
  courier: Prisma.sql`coalesce(o."courierAccountId"::text, 'UNKNOWN')`,
  customerType: CUSTOMER_CASE,
};

/** Add the buckets up (the total of a breakdown, and what the tests hold against the whole). */
export function sumBuckets(buckets: readonly SliceBucket[]): SliceBreakdown['total'] {
  return {
    orders: buckets.reduce((n, b) => n + b.orders, 0),
    delivered: buckets.reduce((n, b) => n + b.delivered, 0),
    returned: buckets.reduce((n, b) => n + b.returned, 0),
    salesMinor: buckets.some((b) => b.salesMinor === null) ? null : buckets.reduce((n, b) => n + (b.salesMinor ?? 0), 0),
  };
}

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
