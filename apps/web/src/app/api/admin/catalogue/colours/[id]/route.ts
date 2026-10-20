// PR 30 — change a colour, or archive it (never deleted).
import { adminDeps } from '@/lib/admin-auth';
import { colourHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return colourHandler(request, adminDeps(), (await ctx.params).id);
}
