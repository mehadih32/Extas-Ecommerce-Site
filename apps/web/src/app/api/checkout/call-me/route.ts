// CN-020 (3) · SIM-F-046 — public: "Call me" from the checkout puts a call-back in the Support inbox (off as shipped).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { callMeHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return callMeHandler(request, checkoutApiDeps());
}
