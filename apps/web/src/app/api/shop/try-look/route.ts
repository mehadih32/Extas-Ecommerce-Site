// PR 128 — test servers only (EXTAS_SHOP_TEST_PAGES=1): this browser sees a sample thank-you page with "Complete your
// look" (lib/shop/try-look.ts).
import { tryLookHandler } from '@/lib/shop/try-look';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryLookHandler(request);
}
