// PR 96 — the set summary, pure: which product page a combo uses, which bag look, and the one set price the page,
// the button and the bag all show (Blueprint D8.1, D8.4). Browser and server both use it, so the words and the price
// never disagree ("words and price are one decision").
//
// The struck "was" price is never invented (CN-009, ROUND15 Note 52): it is the sum of the pieces' own separate
// prices, shown only when the owner has switched struck prices on (`rules.discount.showWasPrice`), the set is on sale
// and that sum is above the set price — S10's `setWasPrice` decides it, the same guard every rule's offer uses.
import { setWasPrice, type DiscountWasReason } from '@extas/rules/pure';
import { eachMinor, type SetPricing } from './model';

export type PageTemplate = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
const PAGE = /^P[1-5]$/;

export interface PageTemplateInput {
  /** The combo's own choice (null = not set). */
  combo: string | null;
  /** Its auto rule's choice (null = not set, or a fixed combo). */
  rule: string | null;
  /** The shop's default (`combos.template.page`, "auto" by default). */
  shop: string;
  /** The set mixes products (a top + bottom, a mixed set). */
  mixed: boolean;
  /** Pairs the combo's rule makes now (0 for a fixed combo). */
  pairs: number;
  /** `combos.template.longListPairs`: more pairs than this is "a very long list". */
  longListPairs: number;
}

/**
 * The combo product page (D8.4, the demo's ca_pageTpl): the combo's own choice, else its rule's, else the shop's.
 * "auto" is the R15 ranking winner: P3 for a top + bottom or mixed set, P1 for a same-product pack, P2 (pick your
 * colours) when its rule makes a very long list of pairs. Anything unknown falls back to P1.
 */
export function pageTemplateFor(i: PageTemplateInput): PageTemplate {
  const t = i.combo || i.rule || i.shop || 'auto';
  if (t === 'auto') return i.mixed ? 'P3' : i.pairs > i.longListPairs ? 'P2' : 'P1';
  return PAGE.test(t) ? (t as PageTemplate) : 'P1';
}

/** The bag look (D8.4): the combo's, else its rule's, else the shop's (`combos.template.bag`, B5 by default). */
export const bagTemplateFor = (i: { combo: string | null; rule: string | null; shop: string }): string => i.combo || i.rule || i.shop;

/** The list card look (D8.4): the combo's, else its rule's, else the shop's (`combos.template.list`). */
export const listTemplateFor = (i: { combo: string | null; rule: string | null; shop: string }): string => i.combo || i.rule || i.shop;

export interface SetPrice extends SetPricing {
  /** The struck price beside the set price (the separate prices' sum), or null — never made up. */
  wasMinor: number | null;
  wasReason: DiscountWasReason;
  /** "৳X each" (display only), null while the set has no price. */
  eachMinor: number | null;
  pieces: number;
}

/** The one set price the page, the button and the bag show (`separateMinor`: the catalogue's comboWasFor sum, when the caller has it). */
export function setPrice(pricing: SetPricing, pieces: number, was: { allowed: boolean | null; live: boolean; separateMinor?: number | null }): SetPrice {
  const w =
    pricing.payMinor === null
      ? { wasMinor: null, reason: 'NO_PRICE' as const }
      : setWasPrice({ allowed: was.allowed, live: was.live, separateMinor: was.separateMinor === undefined ? pricing.regularMinor : was.separateMinor, setMinor: pricing.payMinor });
  return { ...pricing, wasMinor: w.wasMinor, wasReason: w.reason, eachMinor: pricing.payMinor === null ? null : eachMinor(pricing.payMinor, pieces), pieces };
}
