// S13 · PR 257 follow-up (go-live gate customer 360°, 1 Nov) — where an order came from, as the order keeps it. The shop
// reads the campaign tags of the visit from its own cookie (apps/web lib/tracking/attribution.ts, `ads.attribution`)
// and hands them in with the order; here they are checked once more and written on the order row: Order.utmSource,
// utmMedium, utmCampaign, adPlatform (META, GOOGLE or TIKTOK, from the click id) and referrer (the other site's
// address, never its path). Nothing in it changes a price, a discount, COD or the order's source.

/** The ad platforms a click id names (the names Profit & loss by channel reads, PR 355). */
export const ATTRIBUTION_PLATFORMS = ['META', 'GOOGLE', 'TIKTOK'] as const;
export type AttributionPlatform = (typeof ATTRIBUTION_PLATFORMS)[number];

export interface OrderAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  adPlatform: AttributionPlatform | null;
  referrer: string | null;
}

/** The longest tag kept (a campaign name is a short label; anything longer is cut). */
export const TAG_MAX = 100; // hardcode-ok: a field-length guard, not a business number

/** A tag as kept: no control or markup characters, trimmed, at most TAG_MAX characters; empty is null. */
export function cleanTag(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.normalize('NFC').replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').trim().slice(0, TAG_MAX).trim();
  return s || null;
}

/** An address's origin (scheme and host), only for http(s); anything else is null. */
export function cleanReferrer(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2_048) return null; // hardcode-ok: a URL-length guard
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** The fields the order row takes (all null when nothing came with the visit). */
export function attributionData(a: Partial<OrderAttribution> | null | undefined): OrderAttribution {
  const platform = typeof a?.adPlatform === 'string' ? ATTRIBUTION_PLATFORMS.find((p) => p === a.adPlatform) ?? null : null;
  return { utmSource: cleanTag(a?.utmSource), utmMedium: cleanTag(a?.utmMedium), utmCampaign: cleanTag(a?.utmCampaign), adPlatform: platform, referrer: cleanReferrer(a?.referrer) };
}
