// PR 115–126 — the checkout on the server side of the shop: the engines' dependencies, the checkout's settings, the
// visitor's quote read from the bag cookie, and the words the checkout's client part shows. Without a database (CI,
// `next build`) or when it is slow, the page draws the empty bag with the registry defaults — never a guess.
import { checkoutQuote, emptyQuote, orderReceipt, payView, type CheckoutDeps, type CheckoutQuote, type PayView, type Receipt } from '@extas/checkout';
import { findBag } from '@extas/cart';
import { checkoutPrefill, type CheckoutPrefill } from '@extas/accounts';
import { getPrisma } from '@extas/db/client';
import { registry, type Key, type Value } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { accountDeps, customerOfRequest, signedIn } from './account';
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
  if (!checkout) return null;
  const storeId = shopStoreId();
  const accounts = accountDeps();
  return { checkout, storeId, customerOf: async (request) => (await customerOfRequest(request, accounts, storeId))?.customer.id ?? null };
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
  'delivery.suggest.enabled',
  'delivery.suggest.minChars',
  'checkout.manyOfOne.enabled',
  'checkout.manyOfOne.min',
  'bag.undoMs',
  'checkout.consent.enabled',
  'checkout.consent.sms.default',
  'checkout.consent.whatsapp.default',
  'checkout.confirm.style',
  'checkout.note.enabled',
  'checkout.note.maxChars',
  'checkout.capture.enabled',
  'checkout.capture.waitMs',
  'account.thanksCard.enabled',
  'checkout.autofill',
  'checkout.address.backfill',
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
    const me = await signedIn();
    return await withTimeout(
      (async () => {
        const cartId = await findBag(deps, { storeId: c.storeId, visitorId: visitor });
        return checkoutQuote(deps, { storeId: c.storeId, cartId, lang: c.lang, customerId: me?.customer.id ?? null });
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

/** PR 125 — the visitor's own order's payment for the mock payment page (null: not his order, none open, no database). */
export async function currentPayment(c: Pick<ShopContext, 'storeId'>, number: string): Promise<PayView | null> {
  const deps = checkoutDeps();
  const visitor = await visitorId();
  if (!deps || !visitor) return null;
  try {
    return await withTimeout(payView(deps, { storeId: c.storeId, visitorId: visitor, number }), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: the payment is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/**
 * PR 134 — an order for My account's order page: the signed-in customer's own (any device), or the one this browser
 * placed. `signedIn` tells the page which "log in" to show when there is none (signed out, or not his).
 */
export async function accountReceipt(c: Pick<ShopContext, 'storeId'>, number: string): Promise<{ receipt: Receipt | null; signedIn: boolean }> {
  const deps = checkoutDeps();
  const [visitor, me] = await Promise.all([visitorId(), signedIn()]);
  if (!deps || (!visitor && !me)) return { receipt: null, signedIn: !!me };
  try {
    const receipt = await withTimeout(orderReceipt(deps, { storeId: c.storeId, visitorId: visitor, customerId: me?.customer.id ?? null, number }), settingsTimeoutMs() * 4);
    return { receipt, signedIn: !!me };
  } catch (e) {
    console.warn(`shop: the order is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return { receipt: null, signedIn: !!me };
  }
}

/**
 * PR 136 — the order an invoice is made from: the customer's own (as the order page reads it), else, for a staff member
 * signed in to the admin with `orders.invoice`, any placed order of the store (the shop's own copy to print or send).
 * The staff check runs only when the customer's read found nothing, so a customer's invoice costs no admin lookup.
 */
export async function invoiceReceipt(c: Pick<ShopContext, 'storeId'>, number: string): Promise<{ receipt: Receipt | null; signedIn: boolean }> {
  const own = await accountReceipt(c, number);
  if (own.receipt) return own;
  const deps = checkoutDeps();
  if (!deps) return own;
  try {
    const { pageAccess } = await import('../admin-page');
    const access = await pageAccess('orders.invoice', undefined, c.storeId);
    if (access.kind !== 'ok') return own;
    const receipt = await withTimeout(orderReceipt(deps, { storeId: c.storeId, visitorId: null, number, staff: true }), settingsTimeoutMs() * 4);
    return { receipt, signedIn: own.signedIn };
  } catch (e) {
    console.warn(`shop: the staff invoice is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return own;
  }
}

/** PR 137 (Blueprint C6.5) — the signed-in customer's own details for his checkout's boxes (null: signed out, switched off, slow). */
export async function currentPrefill(c: Pick<ShopContext, 'storeId'>): Promise<CheckoutPrefill | null> {
  const deps = accountDeps();
  if (!deps) return null;
  try {
    const me = await signedIn();
    if (!me) return null;
    return await withTimeout(checkoutPrefill(deps, { storeId: c.storeId, customerId: me.customer.id }), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: the checkout's details are unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** PR 126 — the visitor's own order for the thank-you page (null: not his order, no such order, no database). */
export async function currentReceipt(c: Pick<ShopContext, 'storeId'>, number: string): Promise<Receipt | null> {
  const deps = checkoutDeps();
  const visitor = await visitorId();
  if (!deps || !visitor) return null;
  try {
    return await withTimeout(orderReceipt(deps, { storeId: c.storeId, visitorId: visitor, number }), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: the order is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
