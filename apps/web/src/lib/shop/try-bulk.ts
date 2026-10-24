// PR 606 — test servers only (EXTAS_SHOP_TEST_PAGES=1): POST /api/shop/try-bulk lets the device gate and the journeys
// see the bulk / corporate lane, which ships off. It fills this browser's bag with the sample items (the same fill as
// /api/bag/try) and sets a cookie under which the menu row, the bag's card (from two pieces, so the sample bag shows
// it) and /bulk-order draw as if the owner had the lane on — and an enquiry sent from that browser is taken. Nothing
// is written to the store's settings. On the live shop the door answers 404 and the cookie is never read.
import { cookies } from 'next/headers';
import type { CheckoutDeps } from '@extas/checkout';
import type { BulkLaneSettings, Key, Value } from '@extas/settings';
import { fail, readCookie } from '../admin-auth';
import { testPagesOn, tryFillHandler } from './bag-api';
import { bagApiDeps } from './bag-deps';

export const TRY_BULK_COOKIE = 'extas_try_bulk';

/** The lane as the trial draws it: on, and the bag's card from two pieces when the owner set no number. */
export function bulkTrial(lane: BulkLaneSettings): BulkLaneSettings {
  return { ...lane, enabled: true, bag: { ...lane.bag, atPieces: lane.bag.atPieces ?? 2 } };
}

/** Whether this browser asked to see the lane (always false on the live shop). */
export async function tryBulkOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_BULK_COOKIE)?.value === '1';
}

/** The same, for an API request. */
export function tryBulkOnRequest(request: Request): boolean {
  return testPagesOn() && readCookie(request, TRY_BULK_COOKIE) === '1';
}

/** The settings as they are, with the lane on (test servers only, for the browser that asked). */
export function bulkTrialSettings(settings: CheckoutDeps['settings']): CheckoutDeps['settings'] {
  return {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const v = await settings.value(key, opts);
      return (key === 'orders.bulkLane' ? bulkTrial(v as BulkLaneSettings) : v) as Value<K>;
    },
  };
}

/** POST /api/shop/try-bulk — test servers only: the sample bag, and this browser sees the lane. */
export async function tryBulkHandler(request: Request): Promise<Response> {
  if (!testPagesOn()) return fail(404, 'not-found');
  const r = await tryFillHandler(request, bagApiDeps());
  if (!r.ok) return r;
  const headers = new Headers(r.headers);
  headers.append('set-cookie', `${TRY_BULK_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600`);
  return new Response(r.body, { status: r.status, headers });
}
