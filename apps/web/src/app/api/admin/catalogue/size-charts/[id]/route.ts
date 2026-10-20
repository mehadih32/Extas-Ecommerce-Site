// PR 27, 28 — one size chart with its products and missing sizes; change or archive it.
import { adminDeps } from '@/lib/admin-auth';
import { sizeChartHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return sizeChartHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return sizeChartHandler(request, adminDeps(), (await ctx.params).id);
}
