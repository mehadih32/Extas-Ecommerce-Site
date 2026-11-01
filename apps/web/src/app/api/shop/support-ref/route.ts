// S22 · PR 429 — a product link from a support chat opened in the shop (lib/shop/support-ref.ts). Public, same-site
// only, size-capped and counted per address by the proxy; always 204.
import { shopStoreId } from '@/lib/shop/store-id';
import { supportRefHandler } from '@/lib/shop/support-ref';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return supportRefHandler(request, shopStoreId());
}
