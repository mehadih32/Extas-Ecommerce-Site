// PR 115–126 — the checkout on the server side of the shop: the engines' dependencies, the checkout's settings, the
// visitor's quote read from the bag cookie, and the words the checkout's client part shows. Without a database (CI,
// `next build`) or when it is slow, the page draws the empty bag with the registry defaults — never a guess.
import { checkoutQuote, emptyQuote, type CheckoutDeps, type CheckoutQuote } from '@extas/checkout';
import { findBag } from '@extas/cart';
import { getPrisma } from '@extas/db/client';
import { registry, type Key, type Value } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { visitorId } from './bag';
import type { CheckoutApiDeps } from './checkout-api';
import { shopStoreId, type ShopContext } from './context';
import { SHOP_DICTS, keysOf } from './dict';

/** What the checkout engines need: the database and the settings, or null without a database. */
export function checkoutDeps(): CheckoutDeps | null {
  const resolver = settingsResolver();
  if (!resolver) return null;
  return { db: getPrisma(), settings: resolver };
}

/** The checkout API's dependencies: the engines and the store the shop serves. */
export function checkoutApiDeps(): CheckoutApiDeps | null {
  const checkout = checkoutDeps();
  return checkout ? { checkout, storeId: shopStoreId() } : null;
}

const KEYS = [
  'checkout.fieldOrder',
  'checkout.tryOn.enabled',
  'checkout.help.enabled',
  'checkout.form.nameMin',
  'checkout.form.addressMin',
  'policy.exchange.windowHours',
  'delivery.resolver.settleMs',
  'delivery.resolver.minWords',
  'delivery.resolver.maxChars',
  'checkout.manyOfOne.enabled',
  'checkout.manyOfOne.min',
  'bag.undoMs',
] as const satisfies readonly Key[];

type CheckoutKey = (typeof KEYS)[number];
export type CheckoutSettings = { [K in CheckoutKey]: Value<K> };

export const defaultCheckoutSettings = (): CheckoutSettings => Object.fromEntries(KEYS.map((k) => [k, registry[k].default])) as CheckoutSettings;

/** The checkout's settings for a store (the registry defaults when the database is absent or slow). */
export async function checkoutSettings(storeId: number): Promise<CheckoutSettings> {
  const r = settingsResolver();
  if (!r) return defaultCheckoutSettings();
  try {
    const vals = await withTimeout(Promise.all(KEYS.map((k) => r.value(k, { storeId }))), settingsTimeoutMs());
    return Object.fromEntries(KEYS.map((k, i) => [k, vals[i]])) as CheckoutSettings;
  } catch {
    return defaultCheckoutSettings();
  }
}

/** The visitor's checkout, read and priced; the empty one when there is no bag or the database does not answer in time. */
export async function currentCheckout(c: Pick<ShopContext, 'storeId' | 'lang'>): Promise<CheckoutQuote> {
  const deps = checkoutDeps();
  const visitor = await visitorId();
  if (!deps || !visitor) return emptyQuote();
  try {
    return await withTimeout(
      (async () => {
        const cartId = await findBag(deps, { storeId: c.storeId, visitorId: visitor });
        return checkoutQuote(deps, { storeId: c.storeId, cartId, lang: c.lang });
      })(),
      settingsTimeoutMs() * 4,
    );
  } catch (e) {
    console.warn(`shop: the checkout is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return emptyQuote();
  }
}

/** Every `checkout.*` word in the page's language (the owner's words win), slots like {store} filled; for the client. */
export function checkoutWords(c: Pick<ShopContext, 't' | 'vars' | 'lang'>): Record<string, string> {
  return Object.fromEntries(keysOf(SHOP_DICTS[c.lang]).filter((k) => k.startsWith('checkout.')).map((k) => [k.slice('checkout.'.length), c.t(k, c.vars)]));
}
