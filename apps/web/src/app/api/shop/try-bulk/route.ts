// PR 606 — test servers only (EXTAS_SHOP_TEST_PAGES=1): the sample bag, and this browser sees the bulk / corporate lane
// (lib/shop/try-bulk.ts).
import { tryBulkHandler } from '@/lib/shop/try-bulk';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryBulkHandler(request);
}
