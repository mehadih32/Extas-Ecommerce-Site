// PR 85 follow-up (111) — test servers only (EXTAS_SHOP_TEST_PAGES=1): this browser draws the shop with a long sample
// slogan (lib/shop/try-slogan.ts), so the device gate measures the header and footer with one.
import { trySloganHandler } from '@/lib/shop/try-slogan';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return trySloganHandler(request);
}
