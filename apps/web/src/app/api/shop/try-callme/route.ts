// CN-020 (3) · SIM-F-046 — test servers only (EXTAS_SHOP_TEST_PAGES=1): the sample bag, and this browser's checkout
// offers the "Call me" card after one refused Confirm (lib/shop/try-callme.ts).
import { tryCallMeHandler } from '@/lib/shop/try-callme';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryCallMeHandler(request);
}
