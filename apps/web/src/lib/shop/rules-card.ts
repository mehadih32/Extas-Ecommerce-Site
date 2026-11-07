// PR 91 follow-up 172 — what the set page's rules card says about delivery and paying (demo V12.2 cb_rules), read from
// the same places the checkout reads, so the card can never promise what the checkout would not do:
// - delivery: "Free home delivery" once the set's price reaches the live free-delivery limit (the Smart Rules engine,
//   as the bag sees it; the old `delivery.freeOverMinor` number only when no live rule answers), else the store's
//   city and outside bands with the owner's charges ("Dhaka City ৳70 · Outside Dhaka ৳130"), else "shown at checkout";
// - paying: Cash on Delivery while the checkout offers it, then the wallets and the card the checkout offers now
//   (`shopPayOffer`, the checkout's own paySettings), "Cash on Delivery · Pay when it arrives · bKash · Nagad · Card".
// Display only: nothing here sets a charge, a limit or a payment method (CLAUDE.md rule 6).
import { cache } from 'react';
import { getPrisma } from '@extas/db/client';
import { loadBandMap } from '@extas/delivery';
import { ratesOf } from '@extas/checkout';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import type { PayOffer } from './help-pages';

/** One band as the card names it. */
export interface CardRate {
  id: string;
  nameEn: string;
  nameBn: string | null;
  chargeMinor: number;
}

export type CardDelivery = { kind: 'free'; overMinor: number } | { kind: 'rates'; rates: CardRate[] } | { kind: 'checkout' };

export interface CardPay {
  /** Cash on Delivery is on the checkout now. */
  cod: boolean;
  /** The prepaid ways, as message keys (`checkout.pm.*` for a wallet, `combo.rules.card` for card or online). */
  others: string[];
}

/** The delivery line: free over the live limit, the priced bands, or "at checkout". */
export function cardDelivery(input: { freeOn: boolean; liveOverMinor: number | null; settingOverMinor: unknown; payMinor: number | null; rates: readonly { id: string; nameEn: string; nameBn: string | null; priced: boolean; chargeMinor: number | null }[] | null }): CardDelivery {
  const over = input.liveOverMinor ?? (typeof input.settingOverMinor === 'number' ? input.settingOverMinor : null);
  if (input.freeOn && over !== null && input.payMinor !== null && input.payMinor >= over) return { kind: 'free', overMinor: over };
  const rates = (input.rates ?? []).filter((b) => b.priced && typeof b.chargeMinor === 'number').map((b) => ({ id: b.id, nameEn: b.nameEn, nameBn: b.nameBn, chargeMinor: b.chargeMinor as number }));
  return rates.length ? { kind: 'rates', rates } : { kind: 'checkout' };
}

/** The paying line, or null when nothing is offered. Without a reading of the checkout (null), only the COD switch counts. */
export function cardPay(offer: PayOffer | null, codFlag: boolean): CardPay | null {
  if (!offer) return codFlag ? { cod: true, others: [] } : null;
  const others = [...offer.mobile.map((id) => `checkout.pm.${id}`), ...(offer.card.length || offer.online ? ['combo.rules.card'] : [])];
  const cod = offer.cod && codFlag;
  return cod || others.length ? { cod, others } : null;
}

/** The store's priced city and outside bands (the checkout's rates line); null without a database or when slow. */
export const shopRates = cache(async (storeId: number) => {
  const resolver = settingsResolver();
  if (!resolver) return null;
  try {
    return await withTimeout(
      (async () => ratesOf(await loadBandMap({ db: getPrisma(), settings: resolver }, storeId)))(),
      settingsTimeoutMs(),
    );
  } catch {
    return null;
  }
});
