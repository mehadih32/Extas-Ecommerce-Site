// PR 500 — save a key (then test, then leave mock only on a pass), test, or remove (revoke; nothing is deleted).
import { adminDeps } from '@/lib/admin-auth';
import { integrationHandler } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return integrationHandler(request, adminDeps(), (await ctx.params).id);
}
