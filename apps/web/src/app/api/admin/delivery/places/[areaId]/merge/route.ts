// PR 502 — merge a place into another one: archived, never deleted; its names become the other place's spellings.
import { adminDeps } from '@/lib/admin-auth';
import { placeMergeHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ areaId: string }> }) {
  return placeMergeHandler(request, adminDeps(), (await ctx.params).areaId);
}
