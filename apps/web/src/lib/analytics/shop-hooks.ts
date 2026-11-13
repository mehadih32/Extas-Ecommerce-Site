// S15 · PR 338 (Blueprint D5, "Analytics — Locked") — analytics hooks called from inside the shop's own write paths
// (the bag's add, an order placed) — never from a browser request, so the quantity and the order are always the
// server's own truth. The visitor id and the signed-in customer both come from the request's own cookies/session,
// the same way lib/tracking/shop.ts's own shopperOf reads them for the ad platforms; this writes a separate, sibling
// row (AnalyticsEvent, never TrackedEvent) for the owner's own Analytics section (PR 339–341), not the ad platforms.
// Quiet: a failure here never stops the add or the order — D5.3's own "tracking can fail, the shop cannot" — and
// each hook checks the master switch (`analytics.events`) itself, the same way trackAddToBag/trackPurchase check
// `ads.tracking` before doing anything.
import { getPrisma } from '@extas/db/client';
import { recordAnalyticsEvent, type AnalyticsDeps } from '@extas/analytics';
import type { AccountsDeps } from '@extas/accounts';
import { readCookie } from '../admin-auth';
import { accountDeps, customerOfRequest } from '../shop/account';
import { BAG_COOKIE } from '../shop/bag-model';
import { settingsResolver } from '../settings';
import type { AnalyticsSettingsReader } from './ingest';

export interface ShopAnalyticsDeps {
  analytics: AnalyticsDeps;
  accounts: AccountsDeps | null;
  resolver: AnalyticsSettingsReader;
}

const quiet = (where: string, e: unknown) => console.warn(`analytics ${where}: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);

/** This app's own analytics hook dependencies, or null without a database (every hook below is then simply skipped). */
export function shopAnalyticsDeps(): ShopAnalyticsDeps | null {
  const resolver = settingsResolver();
  if (!resolver) return null;
  return { analytics: { db: getPrisma() }, accounts: accountDeps(), resolver };
}

/** The bag's add: one line (`quantity` pieces of one variant) just went in. */
export async function recordAddToBagAnalytics(request: Request, o: { storeId: number; variantId: string; quantity: number }, deps: ShopAnalyticsDeps | null = shopAnalyticsDeps()): Promise<void> {
  if (!deps) return;
  try {
    if (!(await deps.resolver.value('analytics.events', { storeId: o.storeId })).on) return;
    const visitorId = readCookie(request, BAG_COOKIE);
    if (!visitorId) return;
    const me = await customerOfRequest(request, deps.accounts, o.storeId);
    await recordAnalyticsEvent(deps.analytics, {
      storeId: o.storeId,
      visitorId,
      isLoggedIn: !!me,
      customerId: me?.customer.id ?? null,
      name: 'add_to_bag',
      sourceButton: 'bag_api',
      props: { variantId: o.variantId, quantity: o.quantity },
    });
  } catch (e) {
    quiet('add to bag', e);
  }
}

/** An order placed: the checkout's own write path, after the order is saved. */
export async function recordPurchaseAnalytics(request: Request, o: { storeId: number; orderId: string; number: string }, deps: ShopAnalyticsDeps | null = shopAnalyticsDeps()): Promise<void> {
  if (!deps) return;
  try {
    if (!(await deps.resolver.value('analytics.events', { storeId: o.storeId })).on) return;
    const visitorId = readCookie(request, BAG_COOKIE);
    if (!visitorId) return;
    const me = await customerOfRequest(request, deps.accounts, o.storeId);
    await recordAnalyticsEvent(deps.analytics, {
      storeId: o.storeId,
      visitorId,
      isLoggedIn: !!me,
      customerId: me?.customer.id ?? null,
      name: 'purchase',
      sourceButton: 'checkout_api',
      props: { orderId: o.orderId, number: o.number },
    });
  } catch (e) {
    quiet('purchase', e);
  }
}
