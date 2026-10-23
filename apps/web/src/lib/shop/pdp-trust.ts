// PR 62 — the promise row under the buttons (Blueprint D3.5, demo 30-product.js pdp_trust): the exchange window, free
// delivery over the owner's limit and "100% original", in the owner's order. Each reads live from Smart Rules (S10):
// the exchange window from the live exchange rule (and only when it covers this product), the free-delivery limit
// from the live free-delivery rule, the same one the bag uses (PR 113). With no live exchange rule the owner's policy
// settings stand in (`policy.exchange.*`); with no live free-delivery rule nothing is promised. "100% original" shows
// only once the owner switches it on (CN-009). Pure.
import type { PdpTrustSettings } from '@extas/settings';

export type TrustId = PdpTrustSettings['items'][number]['id'];

export interface TrustFacts {
  /** The exchange window in hours; null = no exchange for this product. */
  exchangeHours: number | null;
  /** The free-delivery limit; null = no live rule backs one. */
  freeOverMinor: number | null;
}

/** What the live rules say, with the owner's policy settings standing in for a missing exchange rule. */
export function trustFacts(
  live: { exchange: { covered: boolean; windowHours: number | null } | null; freeOverMinor: number | null },
  policy: { exchangeOn: boolean; windowHours: number },
): TrustFacts {
  const ex = live.exchange;
  const exchangeHours = ex ? (ex.covered && ex.windowHours && ex.windowHours > 0 ? ex.windowHours : null) : policy.exchangeOn && policy.windowHours > 0 ? policy.windowHours : null;
  const freeOverMinor = live.freeOverMinor && live.freeOverMinor > 0 ? live.freeOverMinor : null;
  return { exchangeHours, freeOverMinor };
}

/** The promises to draw, in order. */
export function trustItems(set: PdpTrustSettings, flags: { exchange: boolean; freeDelivery: boolean }): TrustId[] {
  if (!set.on) return [];
  const holds: Record<TrustId, boolean> = { exchange: flags.exchange, freeDelivery: flags.freeDelivery, original: true };
  return set.items.filter((i) => i.on && holds[i.id]).map((i) => i.id);
}
