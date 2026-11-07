// PR 125 — public: places the order the customer confirmed (idempotent on the page's order key).
// Follow-up 219: a test server's gift trial places the gift the page showed (lib/shop/try-gift.ts).
// PR 415: a failure here (5xx or a throw) is recorded as a customer problem on the checkout step (lib/problems/server.ts).
import { watchShop } from '@/lib/problems/server';
import { checkoutApiDeps } from '@/lib/shop/checkout';
import { withGiftTrial } from '@/lib/shop/try-gift';
import { placeHandler } from '@/lib/shop/checkout-api';

export const dynamic = 'force-dynamic';

export const POST = watchShop('checkout', '/api/checkout/orders', (request: Request) => placeHandler(request, withGiftTrial(request, checkoutApiDeps())));
