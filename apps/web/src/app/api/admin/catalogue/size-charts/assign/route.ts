// PR 28 — a chart as a category's default (per fit) or as one product's own chart.
import { adminDeps } from '@/lib/admin-auth';
import { sizeChartAssignHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return sizeChartAssignHandler(request, adminDeps());
}
