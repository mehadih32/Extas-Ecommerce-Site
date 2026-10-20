// PR 32 — the products of a manual or seasonal collection, in order.
import { adminDeps } from '@/lib/admin-auth';
import { collectionProductsHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return collectionProductsHandler(request, adminDeps(), (await ctx.params).id);
}
