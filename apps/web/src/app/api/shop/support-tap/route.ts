// S22 · PR 624 — a tap on the shop's Messenger, WhatsApp or call button (lib/shop/support-taps.ts). Public, same-site
// only, size-capped and counted per address by the proxy; always 204.
import { shopStoreId } from '@/lib/shop/store-id';
import { supportTapHandler } from '@/lib/shop/support-taps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return supportTapHandler(request, shopStoreId());
}
