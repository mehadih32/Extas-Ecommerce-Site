// PR 32 — one collection with its products; change or archive it.
import { adminDeps } from '@/lib/admin-auth';
import { collectionHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return collectionHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return collectionHandler(request, adminDeps(), (await ctx.params).id);
}
