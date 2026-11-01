// S13 · PR 257 (Blueprint C6.2) — server-side event tracking (registry version 85; lane B's reserved run, CN-031). The
// shop's own server tells the ad platforms (Meta, Google, TikTok) what shoppers did: a product seen, an item put in the
// bag, the checkout opened, an order placed — with the value, the category, the size and the colour, and the same event
// id a browser pixel would send, so each platform counts it once. Everything is off as it ships; each platform runs on
// its mock until its key is typed into Keys & connections and its test passes (A1.3). The delivered-order event is
// PR 258 (`ads.deliveredPurchase`, version 169, below) and the richer stage events PR 532; the masking layer for everything that leaves the server is PR 311 (until
// then a customer's phone and e-mail leave only as sha256 hashes, and only while `matchCustomers` is on).
import { z } from 'zod';
import { setting } from './define';

const V = 85;
/** PR 258 (lane B's run v169–179, CN-031): the delivered-purchase setting. */
const V_DELIVERED = 169;

/** The shopper events the shop can send (their platform names live in the web app's tracking model). */
export const TRACKING_EVENTS = ['view', 'addToBag', 'checkout', 'purchase'] as const;
export type TrackingEvent = (typeof TRACKING_EVENTS)[number];
/** The ad platforms with a server connection (Keys & connections: Meta Conversions API, Google Analytics 4, TikTok). */
export const TRACKING_PLATFORMS = ['meta', 'google', 'tiktok'] as const;
export type TrackingPlatform = (typeof TRACKING_PLATFORMS)[number];

export const trackingSchema = z
  .object({
    /** The master switch: off, nothing is recorded or sent. */
    on: z.boolean(),
    /** The events recorded while on, one tick each. */
    events: z.object({ view: z.boolean(), addToBag: z.boolean(), checkout: z.boolean(), purchase: z.boolean() }).strict(),
    /** The platforms they are sent to, one tick each (each one on its mock until its key is in). */
    platforms: z.object({ meta: z.boolean(), google: z.boolean(), tiktok: z.boolean() }).strict(),
    /** Send the hashed phone and e-mail of a known customer, so the platform can match the event to a person. */
    matchCustomers: z.boolean(),
    /** How many times a failed send is tried before it is left as failed. */
    maxAttempts: z.number().int().min(1).max(20),
  })
  .strict();
export type TrackingSettings = z.output<typeof trackingSchema>;

/** The ticked platforms, in their fixed order. */
// --- PR 258 (Blueprint C6.2 point 1): delivered-purchase optimisation --------------------------------------------------
// For a COD shop the sale is the parcel the customer accepted, not the order typed in. The order's own timeline (a
// person confirmed it; the courier or a person marked it delivered) becomes two server events, "confirmed" and
// "delivered", with the value of the pieces kept. The owner may tell the platforms that a purchase IS the delivery: the
// delivered event then goes under each platform's purchase name, and the order placed goes as a plain "order placed",
// so the ads learn from parcels accepted, never from COD orders refused at the door. Off as it ships; it rides on
// `ads.tracking` (its switch, platforms, customer matching and attempts). No money moves and no budget changes here.

/** The order steps sent (read from the order timeline, never from the browser). */
export const ORDER_TRACKING_EVENTS = ['confirmed', 'delivered'] as const;
export type OrderTrackingEvent = (typeof ORDER_TRACKING_EVENTS)[number];
/** Every event the tracking table can hold: the shopper's and the order's. */
export const ALL_TRACKING_EVENTS = [...TRACKING_EVENTS, ...ORDER_TRACKING_EVENTS] as const;
export type AnyTrackingEvent = (typeof ALL_TRACKING_EVENTS)[number];
/** What the platforms are told a purchase is: the order placed (as built in PR 257) or the parcel delivered. */
export const PURCHASE_MEANS = ['placed', 'delivered'] as const;
export type PurchaseMeans = (typeof PURCHASE_MEANS)[number];
/** The order sources (the database's OrderSource), each one ticked or not. */
export const ORDER_TRACKING_SOURCES = ['WEBSITE', 'LANDING_PAGE', 'MESSENGER', 'WHATSAPP', 'LIVE_CHAT', 'PHONE', 'TELEGRAM', 'ADMIN', 'SHOWROOM', 'IMPORT'] as const;
export type OrderTrackingSource = (typeof ORDER_TRACKING_SOURCES)[number];

export const deliveredPurchaseSchema = z
  .object({
    /** Off: no order step is recorded, and a purchase stays the order placed. */
    on: z.boolean(),
    /** The order steps recorded while on, one tick each. */
    events: z.object({ confirmed: z.boolean(), delivered: z.boolean() }).strict(),
    /** What the platforms' purchase event means. */
    purchaseMeans: z.enum(PURCHASE_MEANS),
    /** Whose orders count: an order typed at the counter or imported is no ad's sale unless ticked. */
    sources: z.object(Object.fromEntries(ORDER_TRACKING_SOURCES.map((k) => [k, z.boolean()])) as Record<OrderTrackingSource, z.ZodBoolean>).strict(),
    /** How far back the order timeline is read (the platforms take events up to seven days old). */
    lookbackHours: z.number().int().min(1).max(168),
    /** How often the shop reads the timeline for new steps. */
    everyMinutes: z.number().int().min(1).max(60),
  })
  .strict();
export type DeliveredPurchaseSettings = z.output<typeof deliveredPurchaseSchema>;

/** The ticked order sources, in their fixed order. */
export const tickedSources = (s: Pick<DeliveredPurchaseSettings, 'sources'>): OrderTrackingSource[] => ORDER_TRACKING_SOURCES.filter((k) => s.sources[k]);

export const tickedPlatforms = (s: Pick<TrackingSettings, 'platforms'>): TrackingPlatform[] => TRACKING_PLATFORMS.filter((p) => s.platforms[p]);

export const trackingSettings = {
  'ads.tracking': setting({
    scope: 'store',
    schema: trackingSchema,
    default: { on: false, events: { view: true, addToBag: true, checkout: true, purchase: true }, platforms: { meta: false, google: false, tiktok: false }, matchCustomers: false, maxAttempts: 5 },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.tracking.label',
    helpKey: 'ads.tracking.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 10,
    version: V,
  }),
  'ads.deliveredPurchase': setting({
    scope: 'store',
    schema: deliveredPurchaseSchema,
    default: {
      on: false,
      events: { confirmed: true, delivered: true },
      purchaseMeans: 'placed',
      sources: { WEBSITE: true, LANDING_PAGE: true, MESSENGER: false, WHATSAPP: false, LIVE_CHAT: false, PHONE: false, TELEGRAM: false, ADMIN: false, SHOWROOM: false, IMPORT: false },
      lookbackHours: 48,
      everyMinutes: 10,
    },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.deliveredPurchase.label',
    helpKey: 'ads.deliveredPurchase.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 11,
    version: V_DELIVERED,
  }),
};
