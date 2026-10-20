// PR 28 — a product back to auto, or a category no longer defaulting to a chart (the link only).
import { adminDeps } from '@/lib/admin-auth';
import { sizeChartUnassignHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return sizeChartUnassignHandler(request, adminDeps());
}
