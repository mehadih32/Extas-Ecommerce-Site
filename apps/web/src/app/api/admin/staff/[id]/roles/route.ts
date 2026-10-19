// PR 16, 495 — give or take a role, in one store or in every store.
import { adminDeps } from '@/lib/admin-auth';
import { staffRolesHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return staffRolesHandler(request, adminDeps(), (await ctx.params).id);
}
