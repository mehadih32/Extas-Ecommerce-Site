// S13 · PR 257 follow-up (go-live gate customer 360°, 1 Nov) — where a visit came from, kept until the order. Before,
// UTM tags and ad click ids were dropped at the door: the order kept no source, campaign or platform, so ad sales could
// not be counted (Profit & loss by channel, PR 355; the order export, PR 140), and a Facebook click without the pixel's
// own `_fbc` cookie reached the Conversions API with nothing to match on.
//
// - The proxy (src/proxy.ts) sees a shop page asked for with utm_source / utm_medium / utm_campaign or a click id
//   (fbclid → META, gclid → GOOGLE, ttclid → TIKTOK) and, while `ads.attribution` is on, keeps them in one first-party
//   cookie (`__Host-extas_src`, HttpOnly, the owner's `keepDays`): the latest tagged visit, or the first until its days
//   are over (`touch`). Such an answer is never kept by a cache. Only the tags in the link and the other site's address
//   (its origin, never the path) are kept — no name, number or address.
// - The checkout (lib/shop/checkout-api.ts) reads the cookie, still within the days and with the switch on, and hands
//   the tags in with the order (@extas/checkout attribution.ts writes Order.utmSource / utmMedium / utmCampaign /
//   adPlatform / referrer). Nothing in it changes a price, a discount, COD or the order's source.
// - The tracking hooks (lib/tracking/shop.ts) take the click's `fbc` when the pixel left none.
// The settings are read only when a tagged address arrives or an order is placed; a slow or missing read keeps nothing.
import { attributionData, type AttributionPlatform, type OrderAttribution } from '@extas/checkout/attribution';
import type { AttributionSettings } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';

export const ATTRIBUTION_COOKIE = '__Host-extas_src';

/** The campaign tags of a link, and the ad platforms' click ids with the platform each one names. */
export const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
export const CLICK_IDS = { fbclid: 'META', gclid: 'GOOGLE', ttclid: 'TIKTOK' } as const satisfies Record<string, AttributionPlatform>;

/** A click id as the platforms send them (anything else is not kept). */
const CLICK_ID = /^[A-Za-z0-9_-]{8,500}$/;
const DAY_MS = 86_400_000;
/** A visit time a little ahead of this server's clock is still taken (another server's clock). */
const SKEW_MS = 300_000; // hardcode-ok: a clock-skew allowance, not a business number

/** One tagged visit as the cookie keeps it. */
export interface Touch {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  adPlatform: AttributionPlatform | null;
  referrer: string | null;
  /** The Conversions API's click value made from a Facebook click id (`fb.1.<ms>.<fbclid>`). */
  fbc: string | null;
  /** When the visit came (ms). */
  at: number;
}

/** Whether an address carries anything to keep (a cheap check before any setting is read). */
export function hasTags(params: URLSearchParams): boolean {
  return [...UTM_PARAMS, ...Object.keys(CLICK_IDS)].some((k) => (params.get(k) ?? '').trim() !== '');
}

/** The visit an address and its Referer describe, or null when it carries no tag. */
export function touchOf(params: URLSearchParams, referer: string | null, ownHost: string, now: number): Touch | null {
  if (!hasTags(params)) return null;
  const click = (Object.keys(CLICK_IDS) as (keyof typeof CLICK_IDS)[]).find((k) => CLICK_ID.test(params.get(k) ?? ''));
  const tags = attributionData({ utmSource: params.get('utm_source'), utmMedium: params.get('utm_medium'), utmCampaign: params.get('utm_campaign'), adPlatform: click ? CLICK_IDS[click] : null, referrer: referer });
  // the shop's own pages are not "where he came from"
  const referrer = tags.referrer && new URL(tags.referrer).host !== ownHost ? tags.referrer : null;
  const fbclid = params.get('fbclid');
  const fbc = fbclid && CLICK_ID.test(fbclid) ? `fb.1.${now}.${fbclid}` : null;
  if (!tags.utmSource && !tags.utmMedium && !tags.utmCampaign && !tags.adPlatform) return null;
  return { ...tags, referrer, fbc, at: now };
}

/** The cookie's value: the visit as url-safe base64 JSON. */
export function encodeTouch(t: Touch): string {
  return Buffer.from(JSON.stringify(t), 'utf8').toString('base64url');
}

/** The visit a cookie holds, or null when it is missing, damaged or not ours. */
export function decodeTouch(raw: string | null | undefined): Touch | null {
  if (!raw || raw.length > 3_000 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null; // hardcode-ok: a cookie-size guard
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Touch>;
    if (typeof v !== 'object' || v === null || typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
    const tags = attributionData(v);
    const fbc = typeof v.fbc === 'string' && /^fb\.1\.\d{10,16}\.[A-Za-z0-9_-]{8,500}$/.test(v.fbc) ? v.fbc : null;
    return { ...tags, fbc, at: v.at };
  } catch {
    return null;
  }
}

/** The visit still counts: the switch is on and it came within the owner's days. */
export function stillKept(t: Touch | null, s: AttributionSettings, now: number): Touch | null {
  if (!t || !s.on) return null;
  return t.at <= now + SKEW_MS && now - t.at <= s.keepDays * DAY_MS ? t : null;
}

/** The visit the cookie should hold after this one (null: leave the cookie as it is). */
export function nextTouch(kept: Touch | null, arrived: Touch, s: AttributionSettings, now: number): Touch | null {
  if (!s.on) return null;
  return s.touch === 'first' && stillKept(kept, s, now) ? null : arrived;
}

export function attributionCookie(value: string, days: number): string {
  return `${ATTRIBUTION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(days * 86_400))}`;
}

/** What the order keeps of a visit. */
export const orderAttributionOf = (t: Touch | null): Partial<OrderAttribution> | null =>
  t ? { utmSource: t.utmSource, utmMedium: t.utmMedium, utmCampaign: t.utmCampaign, adPlatform: t.adPlatform, referrer: t.referrer } : null;

/** What reads the setting: the caller's own resolver (the checkout's, the tracking's), else the app's. */
export interface AttributionReader {
  value(key: 'ads.attribution', at: { storeId: number }): Promise<AttributionSettings>;
}

async function settingsOf(storeId: number, reader?: AttributionReader | null): Promise<AttributionSettings | null> {
  const r = reader ?? settingsResolver();
  if (!r) return null;
  try {
    return await withTimeout(r.value('ads.attribution', { storeId }), settingsTimeoutMs());
  } catch {
    return null;
  }
}

/**
 * For the proxy: the Set-Cookie line for a tagged shop address, or null (no tags, switched off, the first visit kept,
 * the settings not readable now).
 */
export async function landingCookie(o: { storeId: number; params: URLSearchParams; referer: string | null; host: string; cookie: string | null; now?: number }): Promise<string | null> {
  if (!hasTags(o.params)) return null;
  const now = o.now ?? Date.now();
  const arrived = touchOf(o.params, o.referer, o.host, now);
  if (!arrived) return null;
  const s = await settingsOf(o.storeId);
  if (!s) return null;
  const next = nextTouch(decodeTouch(o.cookie), arrived, s, now);
  return next ? attributionCookie(encodeTouch(next), s.keepDays) : null;
}

/** For the checkout and the tracking hooks: the visit this browser's cookie still counts (null: none). */
export async function keptTouch(raw: string | null, storeId: number, reader?: AttributionReader | null, now = Date.now()): Promise<Touch | null> {
  const t = decodeTouch(raw);
  if (!t) return null;
  const s = await settingsOf(storeId, reader);
  return s ? stillKept(t, s, now) : null;
}
