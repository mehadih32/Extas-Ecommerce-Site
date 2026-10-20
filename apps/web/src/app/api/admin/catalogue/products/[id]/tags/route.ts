// PR 32 — a product's tags; set them.
import { adminDeps } from '@/lib/admin-auth';
import { productTagsHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productTagsHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productTagsHandler(request, adminDeps(), (await ctx.params).id);
}
