// PR 31 — the product as plain facts (?lang=en|bn) for the page and the AI.
import { adminDeps } from '@/lib/admin-auth';
import { productFactsHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productFactsHandler(request, adminDeps(), (await ctx.params).id);
}
