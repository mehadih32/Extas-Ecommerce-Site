// PR 590 — change or archive a brand.
import { adminDeps } from '@/lib/admin-auth';
import { brandHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return brandHandler(request, adminDeps(), (await ctx.params).id);
}
