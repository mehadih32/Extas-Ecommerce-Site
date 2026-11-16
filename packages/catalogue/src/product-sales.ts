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
  /** PR 968: times the piece was added to the bag, pieces returned (a return record's lines), and pieces sold per day (oldest first, `days` numbers). */
  carts: number;
  returned: number;
  daily: number[];
}

export async function productSales30(deps: CatalogueDeps, who: Who, productId: string): Promise<ProductSales30> {
  await allow(deps, who, 'catalogue.read');
  found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true } }), 'product');
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [sold, views, rated, carts, returned, soldLines] = await Promise.all([
    deps.db.orderItem.aggregate({
      where: { storeId: who.storeId, productId, status: 'ACTIVE', order: { status: { in: [...SOLD_STATUS] }, placedAt: { gte: since } } },
      _sum: { quantity: true, lineTotalMinor: true },
    }),
    deps.db.analyticsEvent.count({ where: { storeId: who.storeId, name: 'product_view', productId, occurredAt: { gte: since } } }),
    deps.db.review.aggregate({ where: { storeId: who.storeId, productId, status: 'APPROVED' }, _avg: { rating: true }, _count: { _all: true } }),
    deps.db.analyticsEvent.count({ where: { storeId: who.storeId, name: 'add_to_bag', productId, occurredAt: { gte: since } } }),
    deps.db.productVariant.findMany({ where: { storeId: who.storeId, productId }, select: { id: true } }).then((vs) => deps.db.returnItem.aggregate({ where: { storeId: who.storeId, createdAt: { gte: since }, variantId: { in: vs.map((v) => v.id) } }, _sum: { quantity: true } })),
    deps.db.orderItem.findMany({
      where: { storeId: who.storeId, productId, status: 'ACTIVE', order: { status: { in: [...SOLD_STATUS] }, placedAt: { gte: since } } },
      select: { quantity: true, order: { select: { placedAt: true } } },
      take: 5000,
    }),
  ]);
  const daily = Array.from({ length: 30 }, () => 0);
  for (const l of soldLines) {
    const at = l.order.placedAt;
    if (!at) continue;
    const i = 29 - Math.floor((now.getTime() - at.getTime()) / DAY_MS);
    if (i >= 0 && i < 30) daily[i] = (daily[i] ?? 0) + l.quantity;
  }
  return {
    days: 30,
    sold: sold._sum.quantity ?? 0,
    revenueMinor: sold._sum.lineTotalMinor ?? 0,
    views,
    rating: rated._avg.rating == null ? null : Math.round(rated._avg.rating * 10) / 10,
    reviews: rated._count._all,
    carts,
    returned: returned._sum.quantity ?? 0,
    daily,
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
