// PR 72 follow-up (104) — test servers only (EXTAS_SHOP_TEST_PAGES=1): this browser sees the delivery help page and
// search's delivery answer as if the sample store's delivery rule were live (lib/shop/try-delivery.ts).
import { tryDeliveryHandler } from '@/lib/shop/try-delivery';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryDeliveryHandler(request);
}
