// CN-029 Phase 3 qa-gate I3 (PR 610) — test servers only (EXTAS_SHOP_TEST_PAGES=1): the sample bag, and this browser
// sees the bag and the checkout with their "not taking new orders" line (lib/shop/try-pause.ts).
import { tryPauseHandler } from '@/lib/shop/try-pause';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryPauseHandler(request);
}
