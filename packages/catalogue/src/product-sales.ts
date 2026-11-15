// PR 831 (admin prototype v5, Products › one product): the "Sales · 30 days" card — pieces sold, what they brought in,
// how many times the page was opened and the shop's own rating — read only, one product, one store. A sale is a piece on an
// order that is placed and not cancelled, returned or a draft (the same rule as the shop ranking). Needs `catalogue.read`.
import { allow, found, type CatalogueDeps, type Who } from './context';
import { SOLD_STATUS } from './ranking';

const DAY_MS = 86_400_000;

export interface ProductSales30 {
  days: number;
  sold: number;
  revenueMinor: number;
  views: number;
  /** Rounded to one decimal; null with no approved review. */
  rating: number | null;
  reviews: number;
}

export async function productSales30(deps: CatalogueDeps, who: Who, productId: string): Promise<ProductSales30> {
  await allow(deps, who, 'catalogue.read');
  found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true } }), 'product');
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [sold, views, rated] = await Promise.all([
    deps.db.orderItem.aggregate({
      where: { storeId: who.storeId, productId, status: 'ACTIVE', order: { status: { in: [...SOLD_STATUS] }, placedAt: { gte: since } } },
      _sum: { quantity: true, lineTotalMinor: true },
    }),
    deps.db.analyticsEvent.count({ where: { storeId: who.storeId, name: 'product_view', productId, occurredAt: { gte: since } } }),
    deps.db.review.aggregate({ where: { storeId: who.storeId, productId, status: 'APPROVED' }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  return {
    days: 30,
    sold: sold._sum.quantity ?? 0,
    revenueMinor: sold._sum.lineTotalMinor ?? 0,
    views,
    rating: rated._avg.rating == null ? null : Math.round(rated._avg.rating * 10) / 10,
    reviews: rated._count._all,
  };
}

/**
 * PR 831 (prototype v5, Products › Size charts): exchanges opened in the last 30 days because the size was wrong (the
 * exchange reason "size"), for the fourth figure above the charts. Read only; needs `catalogue.read`.
 */
export async function wrongSizeExchanges30(deps: CatalogueDeps, who: Who): Promise<number> {
  await allow(deps, who, 'catalogue.read');
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.exchange.count({ where: { storeId: who.storeId, reason: 'size', createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } } });
}
