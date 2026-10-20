// PR 203 — the reason of one counted difference.
import { adminDeps } from '@/lib/admin-auth';
import { auditLineHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return auditLineHandler(request, adminDeps(), (await ctx.params).id);
}
