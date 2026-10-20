// PR 590 — the product's names, link and titles, and where each comes from; save them.
import { adminDeps } from '@/lib/admin-auth';
import { productNamingHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productNamingHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productNamingHandler(request, adminDeps(), (await ctx.params).id);
}
