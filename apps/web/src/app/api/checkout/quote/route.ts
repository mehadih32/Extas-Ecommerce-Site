// PR 117 — public: the checkout priced again for what the customer chose so far (the finished address line, …).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { withGiftTrial } from '@/lib/shop/try-gift';
import { quoteHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  // follow-up 219: a test server's gift trial prices the gift the page shows (lib/shop/try-gift.ts)
  return quoteHandler(request, withGiftTrial(request, checkoutApiDeps()));
}
