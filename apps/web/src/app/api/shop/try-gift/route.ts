// PR 605 — test servers only (EXTAS_SHOP_TEST_PAGES=1): the sample bag, and this browser sees the gift checkout
// (lib/shop/try-gift.ts).
import { tryGiftHandler } from '@/lib/shop/try-gift';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryGiftHandler(request);
}
