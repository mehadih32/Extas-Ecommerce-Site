// PR 590 — switch an old link off or on, or point it elsewhere (never deleted).
import { adminDeps } from '@/lib/admin-auth';
import { redirectHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return redirectHandler(request, adminDeps(), (await ctx.params).id);
}
