// PR 26, 29 — the product's publish checklist and health score, checked now.
import { adminDeps } from '@/lib/admin-auth';
import { productReadinessHandler } from '@/lib/catalogue-publish-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productReadinessHandler(request, adminDeps(), (await ctx.params).id);
}
