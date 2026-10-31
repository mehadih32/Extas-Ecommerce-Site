// CN-020 (4) · SIM-F-047 — public: one recording from the checkout's address mic, its words back (off as shipped).
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { voiceHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return voiceHandler(request, checkoutApiDeps());
}
