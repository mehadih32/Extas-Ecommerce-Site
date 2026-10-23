// PR 125 — public: places the order the customer confirmed (idempotent on the page's order key).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { placeHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return placeHandler(request, checkoutApiDeps());
}
