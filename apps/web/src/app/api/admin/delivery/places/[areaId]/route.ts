// PR 502 — one place of the area list: read it, rename it, or replace its alternate spellings.
import { adminDeps } from '@/lib/admin-auth';
import { placeHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ areaId: string }> }) {
  return placeHandler(request, adminDeps(), (await ctx.params).areaId);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ areaId: string }> }) {
  return placeHandler(request, adminDeps(), (await ctx.params).areaId);
}
