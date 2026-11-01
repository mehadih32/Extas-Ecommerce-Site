// S16 · PR 348 — the profit of one order for the order page (Orders → one order → "Profit on this order"), from
// @extas/metrics `orderProfits` with the owner's own figures: the gateway fees and packaging (`costs.gatewayFees`,
// `costs.packaging`, empty as shipped, so those parts read "not known yet"), and the ad-spend share (`costs.allocation`).
// The page shows it only to people who may see the books (`books.read`). Read-only: nothing charges or changes a price.
import type { PrismaClient } from '@extas/db/client';
import { orderProfits, type OrderProfit } from '@extas/metrics';
import { gatewayFeeMinor } from '@extas/settings';
import type { AppResolver } from './settings';

export const PROFIT_PERMISSION = 'books.read';

/** One order's profit in its store, or null when the order is not that store's. */
export async function loadOrderProfit(deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, orderId: string): Promise<OrderProfit | null> {
  const at = { storeId };
  const [currency, timeZone, fees, packaging, allocation] = await Promise.all([
    deps.resolver.value('store.currency', at),
    deps.resolver.value('store.timeZone', at),
    deps.resolver.value('costs.gatewayFees', at),
    deps.resolver.value('costs.packaging', at),
    deps.resolver.value('costs.allocation', at),
  ]);
  const m = await orderProfits(deps.db, storeId, [orderId], {
    currency,
    timeZone,
    packagingMinor: packaging?.perOrderMinor ?? null,
    gatewayFee: (amount, provider) => gatewayFeeMinor(amount, provider, fees),
    ads: { allocate: allocation.adSpend, basis: allocation.adBasis },
  });
  return m.get(orderId) ?? null;
}
