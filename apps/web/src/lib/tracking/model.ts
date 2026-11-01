// S13 · PR 257 (Blueprint C6.2) — the pure part of server-side event tracking: the event ids, the customer hashes, the
// money in the platforms' unit, which shop page is which event, and the per-platform delivery state. No database.
import { createHash } from 'node:crypto';
import type { AdEvent, AdEventName, AdItem, AdPlatform, AdUser } from '@extas/adapters';
import {
  ALL_TRACKING_EVENTS,
  ORDER_TRACKING_EVENTS,
  TRACKING_EVENTS,
  TRACKING_PLATFORMS,
  type AnyTrackingEvent,
  type DeliveredPurchaseSettings,
  type OrderTrackingEvent,
  type PurchaseMeans,
  type TrackingEvent,
  type TrackingSettings,
} from '@extas/settings';

export { ALL_TRACKING_EVENTS, ORDER_TRACKING_EVENTS, TRACKING_EVENTS, TRACKING_PLATFORMS, type AnyTrackingEvent, type OrderTrackingEvent, type TrackingEvent };

/** An event id a browser may send (the same id its pixel would use); the server makes one otherwise. */
export const EVENT_ID = /^[A-Za-z0-9_.:-]{8,80}$/;

/** The longest error kept on a delivery (the platforms' own words). */
const ERROR_MAX = 200; // hardcode-ok: a stored text's length, not a business number

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** sha256 of an e-mail as the platforms ask (trimmed, lower case); null when it is not an e-mail. */
export function hashEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? sha(e) : null;
}

/** sha256 of a +country phone: digits only for Meta (`ph`), with the plus for Google and TikTok (`phPlus`). */
export function hashPhone(raw: string | null | undefined): { ph: string; phPlus: string } | null {
  const p = (raw ?? '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(p)) return null;
  return { ph: sha(p.slice(1)), phPlus: sha(p) };
}

/** sha256 of the shop's own visitor or customer id (`external_id`). */
export const hashId = (id: string): string => sha(`extas:${id}`);

/** The currency's minor units in its major unit (taka): BDT 2 digits, JPY none. */
export function toMajor(minor: number, currency: string): number {
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // an unknown code keeps two digits
  }
  return Math.round(minor) / 10 ** digits;
}

/** Whether this event is recorded now (the switch, the ticked events; a test event always is). */
export const records = (s: TrackingSettings, name: TrackingEvent, test = false): boolean => test || (s.on && s.events[name]);

/** PR 258: an order step (confirmed, delivered), read from the order timeline rather than a shopper's page. */
export const isOrderStep = (name: string): name is OrderTrackingEvent => (ORDER_TRACKING_EVENTS as readonly string[]).includes(name);

/** PR 258: an order step is recorded while tracking and delivered-purchase are both on and the step is ticked. */
export const recordsStep = (s: TrackingSettings, dp: DeliveredPurchaseSettings, name: OrderTrackingEvent, test = false): boolean => test || (s.on && dp.on && dp.events[name]);

/**
 * PR 258 (C6.2 point 1): the name a stored event goes under. While a purchase means the delivery, the delivered event
 * takes the platforms' purchase name and the order placed becomes a plain "order placed", so the ads learn from parcels
 * accepted, not from COD orders refused at the door. Read at the send, so a change applies to what still waits.
 */
export function adNameOf(name: string, means: PurchaseMeans): AdEventName {
  if (name === 'purchase') return means === 'delivered' ? 'placed' : 'purchase';
  if (name === 'delivered') return means === 'delivered' ? 'purchase' : 'delivered';
  return (ALL_TRACKING_EVENTS as readonly string[]).includes(name) ? (name as AnyTrackingEvent) : 'view';
}

/** The address a beacon came from, without its language prefix: `/p/<slug>` → the product, `/checkout` → checkout. */
export function pageEvent(rawPath: string, productPrefix: string, checkoutPath: string): { name: 'view'; slug: string } | { name: 'checkout' } | null {
  const path = rawPath.replace(/[?#].*$/, '').replace(/^\/bn(?=\/|$)/, '') || '/';
  const segs = path.split('/').filter(Boolean);
  const prefix = productPrefix.split('/').filter(Boolean);
  if (prefix.length && segs.length > prefix.length && prefix.every((p, i) => segs[i] === p)) {
    const slug = segs[prefix.length]!;
    return /^[a-z0-9][a-z0-9-]{0,190}$/.test(slug) ? { name: 'view', slug } : null;
  }
  if (`/${segs.join('/')}` === checkoutPath.replace(/\/+$/, '')) return { name: 'checkout' };
  return null;
}

/** The shop address of a request, from its forwarded host and scheme (the domain is a setting, never code). */
export function originOf(request: Request): string | null {
  const u = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? u.host).split(',')[0]!.trim();
  const proto = (request.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '')).split(',')[0]!.trim();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) || (proto !== 'https' && proto !== 'http')) return null;
  return `${proto}://${host}`;
}

/** The platforms' own browser cookies, when a pixel set them (each checked for its shape). */
export function platformCookies(read: (name: string) => string | null): Pick<AdUser, 'fbp' | 'fbc' | 'ttp' | 'gaClientId'> {
  const fbp = read('_fbp');
  const fbc = read('_fbc');
  const ttp = read('_ttp');
  const ga = read('_ga');
  const gaId = ga?.match(/^GA\d\.\d\.(\d{1,20}\.\d{1,20})$/)?.[1];
  return {
    ...(fbp && /^fb\.\d\.\d{10,16}\.\d{1,30}$/.test(fbp) ? { fbp } : {}),
    ...(fbc && /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{1,500}$/.test(fbc) ? { fbc } : {}),
    ...(ttp && /^[A-Za-z0-9_.-]{8,100}$/.test(ttp) ? { ttp } : {}),
    ...(gaId ? { gaClientId: gaId } : {}),
  };
}

// --- the delivery state, per platform ------------------------------------------------------------------------------

export type DeliveryState = 'waiting' | 'sent' | 'mock' | 'failed';
export interface Delivery {
  state: DeliveryState;
  attempts: number;
  at?: string;
  error?: string;
}
export type Deliveries = Partial<Record<AdPlatform, Delivery>>;

export const waitingFor = (platforms: readonly AdPlatform[]): Deliveries => Object.fromEntries(platforms.map((p) => [p, { state: 'waiting', attempts: 0 }]));

/** One send's outcome on a platform: sent (live), mock (the practice copy took it), or failed (tried again later). */
export function afterSend(prev: Delivery | undefined, r: { ok: true; mode: 'MOCK' | 'LIVE' | 'SANDBOX' } | { ok: false; error: string }, at: Date): Delivery {
  const attempts = (prev?.attempts ?? 0) + 1;
  if (r.ok) return { state: r.mode === 'MOCK' ? 'mock' : 'sent', attempts, at: at.toISOString() };
  return { state: 'failed', attempts, at: at.toISOString(), error: r.error.slice(0, ERROR_MAX) };
}

/** Whether a platform still waits: never tried, or failed with attempts left. */
export const stillWaiting = (d: Delivery | undefined, maxAttempts: number): boolean => !!d && (d.state === 'waiting' || (d.state === 'failed' && d.attempts < maxAttempts));

// --- the stored row and the platform-neutral event -----------------------------------------------------------------

export interface StoredItem {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  colour: string | null;
  size: string | null;
  quantity: number;
  priceMinor: number | null;
}

export interface StoredEventRow {
  eventId: string;
  name: string;
  url: string | null;
  valueMinor: number | null;
  currency: string | null;
  items: unknown;
  userData: unknown;
  occurredAt: Date;
}

const asItems = (v: unknown): StoredItem[] => (Array.isArray(v) ? (v as StoredItem[]) : []);

/** The row as the adapters take it (money in the major unit; the order number for a purchase or an order step). */
export function toAdEvent(row: StoredEventRow, orderNumber: string | null, means: PurchaseMeans = 'placed'): AdEvent {
  const currency = row.currency;
  const major = (m: number | null) => (m == null || !currency ? null : toMajor(m, currency));
  const items: AdItem[] = asItems(row.items).map((i) => ({ id: i.id, sku: i.sku, name: i.name, category: i.category, colour: i.colour, size: i.size, quantity: i.quantity, price: major(i.priceMinor) }));
  const user = (row.userData && typeof row.userData === 'object' ? row.userData : {}) as AdUser;
  return {
    eventId: row.eventId,
    name: adNameOf(row.name, means),
    at: row.occurredAt,
    url: row.url,
    value: major(row.valueMinor),
    currency,
    items,
    orderNumber,
    user,
    // an order step with no shopper's browser behind it (an order typed by staff, tracking switched on after it)
    ...(isOrderStep(row.name) && !user.ua ? { system: true } : {}),
  };
}

/** PR 258: the contact hashes leave only while matching is allowed now (an older row may carry them). */
export function withoutContact(u: AdUser): AdUser {
  const out = { ...u };
  delete out.em;
  delete out.ph;
  delete out.phPlus;
  return out;
}

/** The value of a list of items (minor units), or null when a price is unknown. */
export function valueOf(items: readonly StoredItem[]): number | null {
  if (!items.length || items.some((i) => i.priceMinor == null)) return null;
  return items.reduce((n, i) => n + (i.priceMinor ?? 0) * i.quantity, 0);
}
