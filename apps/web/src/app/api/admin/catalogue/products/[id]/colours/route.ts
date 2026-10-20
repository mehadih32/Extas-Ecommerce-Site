// PR 19, 30 — the product's colours in order, with notes and true-colour photos.
import { adminDeps } from '@/lib/admin-auth';
import { productColoursHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productColoursHandler(request, adminDeps(), (await ctx.params).id);
}
