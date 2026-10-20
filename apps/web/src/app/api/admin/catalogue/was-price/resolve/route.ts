// PR 38 — a product's or combo's struck price, with the reason.
import { adminDeps } from '@/lib/admin-auth';
import { wasPriceResolveHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return wasPriceResolveHandler(request, adminDeps());
}
