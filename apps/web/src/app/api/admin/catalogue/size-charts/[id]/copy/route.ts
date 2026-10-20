// PR 28 — copy a size chart for another fit, or as one product's own chart.
import { adminDeps } from '@/lib/admin-auth';
import { sizeChartCopyHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return sizeChartCopyHandler(request, adminDeps(), (await ctx.params).id);
}
