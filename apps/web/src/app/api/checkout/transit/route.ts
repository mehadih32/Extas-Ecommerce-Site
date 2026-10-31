// S06 · PR 556 — public: the phone check of the in-transit duplicate notice (off until the owner turns it on).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { transitHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return transitHandler(request, checkoutApiDeps());
}
