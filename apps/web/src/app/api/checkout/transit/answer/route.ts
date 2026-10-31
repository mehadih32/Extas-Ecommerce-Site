// S06 · PR 556 — public: what the customer chose on the in-transit duplicate notice (take it out, or keep it).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { transitAnswerHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return transitAnswerHandler(request, checkoutApiDeps());
}
