// PR 550 — one place on the sub-area list: take it off (archived, never deleted) or move it to another band.
import { adminDeps } from '@/lib/admin-auth';
import { areaHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ areaId: string }> }) {
  return areaHandler(request, adminDeps(), (await ctx.params).areaId);
}
