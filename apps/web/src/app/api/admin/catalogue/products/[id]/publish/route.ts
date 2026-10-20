// PR 21, 35 — put the product on the shop (only when its checklist passes) or take it off.
import { adminDeps } from '@/lib/admin-auth';
import { productPublishHandler } from '@/lib/catalogue-publish-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productPublishHandler(request, adminDeps(), (await ctx.params).id);
}
