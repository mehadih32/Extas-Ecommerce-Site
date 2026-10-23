// PR 71 — test servers only (EXTAS_SHOP_TEST_PAGES=1): sample hearts on this browser's wishlist for the gates.
import { wishApiDeps } from '@/lib/shop/wish-deps';
import { wishTryHandler } from '@/lib/shop/wishlist';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return wishTryHandler(request, wishApiDeps());
}
