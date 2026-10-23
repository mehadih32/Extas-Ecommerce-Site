// PR 107 — public: "Undo" puts a line that was taken out back into the bag.
import { restoreLineHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return restoreLineHandler(request, bagApiDeps(), (await ctx.params).id);
}
