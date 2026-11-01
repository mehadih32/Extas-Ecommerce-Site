// S13 · PR 257 (Blueprint C6.2) — where the shop's events come from:
// - a product page seen and the checkout opened: the shop's beacon (components/shop/TrackingBeacon) names the page; the
//   server reads the product or the visitor's own bag itself (POST /api/shop/track);
// - an item put in the bag: the bag's add (lib/shop/bag-api.ts), after the line is saved;
// - an order placed: the checkout (lib/shop/checkout-api.ts), after the order is saved (its id: `purchase-<number>`).
// Each hook is quiet: while tracking is off it reads one cached setting and stops; it never throws, never slows the
// answer (the send runs after it) and never changes the bag or the order.
// PR 257 follow-up (go-live gate customer 360°): with no `_fbc` from a pixel, the Facebook click the visit came with
// (kept by lib/tracking/attribution.ts while `ads.attribution` is on) is the event's `fbc`.
import type { Prisma } from '@extas/db/client';
import { fail, readCookie, sameOrigin } from '../admin-auth';
import { BAG_COOKIE } from '../shop/bag-model';
import { ROUTES } from '../shop/routes';
import { ATTRIBUTION_COOKIE, keptTouch } from './attribution';
import { originOf, pageEvent, platformCookies, records, type StoredItem } from './model';
import { recordEvent, trackingDeps, type Shopper, type TrackingDeps } from './service';

/** A beacon's own event ids: never one of the server's (`purchase-<number>`), so a page cannot take an order's id. */
export const BEACON_ID = /^pv-[A-Za-z0-9-]{8,60}$/;

/** The largest beacon body (a path and an id). */
export const TRACK_BODY_MAX = 1_024; // hardcode-ok: a body-size guard, not a business number

/** The shop's own test browsers (the smoke test after every deploy, the saved journeys, the monthly lab run) are not
 *  shoppers: their page views never reach the ad platforms. */
const TEST_BROWSER = /HeadlessChrome|Playwright/i;

const quiet = (where: string, e: unknown) => console.warn(`tracking ${where}: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
const noContent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

const variantSelect = {
  sku: true,
  priceMinor: true,
  colour: { select: { nameEn: true } },
  size: { select: { label: true } },
  product: { select: { id: true, nameEn: true, category: { select: { nameEn: true } } } },
} satisfies Prisma.ProductVariantSelect;
type VariantFacts = Prisma.ProductVariantGetPayload<{ select: typeof variantSelect }>;

const itemOf = (v: VariantFacts, quantity: number, fallbackMinor: number | null): StoredItem => ({
  id: v.product.id,
  sku: v.sku,
  name: v.product.nameEn,
  category: v.product.category?.nameEn ?? null,
  colour: v.colour?.nameEn ?? null,
  size: v.size?.label ?? null,
  quantity,
  priceMinor: v.priceMinor ?? fallbackMinor,
});

/** The bag lines' variants (a bag line names its variant by id). */
async function variantsOf(deps: TrackingDeps, storeId: number, ids: readonly string[]): Promise<Map<string, VariantFacts>> {
  const rows = ids.length ? await deps.db.productVariant.findMany({ where: { storeId, id: { in: [...new Set(ids)] } }, select: { id: true, ...variantSelect } }) : [];
  return new Map(rows.map((r) => [r.id, r]));
}

/** Bag lines as items (a line whose variant is gone is left out). */
async function lineItems(deps: TrackingDeps, storeId: number, lines: readonly { variantId: string; quantity: number; unitPriceMinor: number }[]): Promise<StoredItem[]> {
  const vs = await variantsOf(deps, storeId, lines.map((l) => l.variantId));
  return lines.flatMap((l) => {
    const v = vs.get(l.variantId);
    return v ? [itemOf(v, l.quantity, l.unitPriceMinor)] : [];
  });
}

/** The shopper as far as this request tells: the bag's visitor id, the browser name, the platforms' cookies (the ad
 *  click the visit came with as `fbc` when the pixel left none). */
async function shopperOf(deps: TrackingDeps, request: Request, storeId: number, extra: Shopper = {}): Promise<Shopper> {
  const read = (n: string) => readCookie(request, n);
  const cookies = platformCookies(read);
  if (!cookies.fbc) {
    const fbc = (await keptTouch(read(ATTRIBUTION_COOKIE), storeId, deps.resolver))?.fbc;
    if (fbc) cookies.fbc = fbc;
  }
  return { visitorId: read(BAG_COOKIE), userAgent: request.headers.get('user-agent'), cookies, ...extra };
}

/** The shop page a call came from (the Referer of the same site), without its query. */
function pageOf(request: Request): string | null {
  const origin = originOf(request);
  const ref = request.headers.get('referer');
  if (!origin || !ref) return origin;
  try {
    const u = new URL(ref);
    return u.origin === origin ? `${origin}${u.pathname}` : origin;
  } catch {
    return origin;
  }
}

async function on(deps: TrackingDeps, storeId: number, name: 'view' | 'addToBag' | 'checkout' | 'purchase'): Promise<boolean> {
  return records(await deps.resolver.value('ads.tracking', { storeId }), name);
}

/** The bag's add: one line of `quantity` pieces just went in. */
export async function trackAddToBag(request: Request, o: { storeId: number; lineId: string; quantity: number }, deps: TrackingDeps | null = trackingDeps()): Promise<void> {
  try {
    if (!deps || !(await on(deps, o.storeId, 'addToBag'))) return;
    const line = await deps.db.cartItem.findFirst({ where: { id: o.lineId, storeId: o.storeId }, select: { variantId: true, unitPriceMinor: true } });
    if (!line) return;
    const items = await lineItems(deps, o.storeId, [{ ...line, quantity: o.quantity }]);
    if (!items.length) return;
    await recordEvent(deps, { storeId: o.storeId, name: 'addToBag', url: pageOf(request), items, shopper: await shopperOf(deps, request, o.storeId) });
  } catch (e) {
    quiet('add to bag', e);
  }
}

/** The checkout: an order was placed (a replay is never counted again: the event id is the order's number). */
export async function trackPurchase(request: Request, o: { storeId: number; orderId: string }, deps: TrackingDeps | null = trackingDeps()): Promise<void> {
  try {
    if (!deps || !(await on(deps, o.storeId, 'purchase'))) return;
    const order = await deps.db.order.findFirst({
      where: { id: o.orderId, storeId: o.storeId },
      select: {
        number: true,
        totalMinor: true,
        currency: true,
        phone: true,
        email: true,
        isGift: true,
        customerId: true,
        items: { where: { status: 'ACTIVE' }, select: { productId: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true } },
      },
    });
    if (!order) return;
    // the order's own lines as sold (their names and prices then); the category from the product
    const pids = [...new Set(order.items.map((i) => i.productId).filter((x): x is string => !!x))];
    const cats = new Map((pids.length ? await deps.db.product.findMany({ where: { storeId: o.storeId, id: { in: pids } }, select: { id: true, category: { select: { nameEn: true } } } }) : []).map((p) => [p.id, p.category?.nameEn ?? null]));
    const items: StoredItem[] = order.items.map((i) => ({ id: i.productId ?? i.sku, sku: i.sku, name: i.productName, category: i.productId ? (cats.get(i.productId) ?? null) : null, colour: i.colourName, size: i.sizeLabel, quantity: i.quantity, priceMinor: i.unitPriceMinor }));
    // a gift's phone and e-mail are the receiver's: never sent as the buyer
    const contact = order.isGift ? {} : { phone: order.phone, email: order.email };
    await recordEvent(deps, {
      storeId: o.storeId,
      name: 'purchase',
      eventId: `purchase-${order.number.replace(/[^A-Za-z0-9_.:-]/g, '-')}`,
      url: pageOf(request),
      items,
      valueMinor: order.totalMinor,
      currency: order.currency,
      orderId: o.orderId,
      shopper: await shopperOf(deps, request, o.storeId, { customerId: order.customerId, ...contact }),
    });
  } catch (e) {
    quiet('purchase', e);
  }
}

/** The product page's facts: one piece at its lowest live price. */
async function viewItems(deps: TrackingDeps, storeId: number, slug: string): Promise<StoredItem[] | null> {
  const p = await deps.db.product.findFirst({
    where: { storeId, slug, status: 'PUBLISHED', archivedAt: null },
    select: { id: true, nameEn: true, category: { select: { nameEn: true } }, variants: { where: { active: true, archivedAt: null, priceMinor: { not: null } }, select: { priceMinor: true }, orderBy: { priceMinor: 'asc' }, take: 1 } },
  });
  if (!p) return null;
  return [{ id: p.id, sku: null, name: p.nameEn, category: p.category?.nameEn ?? null, colour: null, size: null, quantity: 1, priceMinor: p.variants[0]?.priceMinor ?? null }];
}

/** The visitor's own open bag, line by line (saved-for-later and removed lines are not in it). */
async function bagItems(deps: TrackingDeps, storeId: number, visitorId: string | null): Promise<StoredItem[] | null> {
  if (!visitorId) return null;
  const cart = await deps.db.cart.findFirst({ where: { storeId, visitorId, status: 'ACTIVE' }, orderBy: { lastActivityAt: 'desc' }, select: { id: true } });
  if (!cart) return null;
  const lines = await deps.db.cartItem.findMany({ where: { cartId: cart.id, storeId, removedAt: null, savedForLater: false }, select: { variantId: true, quantity: true, unitPriceMinor: true } });
  const items = await lineItems(deps, storeId, lines);
  return items.length ? items : null;
}

/**
 * POST /api/shop/track — the shop's beacon: `{ path, id }` for a product page or the checkout. Public and same-site
 * (the proxy counts it like the problem reports); always answers 204, says nothing about what was kept.
 */
export async function trackHandler(request: Request, storeId: number, deps: TrackingDeps | null = trackingDeps()): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > TRACK_BODY_MAX) return fail(413, 'TOO_LARGE');
  if (!deps || TEST_BROWSER.test(request.headers.get('user-agent') ?? '')) return noContent();
  try {
    const text = await request.text();
    if (text.length > TRACK_BODY_MAX) return fail(413, 'TOO_LARGE');
    const b = JSON.parse(text) as { path?: unknown; id?: unknown };
    if (typeof b.path !== 'string' || !b.path.startsWith('/') || b.path.length > 300) return noContent();
    const s = await deps.resolver.value('ads.tracking', { storeId });
    if (!s.on) return noContent();
    const prefix = await deps.resolver.value('naming.productPathPrefix', { storeId });
    const page = pageEvent(b.path, prefix, ROUTES.checkout);
    if (!page || !records(s, page.name)) return noContent();
    const shopper = await shopperOf(deps, request, storeId);
    const items = page.name === 'view' ? await viewItems(deps, storeId, page.slug) : await bagItems(deps, storeId, shopper.visitorId ?? null);
    if (!items) return noContent();
    const origin = originOf(request);
    await recordEvent(deps, { storeId, name: page.name, eventId: typeof b.id === 'string' && BEACON_ID.test(b.id) ? b.id : null, url: origin ? `${origin}${b.path.replace(/[?#].*$/, '')}` : null, items, shopper });
  } catch (e) {
    quiet('beacon', e);
  }
  return noContent();
}
