// @extas/analytics — S15 · PR 338 (Blueprint D5, "Analytics — Locked"). The site-wide analytics event layer's pure
// half: the owner's own event catalogue (D5's V2 note: "the owner's event list is part of the layer's definition")
// and the deterministic shaping that turns one raw event — from a shopper's browser or the shop's own server code —
// into a row `record.ts` can store. No database, no AI, nothing invented: an event name outside the catalogue is
// refused rather than stored, so a stale client build or a hand-crafted payload can never write junk into the
// owner's reports (PR 339–341 read this table; the AI commentary agent, PR 333, only ever explains what is in it).
// D5.3's own rule: "tracking can fail, the shop cannot" — every shaping function here is lenient by design (an
// unreadable field is dropped, never thrown), so a malformed event never surfaces an error to a shopper.

/** Every event name the layer accepts (D5.1's starting set plus the owner's own V2 list: search terms; WhatsApp
 *  clicks by page and by button; add-to-bag → purchased; direct purchase; removed, re-added, new adds; adds from an
 *  offer/combo/set; "All N colours" taps; Size chart taps; wishlist saves). `pageType`, `productId`/`categoryId`,
 *  `sourceButton` and `isLoggedIn` are carried on every event (not baked into the name), exactly as D5's V2 note
 *  asks: "every event carries page type, product/category, and source button so each part can be read on its own."
 *  Claude may add more as it sees fit (D5's own instruction) — a later PR, never silently here. */
export const ANALYTICS_EVENT_NAMES = [
  'page_view',
  'product_view',
  'search',
  'all_colours_click',
  'size_chart_click',
  'whatsapp_click',
  'add_to_bag',
  'order_now',
  'remove_from_bag',
  're_add',
  'new_add_after_remove',
  'checkout_start',
  'purchase',
  'wishlist_add',
  'wishlist_remove',
  'login',
  'logout',
  'signup',
  'guest_checkout',
] as const satisfies readonly string[];
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const isAnalyticsEventName = (v: unknown): v is AnalyticsEventName => typeof v === 'string' && (ANALYTICS_EVENT_NAMES as readonly string[]).includes(v);

/** The longest a stored page type / source button id is kept (a display string, not a business number). */
export const PAGE_TYPE_MAX = 40; // hardcode-ok
export const SOURCE_BUTTON_MAX = 80; // hardcode-ok
/** The longest a free-text prop (a search term, a button label) is kept. */
export const PROP_TEXT_MAX = 200; // hardcode-ok: a stored text's length, not a business number
/** The most keys one event's own `props` may carry; the rest are dropped, not refused, so a newer client's wider
 *  payload never breaks an older server. */
export const PROPS_MAX_KEYS = 24; // hardcode-ok: a payload-shape guard, not a business number
/** A browser's clock cannot be trusted: an event is never stored in the future, and never older than this past the
 *  server's own clock (a slow send queue, never a backdated event). */
export const OCCURRED_AT_PAST_MS = 10 * 60_000; // hardcode-ok: a clock-skew guard, not a business number

/** Loose enough for both a real database id (uuid v7) and a demo/test id; never trusted further than "looks like one". */
const ID_LIKE = /^[0-9a-f-]{8,64}$/i;

export type AnalyticsPropValue = string | number | boolean | null;

export interface NormalizedAnalyticsEvent {
  name: AnalyticsEventName;
  pageType: string | null;
  productId: string | null;
  categoryId: string | null;
  comboId: string | null;
  sourceButton: string | null;
  props: Record<string, AnalyticsPropValue> | null;
  occurredAt: Date;
}

const asId = (v: unknown): string | null => (typeof v === 'string' && ID_LIKE.test(v) ? v : null);
const asText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** One prop's value, shaped to what the database can hold as JSON; `undefined` means "drop this key". */
function propValue(v: unknown): AnalyticsPropValue | undefined {
  if (v === null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.slice(0, PROP_TEXT_MAX);
  return undefined; // an object, array or function in props: dropped, never stored as unreadable JSON
}

/** Keeps at most `PROPS_MAX_KEYS` well-shaped props; an empty or unreadable object becomes `null`, never `{}`. */
export function clampProps(raw: unknown): Record<string, AnalyticsPropValue> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, AnalyticsPropValue> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= PROPS_MAX_KEYS) break;
    if (!k.trim() || k.length > 40) continue;
    const val = propValue(v);
    if (val === undefined) continue;
    out[k] = val;
    n++;
  }
  return n ? out : null;
}

/** Clamps a browser-reported time to a narrow, honest window around the server's own clock. */
export function clampOccurredAt(raw: unknown, now: Date): Date {
  const t = typeof raw === 'string' ? new Date(raw) : null;
  if (!t || Number.isNaN(t.getTime())) return now;
  if (t.getTime() > now.getTime()) return now;
  if (t.getTime() < now.getTime() - OCCURRED_AT_PAST_MS) return new Date(now.getTime() - OCCURRED_AT_PAST_MS);
  return t;
}

/**
 * Validates and shapes one raw event (an object with at least a `name`). Returns `null` for an unknown event name or
 * a payload that is not an object — never invented, never stored — rather than throwing: a page's own tracking call
 * is never allowed to hold the page up or surface an error (D5.3's own "tracking can fail, the shop cannot").
 */
export function normalizeAnalyticsEvent(raw: unknown, now: Date = new Date()): NormalizedAnalyticsEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isAnalyticsEventName(r.name)) return null;
  return {
    name: r.name,
    pageType: asText(r.pageType, PAGE_TYPE_MAX),
    productId: asId(r.productId),
    categoryId: asId(r.categoryId),
    comboId: asId(r.comboId),
    sourceButton: asText(r.sourceButton, SOURCE_BUTTON_MAX),
    props: clampProps(r.props),
    occurredAt: clampOccurredAt(r.occurredAt, now),
  };
}
