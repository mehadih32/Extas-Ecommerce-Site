// PR 20 — one category; change, move or archive it (a changed link forwards).
import { adminDeps } from '@/lib/admin-auth';
import { categoryHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return categoryHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return categoryHandler(request, adminDeps(), (await ctx.params).id);
}
