// S13 · PR 257 — the shop's tracking beacon: a product page seen or the checkout opened (lib/tracking/shop.ts). Public,
// same-site only, size-capped and counted per address by the proxy; the server reads the product or the bag itself.
import { shopStoreId } from '@/lib/shop/store-id';
import { trackHandler } from '@/lib/tracking/shop';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return trackHandler(request, shopStoreId());
}
