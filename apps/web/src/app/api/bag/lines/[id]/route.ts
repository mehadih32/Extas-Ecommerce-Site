// PR 105 / 107 — public: change one bag line (quantity, colour or size, save for later) or take it out (archived).
import { deleteLineHandler, patchLineHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return patchLineHandler(request, bagApiDeps(), (await ctx.params).id);
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return deleteLineHandler(request, bagApiDeps(), (await ctx.params).id);
}
