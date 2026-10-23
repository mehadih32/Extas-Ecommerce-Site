// PR 117 — public: the checkout priced again for what the customer chose so far (the finished address line, …).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { quoteHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return quoteHandler(request, checkoutApiDeps());
}
