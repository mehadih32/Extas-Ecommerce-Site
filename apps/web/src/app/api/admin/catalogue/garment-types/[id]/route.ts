// PR 20 — change or archive a garment type.
import { adminDeps } from '@/lib/admin-auth';
import { garmentTypeHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return garmentTypeHandler(request, adminDeps(), (await ctx.params).id);
}
