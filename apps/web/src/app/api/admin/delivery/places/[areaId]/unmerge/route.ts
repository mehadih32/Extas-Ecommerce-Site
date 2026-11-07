// Follow-up 417 (PR 502) — undo the latest merge of a merged place: it comes back with its own names; the spellings,
// places, saved addresses and list rows the merge moved go back. Audited; the merge's record is kept, marked undone.
import { adminDeps } from '@/lib/admin-auth';
import { placeUnmergeHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ areaId: string }> }) {
  return placeUnmergeHandler(request, adminDeps(), (await ctx.params).areaId);
}
