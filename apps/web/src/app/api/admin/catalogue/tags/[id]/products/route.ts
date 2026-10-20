// PR 32 — put a tag on many products, or take it off them.
import { adminDeps } from '@/lib/admin-auth';
import { tagProductsHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return tagProductsHandler(request, adminDeps(), (await ctx.params).id);
}
