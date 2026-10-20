// PR 27 — which chart a product (or a new product in a category with a fit) gets.
import { adminDeps } from '@/lib/admin-auth';
import { sizeChartResolveHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return sizeChartResolveHandler(request, adminDeps());
}
