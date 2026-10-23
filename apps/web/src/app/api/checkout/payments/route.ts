// PR 125 — public: the mock payment page's answer for the visitor's own order (approve, fail, try again).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { paymentHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return paymentHandler(request, checkoutApiDeps());
}
