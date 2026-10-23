// PR 61 — the price block (Blueprint D3.5 "Option B", demo 30-product.js pdp_headPrice / pdp_priceSide): the price, a
// thick bar, then one of three things on the same line — the saving of a discounted product (struck price, −20%,
// "Save 240"), "Free home delivery" for a product that has it, or the payment line. A struck price only ever comes
// from the honesty rule of PR 38; the payment line says only what is switched on (CN-017: never a method the shop
// does not take). Pure.
import type { PdpPriceSettings } from '@extas/settings';

/** The discount in whole per cent, or 0 (no honest struck price, or not lower). */
export function discountPct(nowMinor: number, wasMinor: number | null): number {
  if (!wasMinor || wasMinor <= nowMinor || nowMinor < 0) return 0;
  return Math.round((1 - nowMinor / wasMinor) * 100);
}

export type PriceSide = 'discount' | 'free' | 'pay' | null;

/**
 * What follows the bar: the saving (a discount, when the owner keeps it after the bar), else free delivery, else the
 * payment line when it has something true to say.
 */
export function priceSide(o: { discounted: boolean; freeDelivery: boolean; payWords: readonly string[] }, set: PdpPriceSettings): PriceSide {
  if (o.discounted && set.discountAfterBar) return 'discount';
  if (o.freeDelivery) return 'free';
  return set.payLine.on && o.payWords.length ? 'pay' : null;
}

/**
 * The payment line's pieces: the owner's own words split on `|` (R15 · 2.6: "COD | bKash | Nagad" draws as three
 * pieces), else the methods switched on — today only Cash on Delivery has a switch (`payment.cod.enabled`).
 */
export function payWords(ownText: string | null | undefined, cod: boolean, codWord: string): string[] {
  const own = (ownText ?? '')
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
  if (own.length) return own;
  return cod ? [codWord] : [];
}
