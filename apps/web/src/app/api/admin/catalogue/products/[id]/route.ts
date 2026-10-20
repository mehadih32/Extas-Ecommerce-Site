// PR 19 — one product with its colours and variants; change or archive it.
import { adminDeps } from '@/lib/admin-auth';
import { productHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productHandler(request, adminDeps(), (await ctx.params).id);
}
