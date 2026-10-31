// S13 · PR 257 (Blueprint C6.2) — server-side event tracking (registry version 85; lane B's reserved run, CN-031). The
// shop's own server tells the ad platforms (Meta, Google, TikTok) what shoppers did: a product seen, an item put in the
// bag, the checkout opened, an order placed — with the value, the category, the size and the colour, and the same event
// id a browser pixel would send, so each platform counts it once. Everything is off as it ships; each platform runs on
// its mock until its key is typed into Keys & connections and its test passes (A1.3). The delivered-order event is
// PR 258 and the richer stage events PR 532; the masking layer for everything that leaves the server is PR 311 (until
// then a customer's phone and e-mail leave only as sha256 hashes, and only while `matchCustomers` is on).
import { z } from 'zod';
import { setting } from './define';

const V = 85;

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
};
