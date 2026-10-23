// PR 125 (SIM-F-026) — public: keeps what the customer typed for the team's follow-up, when the owner's switch is on.
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { draftHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return draftHandler(request, checkoutApiDeps());
}
