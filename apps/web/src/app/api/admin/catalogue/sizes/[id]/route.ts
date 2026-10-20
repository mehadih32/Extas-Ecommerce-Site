// PR 19 — change or archive a size.
import { adminDeps } from '@/lib/admin-auth';
import { sizeHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return sizeHandler(request, adminDeps(), (await ctx.params).id);
}
