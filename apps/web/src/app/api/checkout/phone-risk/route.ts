// S06 · PR 559 — public: the phone-entry risk check (off until the owner turns it on); always answers {ok: true}.
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { phoneRiskHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return phoneRiskHandler(request, checkoutApiDeps());
}
