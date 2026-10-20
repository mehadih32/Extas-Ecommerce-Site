// PR 19 — one variant; change, retire or restore it (the SKU never changes).
import { adminDeps } from '@/lib/admin-auth';
import { variantHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return variantHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return variantHandler(request, adminDeps(), (await ctx.params).id);
}
