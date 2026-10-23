// PR 107 — test servers only (EXTAS_SHOP_TEST_PAGES=1): fill this browser's bag with sample items for the gates.
import { tryFillHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryFillHandler(request, bagApiDeps());
}
