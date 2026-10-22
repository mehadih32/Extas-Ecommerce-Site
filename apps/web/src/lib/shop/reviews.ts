// PR 41 — the reviews the home page shows ("What customers say"): approved, published reviews of live products, newest
// first, with the shop-wide average and count beside the heading. The average counts every approved review, whatever
// the row's own star filter, so it is never flattered. Read-only and public; without a database the row is empty and
// stays hidden. A review's name is the one the customer chose to show (`displayName`); nothing else about them is read.
import { getPrisma } from '@extas/db/client';
import { settingsTimeoutMs, withTimeout } from '../settings';

export interface ShopReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  name: string | null;
  verified: boolean;
}

export interface ReviewRow {
  reviews: ShopReview[];
  /** Every approved review of a live product: the average stars and how many. */
  average: number;
  total: number;
}

const EMPTY: ReviewRow = { reviews: [], average: 0, total: 0 };

export async function homeReviews(storeId: number, count: number, minRating: number): Promise<ReviewRow> {
  if (!process.env.DATABASE_URL) return EMPTY;
  const prisma = getPrisma();
  const base = { storeId, status: 'APPROVED' as const, archivedAt: null, publishedAt: { not: null }, body: { not: null } };
  try {
    return await withTimeout(
      (async () => {
        const live = await prisma.product.findMany({ where: { storeId, status: 'PUBLISHED', archivedAt: null }, select: { id: true } });
        // a review of a product that is gone or hidden is not shown; a combo's review (no product) counts too
        const w = { ...base, OR: [{ productId: null }, { productId: { in: live.map((p) => p.id) } }] };
        const [rows, agg] = await Promise.all([
          prisma.review.findMany({
            where: { ...w, rating: { gte: minRating } },
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            take: count,
            select: { id: true, rating: true, title: true, body: true, displayName: true, isVerifiedPurchase: true },
          }),
          prisma.review.aggregate({ where: w, _avg: { rating: true }, _count: { _all: true } }),
        ]);
        return {
          reviews: rows
            .filter((r) => (r.body ?? '').trim().length > 0)
            .map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: (r.body ?? '').trim(), name: r.displayName?.trim() || null, verified: r.isVerifiedPurchase })),
          average: agg._avg.rating ?? 0,
          total: agg._count._all,
        };
      })(),
      settingsTimeoutMs() * 2,
    );
  } catch (e) {
    console.warn(`shop: reviews unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return EMPTY;
  }
}
