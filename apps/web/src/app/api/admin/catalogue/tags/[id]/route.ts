// PR 32 — change or archive a tag.
import { adminDeps } from '@/lib/admin-auth';
import { tagHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return tagHandler(request, adminDeps(), (await ctx.params).id);
}
