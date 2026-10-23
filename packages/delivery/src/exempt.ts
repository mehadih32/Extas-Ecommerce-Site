// PR 565 (S04) — free delivery is exempt from the band machinery (Blueprint register 565, D3.12 V2 block: "free delivery
// hides all band machinery"). Built in, not bolted on: every place that shows, corrects or messages about a band asks
// this one question first. An order stores how its delivery was priced (`Order.addressResolution`, written by
// @extas/checkout placeOrder); a free one carries `bandExempt: true` and its charge state `free`.
// - Shows: the checkout's delivery step, the autocomplete rows and the thank-you page draw no band and no charge.
// - Corrects: a later band or zone fix (S05/S06) never changes a free order's charge — it was free, it stays free.
// - Messages: no "your area is in another band" message (S10) is ever sent for a free order.

/** True when the order's stored delivery was free: no band question, correction or message applies to it. */
export function bandExempt(addressResolution: unknown): boolean {
  if (!addressResolution || typeof addressResolution !== 'object') return false;
  const r = addressResolution as { bandExempt?: unknown; charge?: { state?: unknown } | null };
  return r.bandExempt === true || r.charge?.state === 'free';
}
