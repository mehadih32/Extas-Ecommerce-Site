// PR 605 — test servers only (EXTAS_SHOP_TEST_PAGES=1): POST /api/shop/try-gift lets the device gate, Lighthouse and the
// journeys measure the gift checkout. It fills this browser's bag with the sample items (the same fill as
// /api/bag/try) and sets a cookie under which /checkout?gift=1 and the bag draw as if the owner had gift mode on
// (nothing is written to the store's settings). On the live shop the door answers 404 and the cookie is never read.
import { cookies } from 'next/headers';
import type { CheckoutDeps } from '@extas/checkout';
import type { GiftSettings, Key, Value } from '@extas/settings';
import { fail } from '../admin-auth';
import { testPagesOn, tryFillHandler } from './bag-api';
import { bagApiDeps } from './bag-deps';

export const TRY_GIFT_COOKIE = 'extas_try_gift';

/** Whether this browser asked to see gift mode (always false on the live shop). */
export async function tryGiftOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_GIFT_COOKIE)?.value === '1';
}

/** The settings as they are, with gift mode on (test servers only, for the browser that asked). */
export function giftTrialSettings(settings: CheckoutDeps['settings']): CheckoutDeps['settings'] {
  return {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const v = await settings.value(key, opts);
      return (key === 'checkout.gift' ? { ...(v as GiftSettings), enabled: true } : v) as Value<K>;
    },
  };
}

/** POST /api/shop/try-gift — test servers only: the sample bag, and this browser sees gift mode. */
export async function tryGiftHandler(request: Request): Promise<Response> {
  if (!testPagesOn()) return fail(404, 'not-found');
  const r = await tryFillHandler(request, bagApiDeps());
  if (!r.ok) return r;
  const headers = new Headers(r.headers);
  headers.append('set-cookie', `${TRY_GIFT_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600`);
  return new Response(r.body, { status: r.status, headers });
}
