// PR 115–126 — the checkout on the server side of the shop: the engines' dependencies, the checkout's settings, the
// visitor's quote read from the bag cookie, and the words the checkout's client part shows. Without a database (CI,
// `next build`) or when it is slow, the page draws the empty bag with the registry defaults — never a guess.
import { checkoutPaused, checkoutQuote, emptyQuote, orderReceipt, payView, receiptEta, receiptPromise, type CheckoutDeps, type CheckoutQuote, type PayView, type Receipt } from '@extas/checkout';
import { findBag } from '@extas/cart';
import { checkoutPrefill, type CheckoutPrefill } from '@extas/accounts';
import { getPrisma } from '@extas/db/client';
import { checkoutFlag } from '@extas/orders';
import { registry, type Key, type Value } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { accountDeps, customerOfRequest, signedIn } from './account';
import { visitorId } from './bag';
import type { CheckoutApiDeps } from './checkout-api';
import { shopStoreId, type ShopContext } from './context';
import { SHOP_DICTS, keysOf } from './dict';
import { giftTrialSettings, tryGiftOn } from './try-gift';
import { tryPauseOn } from './try-pause';
import { tryCallMeOn } from './try-callme';
import { callbackBaseUrl, paymentModeOf, shopPaymentsDeps } from '../payments-gateway';

/** What the checkout engines need: the database and the settings, or null without a database. */
export function checkoutDeps(): CheckoutDeps | null {
  const resolver = settingsResolver();
  if (!resolver) return null;
  const db = getPrisma();
  return {
    db,
    settings: resolver,
    // follow-up 50: the payment page's go-live guard asks which gateway a provider runs on now
    paymentMode: paymentModeOf,
    // PR 560: the owner's Parameter for Checkout looks at a finished checkout (nobody flagged while it is off)
    advanceFlag: (input) => checkoutFlag({ db, settings: resolver }, input),
    // PR 560: an advance paid on the shop's own payment page puts the order back in the queue (the order service)
    advancePaid: async (storeId, orderId) => {
      const p = await shopPaymentsDeps();
      await p?.orders?.advancePaid?.(storeId, orderId, { actorId: null, source: 'checkout' });
    },
  };
}

/** The checkout API's dependencies: the engines and the store the shop serves. */
export function checkoutApiDeps(): CheckoutApiDeps | null {
  const checkout = checkoutDeps();
  if (!checkout) return null;
  const storeId = shopStoreId();
  const accounts = accountDeps();
  return {
    checkout,
    storeId,
    customerOf: async (request) => (await customerOfRequest(request, accounts, storeId))?.customer.id ?? null,
    // PR 170: "Pay" opens the gateway's page (the practice gateway until the keys are in)
    payments: shopPaymentsDeps,
    callbackBase: callbackBaseUrl,
  };
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
  // PR 605: gift mode
  'checkout.gift',
  // PR 159: the "Share my location" button and how long the point is kept
  'risk.capture',
  // CN-020 (3), SIM-F-046: "Call me" after refused tries or a long pause
  'checkout.callMe',
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
    const s = Object.fromEntries(KEYS.map((k, i) => [k, vals[i]])) as CheckoutSettings;
    // SIM-F-046: a test server's "Call me" trial (the cookie of /api/shop/try-callme) offers the card after one refusal
    if (await tryCallMeOn()) s['checkout.callMe'] = { ...s['checkout.callMe'], enabled: true, failedTries: 1 };
    return s;
  } catch {
    return defaultCheckoutSettings();
  }
}

/** The visitor's checkout, read and priced; the empty one when there is no bag or the database does not answer in time. */
export async function currentCheckout(c: Pick<ShopContext, 'storeId' | 'lang'>, opts: { gift?: boolean } = {}): Promise<CheckoutQuote> {
  const plain = checkoutDeps();
  const visitor = await visitorId();
  if (!plain || !visitor) return emptyQuote();
  // PR 605: a test server's gift trial (the cookie of /api/shop/try-gift) prices the gift as if gift mode were on
  const deps = opts.gift && (await tryGiftOn()) ? { ...plain, settings: giftTrialSettings(plain.settings) } : plain;
  try {
    const me = await signedIn();
    return await withTimeout(
      (async () => {
        const cartId = await findBag(deps, { storeId: c.storeId, visitorId: visitor });
        return checkoutQuote(deps, { storeId: c.storeId, cartId, lang: c.lang, customerId: me?.customer.id ?? null, gift: opts.gift === true });
      })(),
      settingsTimeoutMs() * 4,
    );
  } catch (e) {
    console.warn(`shop: the checkout is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return emptyQuote();
  }
}

/** Every `checkout.*` word in the page's language (the owner's words win), slots like {store} filled; for the client. */
/**
 * CN-029 Phase 3 qa-gate I3 (PR 610): is checkout paused for the store now — the very rule Confirm is refused with
 * (the ERP holds a v6 store's account and `erp.hold.pauseCheckout` is on)? The bag and the checkout show their calm
 * line from the first paint. False without a database or when it is slow (Confirm still decides). A test server's
 * pause trial (POST /api/shop/try-pause) draws the line for the browser that asked.
 */
export async function checkoutPausedNow(storeId: number): Promise<boolean> {
  if (await tryPauseOn()) return true;
  const deps = checkoutDeps();
  if (!deps) return false;
  try {
    return await withTimeout(checkoutPaused(deps, storeId), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: the checkout pause is unknown (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return false;
  }
}

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

/**
 * PR 193 — what the thank-you page says about when the order comes, as the checkout said it when he placed it ("ships
 * from …" placed during the holiday, "may arrive after Eid" past its place's date). Empty: the usual hours promise. Read
 * only after `currentReceipt` showed the order is his; nothing (the usual promise) when the database is slow or away.
 */
export async function currentEta(c: Pick<ShopContext, 'storeId' | 'lang'>, number: string): Promise<string[]> {
  const deps = checkoutDeps();
  if (!deps) return [];
  try {
    return await withTimeout(receiptEta(deps, c.storeId, number, c.lang), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: the delivery line is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return [];
  }
}

/** Review R3 (customer M3): the promise the order page counts "late" against (null: none, or the database is away). */
export async function currentPromise(c: Pick<ShopContext, 'storeId'>, number: string): Promise<{ from: string; hoursMax: number | null; afterEid: boolean } | null> {
  const deps = checkoutDeps();
  if (!deps) return null;
  try {
    return await withTimeout(receiptPromise(deps, c.storeId, number), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: the delivery promise is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
