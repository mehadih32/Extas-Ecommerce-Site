// PR 15, 16 — rename, pause or archive an account; reset its two-step login.
import { adminDeps } from '@/lib/admin-auth';
import { staffMemberHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return staffMemberHandler(request, adminDeps(), (await ctx.params).id);
}
