// S15 · PR 339 — one saved funnel's own count over a window (`?from=&to=`, ISO times; without them the last 30
// days): GET only (`reports.read`), never a write — running a funnel changes nothing saved.
import { adminDeps } from '@/lib/admin-auth';
import { funnelRunHandler } from '@/lib/analytics/funnel-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return funnelRunHandler(request, adminDeps(), (await ctx.params).id);
}
