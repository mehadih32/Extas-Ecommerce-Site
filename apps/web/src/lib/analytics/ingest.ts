// S15 · PR 338 (Blueprint D5, "Analytics — Locked") — the shop's public analytics beacon: POST /api/shop/analytics
// {name, pageType?, productId?, categoryId?, comboId?, sourceButton?, props?, occurredAt?}. Public, same-site only,
// size-capped; records one event into the shop's own database (@extas/analytics) — nothing sent to an outside
// service, nothing read by a model. Never holds a page up and never surfaces an error to a shopper: a disabled
// switch, a bad or oversized body, or a store with no database all answer 204 quietly (D5.3's own "tracking can fail,
// the shop cannot" — the same rule PR 257's own beacon already ships under).
// The visitor is the shop's own existing visitor cookie (lib/shop/bag-model.ts's BAG_COOKIE — the same id the bag,
// wishlist and orders already read, `lib/shop/bag.ts`'s `visitorId()`); a page view before the bag ever opens one
// still gets counted, because this beacon mints the same cookie itself when it finds none, exactly as the bag's own
// API does on its first add (bag-api.ts's `newVisitorId`). A signed-in customer's id and `isLoggedIn` come from the
// shop's own session (`customerOfRequest`), never from the browser's own say-so.
import { randomBytes } from 'node:crypto';
import { recordAnalyticsEvent, type AnalyticsDeps } from '@extas/analytics';
import type { AccountsDeps } from '@extas/accounts';
import { visitorIdSchema } from '@extas/cart';
import { readCookie, sameOrigin } from '../admin-auth';
import { readCapped } from '../read-capped';
import { customerOfRequest } from '../shop/account';
import { bagCookie, BAG_COOKIE } from '../shop/bag-model';
import type { Key, Value } from '@extas/settings';

/** The largest beacon body (one event: a name, a few short fields). */
export const ANALYTICS_BODY_MAX = 2_048; // hardcode-ok: a body-size guard, not a business number
/** How long the visitor cookie this beacon mints lives, when the bag has not minted one yet. */
const VISITOR_COOKIE_DAYS = 365; // hardcode-ok: a cookie lifetime, not a business number

/** The settings reader this beacon needs (just `value`) — the same narrow shape wishlist.ts's own `Reader` uses, so
 *  a test can stub it without building a full `AppResolver`. */
export interface AnalyticsSettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface AnalyticsApiDeps {
  analytics: AnalyticsDeps;
  accounts: AccountsDeps | null;
  resolver: AnalyticsSettingsReader;
  storeId: number;
}

const newVisitorId = () => randomBytes(24).toString('base64url');
const noContent = (extraHeaders?: Headers) => new Response(null, { status: 204, headers: extraHeaders ?? { 'cache-control': 'no-store' } });

/**
 * Records one event from the shop's own page. Always answers 204 (or 405 for a method other than POST) — a beacon's
 * caller never reads the body and never needs to retry on a refusal; `tracking can fail, the shop cannot`.
 */
export async function analyticsIngestHandler(request: Request, deps: AnalyticsApiDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return new Response(null, { status: 405 });
  if (!deps || !sameOrigin(request)) return noContent();
  const headers = new Headers({ 'cache-control': 'no-store' });
  const sent = readCookie(request, BAG_COOKIE);
  const visitorId = sent && visitorIdSchema.safeParse(sent).success ? sent : newVisitorId();
  if (visitorId !== sent) headers.append('set-cookie', bagCookie(BAG_COOKIE, visitorId, VISITOR_COOKIE_DAYS));
  try {
    const on = await deps.resolver.value('analytics.events', { storeId: deps.storeId });
    if (!on.on) return noContent(headers);
    const text = await readCapped(request, ANALYTICS_BODY_MAX);
    if (!text) return noContent(headers);
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== 'object') return noContent(headers);
    const r = raw as Record<string, unknown>;
    const me = await customerOfRequest(request, deps.accounts, deps.storeId);
    await recordAnalyticsEvent(deps.analytics, {
      storeId: deps.storeId,
      visitorId,
      isLoggedIn: !!me,
      customerId: me?.customer.id ?? null,
      name: r.name,
      pageType: r.pageType,
      productId: r.productId,
      categoryId: r.categoryId,
      comboId: r.comboId,
      sourceButton: r.sourceButton,
      props: r.props,
      occurredAt: r.occurredAt,
    });
  } catch {
    // tracking can fail, the shop cannot (Blueprint D5.3)
  }
  return noContent(headers);
}
