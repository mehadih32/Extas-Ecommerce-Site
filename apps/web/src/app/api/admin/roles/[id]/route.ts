// PR 495 — change, archive or restore one role.
import { adminDeps } from '@/lib/admin-auth';
import { roleHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return roleHandler(request, adminDeps(), (await ctx.params).id);
}
