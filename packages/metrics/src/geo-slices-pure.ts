// S29 · PR 756 (CN-054) — the parts of the Geography map's slices that need no database (the names, the address parts,
// `classify` and the bucket sums), so the screen in the browser can use them without the database client. The rules are
// in geo-slices.ts, which re-exports all of this.
import type { GeoDays, GeoSlices } from './geo-types';

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

/** Every slice is shown (owner's decision, 16 Nov 2026: no switches on the Geography map). */
export function shownSlices(): SliceKey[] {
  return [...SLICE_KEYS];
}

/** The mix as the figures take it: what is not a known slice value is dropped (never an error). */
export function allowedSlices(slices: GeoSlices): GeoSlices {
  return normalizeSlices(slices);
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

/** Add the buckets up (the total of a breakdown, and what the tests hold against the whole). */
export function sumBuckets(buckets: readonly SliceBucket[]): SliceBreakdown['total'] {
  return {
    orders: buckets.reduce((n, b) => n + b.orders, 0),
    delivered: buckets.reduce((n, b) => n + b.delivered, 0),
    returned: buckets.reduce((n, b) => n + b.returned, 0),
    salesMinor: buckets.some((b) => b.salesMinor === null) ? null : buckets.reduce((n, b) => n + (b.salesMinor ?? 0), 0),
  };
}
