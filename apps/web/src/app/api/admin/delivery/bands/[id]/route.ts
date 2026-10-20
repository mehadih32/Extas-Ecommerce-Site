// PR 550 — one band: its charge, hours and COD limit, on/off (only with its charge), the sub-area mode.
import { adminDeps } from '@/lib/admin-auth';
import { bandHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return bandHandler(request, adminDeps(), (await ctx.params).id);
}
