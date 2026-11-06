// S12 · PR 592 follow-up — public: the house ad places a page view saw (POST {p: [place ids]}, sent by HouseAdViews):
// each counted once as a view for its shop day while `blog.houseAds` and its `countViews` are on. Only this shop's own
// pages may send it (a foreign Origin is refused); nothing about the reader is kept. Always answers 204.
import { viewsHandler } from '@/lib/journal/house-ads';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  const d = bagApiDeps();
  return viewsHandler(request, d ? { db: d.cart.db, settings: d.cart.settings, storeId: d.storeId } : null);
}
