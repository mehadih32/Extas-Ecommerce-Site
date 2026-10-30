// CN-028 · PR 618 — reverse a cost entered on Money → Costs: a negative entry that points at it, with a reason.
import { adminDeps } from '@/lib/admin-auth';
import { reverseCostEntryHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return reverseCostEntryHandler(request, adminDeps(), (await ctx.params).id);
}
