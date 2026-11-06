// S12 · PR 250 — public: a live article was opened (counted once a day per browser while `blog.performance.count` is on).
import { readHandler } from '@/lib/journal/performance';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  const d = bagApiDeps();
  return readHandler(request, d ? { db: d.cart.db, settings: d.cart.settings, storeId: d.storeId } : null);
}
