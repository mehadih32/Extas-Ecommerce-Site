// Follow-up 260 (PR 143) — test servers only (EXTAS_SHOP_TEST_PAGES=1, and only while the SMS sender is the mock):
// POST /api/account/try-cards lets the device gate, Lighthouse and the journeys measure the order page with the
// customer's edit card in it. It signs this browser in as the sample customer (the same door as /api/account/try) and
// sets a cookie under which the order page and the account API read the switch as on (`orders.edit.customer`, off by
// default) — nothing is written to the store's settings. On the live shop the door answers 404 and the cookie is
// never read.
import { cookies } from 'next/headers';
import type { AccountsDeps } from '@extas/accounts';
import type { Key, Value } from '@extas/settings';
import { readCookie } from '../admin-auth';

export const TRY_CARDS_COOKIE = 'extas_try_cards';
const testPagesOn = () => process.env.EXTAS_SHOP_TEST_PAGES === '1';

/** Whether the page being drawn asked for the cards (always false on the live shop: the cookie is not even read). */
export async function tryCardsOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_CARDS_COOKIE)?.value === '1';
}

/** The same for an API request. */
export function tryCardsOnRequest(request: Request): boolean {
  return testPagesOn() && readCookie(request, TRY_CARDS_COOKIE) === '1';
}

/** The cookie the fill sets (an hour, this site only). */
export const tryCardsCookie = (): string => `${TRY_CARDS_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600`;

/** The settings as they are, with the customer's edit on (test servers only). */
export function cardsTrialSettings<S extends AccountsDeps['settings']>(settings: S): S {
  return {
    ...settings,
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const v = await settings.value(key, opts);
      if (key === 'orders.edit.customer') return { ...(v as Value<'orders.edit.customer'>), enabled: true } as Value<K>;
      return v;
    },
  } as S;
}

