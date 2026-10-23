// PR 105–114 — the bag on the server side of the shop: the engines' dependencies, the bag's settings, and the visitor's
// bag read from its cookie for a page. Without a database (CI, `next build`) or when it is slow, the page draws the
// empty bag with the registry defaults — never a guess.
import { cookies } from 'next/headers';
import { bagView, emptyBag, findBag, type BagView, type CartDeps } from '@extas/cart';
import { getPrisma } from '@extas/db/client';
import { registry, type Key, type Value } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { BAG_COOKIE } from './bag-model';
import type { ShopContext } from './context';

/** What the bag engines need: the database and the settings, or null without a database. */
export function cartDeps(): CartDeps | null {
  const resolver = settingsResolver();
  if (!resolver) return null;
  return { db: getPrisma(), settings: resolver };
}

const KEYS = [
  'bag.keepDays',
  'bag.addBehaviour',
  'bag.panel.style',
  'bag.panel.maxLines',
  'bag.panel.fill',
  'bag.panel.picks',
  'bag.panel.gapPx',
  'bag.saved.enabled',
  'bag.undoMs',
  'bag.lowStockAt',
  'bag.trust.securePayment',
  'bag.whatsappHelp',
  'bag.tiers.phonePreview',
  'bag.code.enabled',
  'bag.freeProgress.enabled',
  'bag.upsell.enabled',
  'bag.upsell.count',
  'bag.upsell.style',
  'bag.upsell.reasons',
  'bag.upsell.originalLine',
  // PR 71 (follow-up 43): what the line's heart button does — "Move to wishlist" or "Save for later"
  'wish.list',
  // PR 605: "Send as a gift" under Checkout while gift mode is on
  'checkout.gift',
] as const satisfies readonly Key[];

type BagKey = (typeof KEYS)[number];
export type BagSettings = { [K in BagKey]: Value<K> };

export const defaultBagSettings = (): BagSettings => Object.fromEntries(KEYS.map((k) => [k, registry[k].default])) as BagSettings;

/** The bag's settings for a store (the registry defaults when the database is absent or slow). */
export async function bagSettings(storeId: number): Promise<BagSettings> {
  const r = settingsResolver();
  if (!r) return defaultBagSettings();
  try {
    const vals = await withTimeout(Promise.all(KEYS.map((k) => r.value(k, { storeId }))), settingsTimeoutMs());
    return Object.fromEntries(KEYS.map((k, i) => [k, vals[i]])) as BagSettings;
  } catch {
    return defaultBagSettings();
  }
}

/** The visitor id in the bag cookie (as sent; the engine checks its shape). */
export async function visitorId(): Promise<string | null> {
  return (await cookies()).get(BAG_COOKIE)?.value ?? null;
}

/** The visitor's bag, read and priced; the empty bag when there is none or the database does not answer in time. */
export async function currentBag(c: Pick<ShopContext, 'storeId' | 'lang'>): Promise<BagView> {
  const deps = cartDeps();
  const visitor = await visitorId();
  if (!deps || !visitor) return emptyBag();
  try {
    return await withTimeout(
      (async () => {
        const cartId = await findBag(deps, { storeId: c.storeId, visitorId: visitor });
        return cartId ? bagView(deps, { storeId: c.storeId, cartId, lang: c.lang }) : emptyBag();
      })(),
      settingsTimeoutMs() * 4,
    );
  } catch (e) {
    console.warn(`shop: the bag is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return emptyBag();
  }
}
