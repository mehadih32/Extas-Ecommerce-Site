// S06 · PR 562 — a flagged checkout, kept once per bag for the flag outcome report (Reports › Flag outcomes, @extas/orders
// flagReport). The checkout's quote finds the layer that asks this customer to pay ahead (PR 560); the moment it does,
// the shop keeps one SHOWN flag event for that bag (which layer, what it asked) — so a customer who then leaves the
// checkout is counted as walking away, and one who orders is counted by the ASKED event the order keeps. Only while the
// owner keeps `risk.flagReport` on; never the customer's phone, name or address; never shown to him. A record only: it
// never changes the quote, the money or the payment choice, and a failure is the caller's to log.
import { FLAG_OUTCOMES } from './advance';
import { nowOf, setting, TX, type CheckoutDeps } from './context';
import type { CheckoutQuote } from './quote';

/** Keeps the bag's first flag (true when this call kept it). */
export async function noteFlagShown(deps: CheckoutDeps, r: { storeId: number; customerId: string | null; quote: Pick<CheckoutQuote, 'cartId' | 'flag' | 'advance'> }): Promise<boolean> {
  const { cartId, flag, advance } = r.quote;
  if (!cartId || !flag || !advance) return false;
  if (!(await setting(deps, r.storeId, 'risk.flagReport')).enabled) return false;
  const storeId = r.storeId;
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    // one bag, one row: two quotes at the same moment wait for each other
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`flag-shown:${storeId}:${cartId}`}, 0))`;
    const had = await tx.checkoutFlagEvent.findFirst({ where: { storeId, outcome: FLAG_OUTCOMES.shown, explanation: { path: ['cartId'], equals: cartId } }, select: { id: true } });
    if (had) return false;
    await tx.checkoutFlagEvent.create({
      data: { storeId, layerId: flag.layerId, customerId: r.customerId, requirement: flag.requirement, outcome: FLAG_OUTCOMES.shown, explanation: { cartId, layer: flag.layerName, score: flag.score, band: flag.band, kind: advance.kind, amountMinor: advance.amountMinor }, createdAt: now },
    });
    return true;
  }, TX);
}
